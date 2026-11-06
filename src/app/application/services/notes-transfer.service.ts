import { Injectable } from '@angular/core';
import { DEFAULT_NOTE_TITLE, MAX_NOTE_CONTENT_LENGTH } from '../../core/models/note.defaults';
import { Note, NoteColor } from '../../core/models/note.model';

export const NOTES_EXPORT_FORMAT = 'jottings-notes';
export const NOTES_EXPORT_VERSION = 1;

export type ImportedNote = Pick<Note, 'title' | 'contentHtml' | 'color' | 'pinned' | 'createdAt' | 'updatedAt'>;

export type ParseResult = { ok: true; notes: ImportedNote[] } | { ok: false; error: string };

const NOTE_COLORS: readonly NoteColor[] = ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
const FORBIDDEN_TAGS = 'script, style, iframe, frame, object, embed, link, meta, base, form, input, button, textarea, select, svg, math';
const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction'];

/** Builds and parses the JSON file used to export and import notes. */
@Injectable({ providedIn: 'root' })
export class NotesTransferService {
  buildExportFile(notes: Note[]): Blob {
    const payload = {
      format: NOTES_EXPORT_FORMAT,
      version: NOTES_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      notes: notes.map(({ title, contentHtml, color, pinned, createdAt, updatedAt }) => ({
        title,
        contentHtml,
        color,
        pinned,
        createdAt,
        updatedAt,
      })),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  exportFileName(): string {
    return `jottings-${new Date().toISOString().slice(0, 10)}.json`;
  }

  parseImportFile(text: string): ParseResult {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: 'The file is not valid JSON' };
    }

    const rawNotes = Array.isArray(data) ? data : (data as { notes?: unknown })?.notes;
    if (!Array.isArray(rawNotes)) {
      return { ok: false, error: 'The file does not contain any jottings' };
    }

    const notes: ImportedNote[] = [];
    for (const raw of rawNotes) {
      if (!raw || typeof raw !== 'object') {
        return { ok: false, error: 'The file contains an invalid jotting' };
      }
      const record = raw as Record<string, unknown>;
      const contentHtml = this.sanitizeHtml(typeof record['contentHtml'] === 'string' ? record['contentHtml'] : '');
      if (contentHtml.length > MAX_NOTE_CONTENT_LENGTH) {
        return {
          ok: false,
          error: `A jotting exceeds the limit of ${MAX_NOTE_CONTENT_LENGTH} characters on the free plan`,
        };
      }
      const title = typeof record['title'] === 'string' ? record['title'].trim() : '';
      const color = NOTE_COLORS.includes(record['color'] as NoteColor) ? (record['color'] as NoteColor) : 'default';
      notes.push({
        title: title || DEFAULT_NOTE_TITLE,
        contentHtml,
        color,
        pinned: record['pinned'] === true,
        createdAt: this.validDate(record['createdAt']),
        updatedAt: this.validDate(record['updatedAt']),
      });
    }

    if (notes.length === 0) {
      return { ok: false, error: 'The file does not contain any jottings' };
    }
    return { ok: true, notes };
  }

  private validDate(value: unknown): string {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toISOString();
    }
    return new Date().toISOString();
  }

  /** Imported files may come from anyone, so strip anything that could run script. */
  private sanitizeHtml(html: string): string {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.body.querySelectorAll(FORBIDDEN_TAGS).forEach((el) => el.remove());
    doc.body.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const isScriptUrl = URL_ATTRIBUTES.includes(name) && /^\s*(javascript|data|vbscript):/i.test(attr.value);
        // Highlights rely on inline `style`, so only drop styles that can load external resources.
        const isUnsafeStyle = name === 'style' && /url\s*\(|expression\s*\(|@import/i.test(attr.value);
        if (name.startsWith('on') || isScriptUrl || isUnsafeStyle) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return doc.body.innerHTML;
  }
}
