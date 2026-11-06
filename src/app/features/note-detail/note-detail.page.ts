import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule, Pin, Settings2, Trash2 } from 'lucide-angular';
import { NotesFacade } from '../../application/notes.facade';
import { ChecklistEditorService } from '../../application/services/checklist-editor.service';
import { DividerEditorService } from '../../application/services/divider-editor.service';
import { TableEditorService } from '../../application/services/table-editor.service';
import { MAX_NOTE_CONTENT_LENGTH } from '../../core/models/note.defaults';
import { NoteColor } from '../../core/models/note.model';
import { cardClassForColor, NOTE_COLOR_SWATCHES } from '../../shared/constants/note-colors';
import { debounce } from '../../shared/utils/debounce.util';
import { FormattingToolbarComponent } from '../../shared/ui/formatting-toolbar/formatting-toolbar.component';
import { GadgetsToolbarComponent } from '../../shared/ui/gadgets-toolbar/gadgets-toolbar.component';
import { RecentTabsComponent } from '../../shared/ui/recent-tabs/recent-tabs.component';
import { ToastService } from '../../shared/ui/toast/toast.service';

@Component({
  selector: 'qn-note-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, RouterLink, FormattingToolbarComponent, GadgetsToolbarComponent, RecentTabsComponent],
  templateUrl: './note-detail.page.html'
})
export class NoteDetailPage {
  private readonly facade = inject(NotesFacade);
  private readonly router = inject(Router);
  private readonly tableEditor = inject(TableEditorService);
  private readonly checklistEditor = inject(ChecklistEditorService);
  private readonly dividerEditor = inject(DividerEditorService);
  private readonly toastService = inject(ToastService);
  private lastContentLimitToastAt = 0;

  readonly id = input.required<string>();

  protected readonly note = computed(() => this.facade.notes().find((n) => n.id === this.id()));
  protected readonly recentNotes = this.facade.recentNotes;
  protected readonly colorSwatches = NOTE_COLOR_SWATCHES;
  protected readonly cardClass = computed(() => cardClassForColor(this.note()?.color ?? 'default'));
  protected readonly showColorPanel = signal(false);
  protected readonly autoRenameId = signal<string | null>(null);
  protected readonly backIcon = ArrowLeft;
  protected readonly pinIcon = Pin;
  protected readonly trashIcon = Trash2;
  protected readonly settingsIcon = Settings2;

  private readonly editor = viewChild<ElementRef<HTMLDivElement>>('editor');

  private readonly saveContent = debounce((id: string, html: string) => this.facade.updateContent(id, html), 300);
  private detachTableEditor: (() => void) | null = null;
  private detachChecklistEditor: (() => void) | null = null;
  private detachDividerEditor: (() => void) | null = null;

  constructor() {
    effect(() => {
      const editorEl = this.editor();
      if (!editorEl || this.detachTableEditor) {
        return;
      }
      this.detachTableEditor = this.tableEditor.attach(editorEl.nativeElement);
      this.detachChecklistEditor = this.checklistEditor.attach(editorEl.nativeElement);
      this.detachDividerEditor = this.dividerEditor.attach(editorEl.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      this.detachTableEditor?.();
      this.detachChecklistEditor?.();
      this.detachDividerEditor?.();
    });

    effect(() => {
      const id = this.id();
      untracked(() => {
        if (!this.facade.noteById(id)) {
          this.router.navigate(['/']);
          return;
        }
        this.facade.openNote(id);
        void this.facade.refreshNote(id);
        if (this.facade.newNoteId() === id) {
          this.autoRenameId.set(id);
          this.facade.clearNewNoteId();
        }
      });
    });

    effect(() => {
      const id = this.id();
      const editorEl = this.editor();
      const note = this.facade.noteById(id);
      // `contains` also covers nested editables (divider labels, tables) that hold the focus.
      if (!editorEl || editorEl.nativeElement.contains(document.activeElement)) {
        return;
      }
      editorEl.nativeElement.innerHTML = note?.contentHtml ?? '';
    });
  }

  protected onContentInput(): void {
    // Read from the editor root, not `event.target`: input inside a nested editable
    // (divider label, table) targets that element instead of the editor.
    const editorEl = this.editor()?.nativeElement;
    if (!editorEl) {
      return;
    }
    const value = this.tableEditor.getPersistableHtml(editorEl);
    this.saveContent(this.id(), value);
  }

  protected onEditorBeforeInput(event: InputEvent): void {
    if (event.inputType.startsWith('delete') || event.inputType.startsWith('history')) {
      return;
    }

    const editorEl = this.editor()?.nativeElement;
    if (!editorEl) {
      return;
    }
    const currentLength = this.tableEditor.getPersistableHtml(editorEl).length;
    const incomingLength = this.getIncomingInputLength(event);

    if (currentLength + incomingLength > MAX_NOTE_CONTENT_LENGTH) {
      event.preventDefault();
      this.notifyContentLimitReached();
    }
  }

  private getIncomingInputLength(event: InputEvent): number {
    if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
      const html = event.dataTransfer?.getData('text/html');
      const text = event.dataTransfer?.getData('text/plain');
      return (html || text || '').length;
    }
    return event.data?.length ?? 0;
  }

  private notifyContentLimitReached(): void {
    const now = Date.now();
    if (now - this.lastContentLimitToastAt < 2000) {
      return;
    }
    this.lastContentLimitToastAt = now;
    this.toastService.show(`You reach the limite of ${MAX_NOTE_CONTENT_LENGTH} characters on the free plan`);
  }

  protected selectColor(color: NoteColor): void {
    this.facade.updateColor(this.id(), color);
  }

  protected onRenameNote(event: { id: string; title: string }): void {
    this.facade.updateTitle(event.id, event.title);
  }

  protected toggleColorPanel(): void {
    this.showColorPanel.update((value) => !value);
  }

  protected togglePinned(): void {
    this.facade.togglePinned(this.id());
  }

  protected deleteNote(): void {
    this.facade.deleteNote(this.id());
    this.router.navigate(['/']);
  }

  protected openRecentNote(id: string): void {
    this.router.navigate(['/note', id]);
  }

  protected closeRecentTab(id: string): void {
    const wasActiveTab = id === this.id();
    this.facade.removeFromRecent(id);
    if (wasActiveTab) {
      const next = this.recentNotes()[0];
      this.router.navigate(next ? ['/note', next.id] : ['/']);
    }
  }
}
