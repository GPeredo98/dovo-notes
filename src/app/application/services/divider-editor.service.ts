import { Injectable } from '@angular/core';

const PLAIN_DIVIDER_SELECTOR = 'hr.qn-hr';
const LABELED_DIVIDER_SELECTOR = '.qn-hr-labeled';
const LABEL_SELECTOR = '.qn-hr-label';

/**
 * Lets the user click a divider to write a label in its middle.
 * A labeled divider whose label is left empty turns back into a plain divider.
 */
@Injectable({ providedIn: 'root' })
export class DividerEditorService {
  attach(root: HTMLElement): () => void {
    const onClick = (event: MouseEvent) => this.handleClick(root, event);
    const onKeydown = (event: KeyboardEvent) => this.handleKeydown(root, event);
    const onFocusOut = (event: FocusEvent) => this.handleFocusOut(root, event);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
      root.removeEventListener('focusout', onFocusOut);
    };
  }

  private handleClick(root: HTMLElement, event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.matches(PLAIN_DIVIDER_SELECTOR) && root.contains(target)) {
      event.preventDefault();
      const labeled = this.createLabeledDivider();
      target.replaceWith(labeled);
      this.focusLabel(labeled.querySelector<HTMLElement>(LABEL_SELECTOR)!);
      return;
    }

    const labeled = target.closest<HTMLElement>(LABELED_DIVIDER_SELECTOR);
    if (labeled && root.contains(labeled) && !target.closest(LABEL_SELECTOR)) {
      event.preventDefault();
      this.focusLabel(labeled.querySelector<HTMLElement>(LABEL_SELECTOR)!);
    }
  }

  private handleKeydown(root: HTMLElement, event: KeyboardEvent): void {
    const label = (event.target as HTMLElement).closest?.<HTMLElement>(LABEL_SELECTOR);
    if (!label || !root.contains(label) || event.key !== 'Enter') {
      return;
    }
    // A label is a single line: Enter moves the caret to the line below the divider.
    event.preventDefault();
    const divider = label.closest(LABELED_DIVIDER_SELECTOR)!;
    let next = divider.nextElementSibling;
    if (!next) {
      next = document.createElement('p');
      next.appendChild(document.createElement('br'));
      divider.after(next);
    }
    root.focus();
    const range = document.createRange();
    range.setStart(next, 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private handleFocusOut(root: HTMLElement, event: FocusEvent): void {
    const label = (event.target as HTMLElement).closest?.<HTMLElement>(LABEL_SELECTOR);
    if (!label || !root.contains(label)) {
      return;
    }
    if ((label.textContent ?? '').trim().length === 0) {
      const hr = document.createElement('hr');
      hr.className = 'qn-hr';
      label.closest(LABELED_DIVIDER_SELECTOR)?.replaceWith(hr);
    }
    root.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private createLabeledDivider(): HTMLDivElement {
    const divider = document.createElement('div');
    divider.className = 'qn-hr-labeled';
    divider.setAttribute('contenteditable', 'false');

    const label = document.createElement('span');
    label.className = 'qn-hr-label';
    label.setAttribute('contenteditable', 'true');
    label.setAttribute('spellcheck', 'false');

    divider.appendChild(label);
    return divider;
  }

  private focusLabel(label: HTMLElement): void {
    label.focus();
    const range = document.createRange();
    range.selectNodeContents(label);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}
