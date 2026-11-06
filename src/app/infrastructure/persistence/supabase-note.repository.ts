import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Note } from '../../core/models/note.model';
import { DEFAULT_NOTE_OWNER } from '../../core/models/note.defaults';
import {
  NoteChange,
  NoteRepository,
  NoteUpdateOutcome,
  RemoteNoteEvent,
} from '../../core/ports/note-repository.port';
import { supabase } from '../../core/supabase/supabase-client';
import { NoteRow, mapChangesToRow, mapNoteToRow, mapRowToNote } from './note.mapper';

@Injectable()
export class SupabaseNoteRepository implements NoteRepository {
  private readonly authService = inject(AuthService);

  async getAll(): Promise<Note[] | null> {
    const userId = this.authService.currentUserId();
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load notes', error);
      return null;
    }

    const owner = this.authService.currentUser() ?? DEFAULT_NOTE_OWNER;
    return (data as NoteRow[]).map((row) => mapRowToNote(row, owner));
  }

  async getById(id: string): Promise<Note | null> {
    const userId = this.authService.currentUserId();
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error('Failed to load note', error);
      }
      return null;
    }

    const owner = this.authService.currentUser() ?? DEFAULT_NOTE_OWNER;
    return mapRowToNote(data as NoteRow, owner);
  }

  async create(note: Note): Promise<void> {
    const userId = this.authService.currentUserId();
    if (!userId) {
      return;
    }

    const { error } = await supabase.from('notes').insert(mapNoteToRow(note, userId));
    if (error) {
      console.error('Failed to create note', error);
    }
  }

  async update(
    id: string,
    changes: NoteChange,
    updatedAt: string,
    baseUpdatedAt: string,
  ): Promise<NoteUpdateOutcome> {
    const userId = this.authService.currentUserId();
    if (!userId) {
      return { conflict: false };
    }

    const { data, error } = await supabase
      .from('notes')
      .update({ ...mapChangesToRow(changes), updated_at: updatedAt })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('updated_at', baseUpdatedAt)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Failed to update note', error);
      return { conflict: false };
    }

    if (data) {
      return { conflict: false, updatedAt };
    }

    const { data: latestRow, error: fetchError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !latestRow) {
      console.error('Failed to resolve note conflict', fetchError);
      return { conflict: false };
    }

    const owner = this.authService.currentUser() ?? DEFAULT_NOTE_OWNER;
    return { conflict: true, latest: mapRowToNote(latestRow as NoteRow, owner) };
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete note', error);
    }
  }

  subscribeToChanges(
    userId: string,
    onEvent: (event: RemoteNoteEvent) => void,
    onReconnect?: () => void,
  ): () => void {
    const owner = this.authService.currentUser() ?? DEFAULT_NOTE_OWNER;
    let hasSubscribedBefore = false;
    const channel = supabase
      .channel(`notes-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<NoteRow>;
            if (oldRow.id) {
              onEvent({ type: 'delete', id: oldRow.id });
            }
            return;
          }
          onEvent({ type: 'upsert', note: mapRowToNote(payload.new as NoteRow, owner) });
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error('Notes realtime subscription failed', status, err);
        } else {
          console.log('Notes realtime subscription status', status);
        }
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedBefore) {
            onReconnect?.();
          }
          hasSubscribedBefore = true;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }
}
