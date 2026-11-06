import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, Plus, Search, Settings } from 'lucide-angular';
import { NotesFacade } from '../../application/notes.facade';
import { AuthService } from '../../core/auth/auth.service';
import { NoteCardComponent } from '../../shared/ui/note-card/note-card.component';
import { debounce } from '../../shared/utils/debounce.util';
import { stripHtml } from '../../shared/utils/html.util';

const SEARCH_DEBOUNCE_MS = 1000;

@Component({
  selector: 'qn-notes-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, NoteCardComponent],
  templateUrl: './notes-list.page.html',
})
export class NotesListPage {
  private readonly facade = inject(NotesFacade);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly searchTerm = signal('');
  private readonly appliedSearchTerm = signal('');
  private readonly applySearch = debounce((term: string) => this.appliedSearchTerm.set(term), SEARCH_DEBOUNCE_MS);

  protected readonly notes = computed(() => {
    const query = this.appliedSearchTerm().trim().toLowerCase();
    if (!query) {
      return this.facade.notes();
    }
    return this.facade.notes().filter(
      (note) => note.title.toLowerCase().includes(query) || stripHtml(note.contentHtml).toLowerCase().includes(query),
    );
  });
  protected readonly hasNotes = computed(() => this.facade.notes().length > 0);
  protected readonly loading = this.facade.loading;
  protected readonly skeletonCards = [0, 1, 2, 3];
  protected readonly currentUser = this.authService.currentUser;
  protected readonly settingsIcon = Settings;
  protected readonly newNoteIcon = Plus;
  protected readonly searchIcon = Search;

  protected createNote(): void {
    const note = this.facade.createNote();
    if (!note) {
      return;
    }
    this.router.navigate(['/note', note.id]);
  }

  protected openNote(id: string): void {
    this.router.navigate(['/note', id]);
  }

  protected openSettings(): void {
    this.router.navigate(['/settings']);
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    this.applySearch(value);
  }

  protected togglePinned(id: string): void {
    this.facade.togglePinned(id);
  }

  protected deleteNote(id: string): void {
    this.facade.deleteNote(id);
  }
}
