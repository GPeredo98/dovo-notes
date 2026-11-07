import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Bold, Highlighter, Italic, LucideAngularModule, Strikethrough, Underline } from 'lucide-angular';
import { HIGHLIGHT_SWATCHES } from '../../constants/note-colors';
import { TextFormatterService } from '../../../application/services/text-formatter.service';

@Component({
  selector: 'qn-formatting-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './formatting-toolbar.component.html',
})
export class FormattingToolbarComponent {
  private readonly formatter = inject(TextFormatterService);

  protected readonly highlightSwatches = HIGHLIGHT_SWATCHES;
  protected readonly showHighlightPicker = signal(false);

  protected readonly activeBold = signal(false);
  protected readonly activeItalic = signal(false);
  protected readonly activeUnderline = signal(false);
  protected readonly activeStrikeThrough = signal(false);
  protected readonly boldIcon = Bold;
  protected readonly italicIcon = Italic;
  protected readonly underlineIcon = Underline;
  protected readonly strikeThroughIcon = Strikethrough;
  protected readonly highlightIcon = Highlighter;

  constructor() {
    const onSelectionChange = () => this.refreshActiveStates();
    document.addEventListener('selectionchange', onSelectionChange);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('selectionchange', onSelectionChange));
  }

  protected preventFocusLoss(event: MouseEvent): void {
    event.preventDefault();
  }

  protected toggle(action: 'bold' | 'italic' | 'underline' | 'strikeThrough'): void {
    this.formatter.toggle(action);
    this.refreshActiveStates();
  }

  protected toggleHighlightPicker(): void {
    this.showHighlightPicker.update((value) => !value);
  }

  protected applyHighlight(color: string): void {
    this.formatter.applyHighlight(color);
    this.showHighlightPicker.set(false);
  }

  protected clearHighlight(): void {
    this.formatter.clearHighlight();
    this.showHighlightPicker.set(false);
  }

  private refreshActiveStates(): void {
    this.activeBold.set(this.formatter.isActive('bold'));
    this.activeItalic.set(this.formatter.isActive('italic'));
    this.activeUnderline.set(this.formatter.isActive('underline'));
    this.activeStrikeThrough.set(this.formatter.isActive('strikeThrough'));
  }
}
