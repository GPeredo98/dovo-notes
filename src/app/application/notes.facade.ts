import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { Note, NoteColor } from '../core/models/note.model';
import {
  DEFAULT_NOTE_OWNER,
  DEFAULT_NOTE_TITLE,
  MAX_NOTES_PER_USER,
  MAX_RECENT_NOTES,
} from '../core/models/note.defaults';
import { NOTE_REPOSITORY, NoteChange } from '../core/ports/note-repository.port';
import { RECENT_NOTES_REPOSITORY } from '../core/ports/recent-notes-repository.port';
import { ToastService } from '../shared/ui/toast/toast.service';

@Injectable({ providedIn: 'root' })
export class NotesFacade {
  private readonly noteRepository = inject(NOTE_REPOSITORY);
  private readonly recentNotesRepository = inject(RECENT_NOTES_REPOSITORY);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  private readonly notesState = signal<Note[]>([]);
  private readonly recentIdsState = signal<string[]>([]);

  readonly newNoteId = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.authService.currentUser();
      void this.reload();
    });

    effect((onCleanup) => {
      const userId = this.authService.currentUserId();
      if (!userId) {
        return;
      }
      const unsubscribe = this.noteRepository.subscribeToChanges(
        userId,
        (event) => {
          if (event.type === 'delete') {
            this.notesState.update((notes) => notes.filter((note) => note.id !== event.id));
          } else {
            this.applyRemoteNote(event.note);
          }
        },
        () => void this.resync(),
      );

      // Realtime does not replay events missed while the socket was down (e.g. a phone
      // in background or a sleeping tab), so resync whenever the app comes back.
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          void this.resync();
        }
      };
      const onOnline = () => void this.resync();
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('online', onOnline);

      onCleanup(() => {
        unsubscribe();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('online', onOnline);
      });
    });
  }

  private readonly pendingCreateIds = new Set<string>();

  private async reload(): Promise<void> {
    const [notes, recentIds] = await Promise.all([
      this.noteRepository.getAll(),
      this.recentNotesRepository.getRecentIds(),
    ]);
    this.notesState.set(notes ?? []);
    this.recentIdsState.set(recentIds);
  }

  /** Merges the server state into the local one without discarding newer local edits. */
  private async resync(): Promise<void> {
    const remoteNotes = await this.noteRepository.getAll();
    if (!remoteNotes) {
      return;
    }
    const remoteIds = new Set(remoteNotes.map((note) => note.id));
    this.notesState.update((localNotes) =>
      localNotes.filter((note) => remoteIds.has(note.id) || this.pendingCreateIds.has(note.id)),
    );
    remoteNotes.forEach((note) => this.applyRemoteNote(note));
  }

  /** Fetches the latest server version of a note, e.g. when it is opened. */
  async refreshNote(id: string): Promise<void> {
    const latest = await this.noteRepository.getById(id);
    if (latest) {
      this.applyRemoteNote(latest);
    }
  }

  readonly notes: Signal<Note[]> = computed(() =>
    [...this.notesState()].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }),
  );

  readonly recentNotes: Signal<Note[]> = computed(() => {
    const notes = this.notesState();
    return this.recentIdsState()
      .map((id) => notes.find((note) => note.id === id))
      .filter((note): note is Note => note !== undefined);
  });

  noteById(id: string): Note | undefined {
    return this.notesState().find((note) => note.id === id);
  }

  createNote(): Note | null {
    if (this.notesState().length >= MAX_NOTES_PER_USER) {
      this.toastService.show(`You reach the limite of ${MAX_NOTES_PER_USER} jottings on the free plan`);
      return null;
    }

    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: DEFAULT_NOTE_TITLE,
      contentHtml: '',
      createdAt: now,
      updatedAt: now,
      owner: this.authService.currentUser() ?? DEFAULT_NOTE_OWNER,
      color: 'default',
      pinned: false,
    };
    this.notesState.update((notes) => [...notes, note]);
    this.pendingCreateIds.add(note.id);
    void this.noteRepository.create(note).finally(() => this.pendingCreateIds.delete(note.id));
    this.newNoteId.set(note.id);
    return note;
  }

  clearNewNoteId(): void {
    this.newNoteId.set(null);
  }

  updateTitle(id: string, title: string): void {
    this.updateNote(id, { title: title.trim() || DEFAULT_NOTE_TITLE });
  }

  updateContent(id: string, contentHtml: string): void {
    this.updateNote(id, { contentHtml });
  }

  updateColor(id: string, color: NoteColor): void {
    this.updateNote(id, { color });
  }

  togglePinned(id: string): void {
    const note = this.noteById(id);
    if (!note) {
      return;
    }
    this.updateNote(id, { pinned: !note.pinned });
  }

  deleteNote(id: string): void {
    this.notesState.update((notes) => notes.filter((note) => note.id !== id));
    void this.noteRepository.delete(id);
    this.removeFromRecent(id);
  }

  openNote(id: string): void {
    if (!this.noteById(id)) {
      return;
    }
    this.recentIdsState.update((ids) => {
      const withoutId = ids.filter((recentId) => recentId !== id);
      return [id, ...withoutId].slice(0, MAX_RECENT_NOTES);
    });
    void this.recentNotesRepository.saveRecentIds(this.recentIdsState());
  }

  removeFromRecent(id: string): void {
    this.recentIdsState.update((ids) => ids.filter((recentId) => recentId !== id));
    void this.recentNotesRepository.saveRecentIds(this.recentIdsState());
  }

  private updateNote(id: string, changes: NoteChange): void {
    const current = this.noteById(id);
    if (!current) {
      return;
    }
    const baseUpdatedAt = current.updatedAt;
    const updatedAt = new Date().toISOString();
    const updated: Note = { ...current, ...changes, updatedAt };
    this.notesState.update((notes) => notes.map((note) => (note.id === id ? updated : note)));
    void this.persistUpdate(id, changes, updatedAt, baseUpdatedAt);
  }

  private async persistUpdate(
    id: string,
    changes: NoteChange,
    updatedAt: string,
    baseUpdatedAt: string,
    isRetry = false,
  ): Promise<void> {
    const outcome = await this.noteRepository.update(id, changes, updatedAt, baseUpdatedAt);
    if (!outcome.conflict || !outcome.latest || isRetry) {
      return;
    }

    this.applyRemoteNote(outcome.latest);
    const current = this.noteById(id);
    if (!current) {
      return;
    }
    const retryUpdatedAt = new Date().toISOString();
    const reconciled: Note = { ...current, ...changes, updatedAt: retryUpdatedAt };
    this.notesState.update((notes) => notes.map((note) => (note.id === id ? reconciled : note)));
    await this.persistUpdate(id, changes, retryUpdatedAt, outcome.latest.updatedAt, true);
  }

  private applyRemoteNote(note: Note): void {
    this.notesState.update((notes) => {
      const index = notes.findIndex((existing) => existing.id === note.id);
      if (index === -1) {
        return [...notes, note];
      }
      if (Date.parse(notes[index].updatedAt) >= Date.parse(note.updatedAt)) {
        return notes;
      }
      const next = [...notes];
      next[index] = note;
      return next;
    });
  }
}
