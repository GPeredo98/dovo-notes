import { Injectable, inject } from '@angular/core';
import { ToastService } from '../../shared/ui/toast/toast.service';

const BLOCK_SELECTOR = '.qn-code';
const BODY_SELECTOR = '.qn-code-body';
const COPY_SELECTOR = '.qn-code-copy';
const INDENT = '  ';

/**
 * Behaviour for code fragments inserted via the gadgets toolbar:
 * copy button, plain-text editing (Enter = new line, Tab = indent, paste without formatting),
 * Escape to leave the block and Backspace on an empty block to remove it.
 */
@Injectable({ providedIn: 'root' })
export class CodeBlockEditorService {
  private readonly toastService = inject(ToastService);

  attach(root: HTMLElement): () => void {
    const onMouseDown = (event: MouseEvent) => this.handleMouseDown(root, event);
    const onClick = (event: MouseEvent) => this.handleClick(root, event);
    const onKeydown = (event: KeyboardEvent) => this.handleKeydown(root, event);
    const onPaste = (event: ClipboardEvent) => this.handlePaste(root, event);
    root.addEventListener('mousedown', onMouseDown);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('paste', onPaste);
    return () => {
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
      root.removeEventListener('paste', onPaste);
    };
  }

  private handleMouseDown(root: HTMLElement, event: MouseEvent): void {
    const copy = (event.target as HTMLElement).closest(COPY_SELECTOR);
    if (copy && root.contains(copy)) {
      // Keep the caret where it is.
      event.preventDefault();
    }
  }

  private handleClick(root: HTMLElement, event: MouseEvent): void {
    const copy = (event.target as HTMLElement).closest<HTMLElement>(COPY_SELECTOR);
    if (!copy || !root.contains(copy)) {
      return;
    }
    event.preventDefault();
    const body = copy.closest(BLOCK_SELECTOR)?.querySelector<HTMLElement>(BODY_SELECTOR);
    const code = body ? this.readCode(body) : '';
    if (!code.trim()) {
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => this.toastService.show('Code copied to clipboard'),
      () => this.toastService.show("Couldn't copy the code"),
    );
  }

  private handleKeydown(root: HTMLElement, event: KeyboardEvent): void {
    const body = this.bodyFromSelection(root);
    if (!body) {
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.execCommand('insertLineBreak');
      return;
    }

    if ((event.key === 'Enter' && (event.ctrlKey || event.metaKey)) || event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.exitBlock(root, body.closest<HTMLElement>(BLOCK_SELECTOR)!);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      document.execCommand('insertText', false, INDENT);
      return;
    }

    if (event.key === 'Backspace' && this.readCode(body).length === 0) {
      event.preventDefault();
      const block = body.closest<HTMLElement>(BLOCK_SELECTOR)!;
      const paragraph = this.createEmptyParagraph();
      block.replaceWith(paragraph);
      this.placeCaret(root, paragraph);
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  private handlePaste(root: HTMLElement, event: ClipboardEvent): void {
    if (!this.bodyFromSelection(root)) {
      return;
    }
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'));
  }

  private exitBlock(root: HTMLElement, block: HTMLElement): void {
    let next = block.nextElementSibling as HTMLElement | null;
    if (!next || next.matches(BLOCK_SELECTOR) || next.matches('[contenteditable="false"]')) {
      next = this.createEmptyParagraph();
      block.after(next);
    }
    this.placeCaret(root, next);
    root.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private bodyFromSelection(root: HTMLElement): HTMLElement | null {
    const node = document.getSelection()?.anchorNode;
    const element = node ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement) : null;
    const body = element?.closest<HTMLElement>(BODY_SELECTOR) ?? null;
    return body && root.contains(body) ? body : null;
  }

  private readCode(body: HTMLElement): string {
    // innerText turns <br> into new lines; drop the trailing break browsers keep in empty lines.
    return body.innerText.replace(/\n$/, '');
  }

  private createEmptyParagraph(): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.appendChild(document.createElement('br'));
    return paragraph;
  }

  private placeCaret(root: HTMLElement, target: HTMLElement): void {
    root.focus();
    const range = document.createRange();
    range.setStart(target, 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}
