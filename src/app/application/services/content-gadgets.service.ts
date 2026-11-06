import { Injectable } from '@angular/core';

interface EditorLine {
  nodes: Node[];
  lineBreak: Node | null;
  /** Text block (p/div) the line lives in, or null when it sits directly in the editor root. */
  block: HTMLElement | null;
  existingItem: HTMLElement | null;
}

const TEXT_BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
const BLOCK_TAGS = new Set([...TEXT_BLOCK_TAGS, 'HR', 'TABLE', 'UL', 'OL', 'PRE']);

@Injectable({ providedIn: 'root' })
export class ContentGadgetsService {
  insertDivider(): void {
    document.execCommand('insertHTML', false, '<hr class="qn-hr"><p><br></p>');
  }

  insertTable(): void {
    document.execCommand('insertHTML', false, `${this.buildTableHtml(2, 2)}<p><br></p>`);
  }

  insertChecklistItem(): void {
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = range ? this.closestElement(range.startContainer) : null;
    const editorRoot = anchor?.closest<HTMLElement>('[contenteditable="true"]');
    if (!selection || !range || !anchor || !editorRoot) {
      return;
    }

    if (!range.collapsed) {
      this.toggleChecklistForSelection(editorRoot, range, selection);
      return;
    }

    const currentLine = anchor.closest('.qn-checklist-item, p, div');
    const referenceBlock = currentLine && currentLine !== editorRoot ? currentLine : null;

    const item = this.createChecklistItemElement();
    if (referenceBlock?.parentElement) {
      referenceBlock.parentElement.insertBefore(item, referenceBlock.nextSibling);
    } else {
      editorRoot.appendChild(item);
    }

    const textNode = item.querySelector('.qn-checklist-text')?.firstChild;
    if (textNode) {
      const textRange = document.createRange();
      textRange.setStart(textNode, textNode.textContent?.length ?? 0);
      textRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(textRange);
    }

    editorRoot.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Turns every selected line into a checklist item. If all selected lines already are
   * checklist items, they are turned back into plain lines instead.
   */
  private toggleChecklistForSelection(editorRoot: HTMLElement, range: Range, selection: Selection): void {
    const selectedLines = this.collectLines(editorRoot).filter((line) => this.isLineSelected(line.nodes, range));
    if (selectedLines.length === 0) {
      return;
    }

    const touched: Node[] = [];
    const markEdges = (node: Node) => touched.push(node);

    if (selectedLines.every((line) => line.existingItem)) {
      for (const line of selectedLines) {
        const item = line.existingItem!;
        const plain = document.createElement('div');
        const text = item.querySelector('.qn-checklist-text');
        plain.append(...Array.from(text?.childNodes ?? []));
        if (!plain.hasChildNodes()) {
          plain.appendChild(document.createElement('br'));
        }
        item.replaceWith(plain);
        markEdges(plain);
      }
    } else {
      const touchedBlocks = new Set<HTMLElement>();
      for (const line of selectedLines) {
        if (line.existingItem) {
          markEdges(line.existingItem.querySelector('.qn-checklist-text') ?? line.existingItem);
          continue;
        }
        const item = this.createChecklistItemElement();
        const text = item.querySelector('.qn-checklist-text')!;
        line.nodes[0].parentNode!.insertBefore(item, line.nodes[0]);
        text.replaceChildren(...line.nodes);
        line.lineBreak?.parentNode?.removeChild(line.lineBreak);
        if (line.block) {
          touchedBlocks.add(line.block);
        }
        markEdges(text);
      }
      touchedBlocks.forEach((block) => this.unwrapBlock(block));
    }

    if (touched.length) {
      const last = touched[touched.length - 1];
      const newRange = document.createRange();
      newRange.setStart(touched[0], 0);
      newRange.setEnd(last, last.childNodes.length);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }

    editorRoot.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Splits the editor content into visual lines (separated by blocks or `<br>`). */
  private collectLines(editorRoot: HTMLElement): EditorLine[] {
    const lines: EditorLine[] = [];
    let inlineRun: Node[] = [];

    const flush = (block: HTMLElement | null) => {
      lines.push(...this.splitByLineBreaks(inlineRun, block));
      inlineRun = [];
    };

    for (const child of Array.from(editorRoot.childNodes)) {
      if (!(child instanceof HTMLElement) || !BLOCK_TAGS.has(child.tagName)) {
        inlineRun.push(child);
        continue;
      }
      flush(null);
      if (child.classList.contains('qn-checklist-item')) {
        lines.push({ nodes: [child], lineBreak: null, block: null, existingItem: child });
      } else if (TEXT_BLOCK_TAGS.has(child.tagName) && !child.matches('[contenteditable="false"]')) {
        inlineRun = Array.from(child.childNodes);
        flush(child);
      }
    }
    flush(null);
    return lines;
  }

  private splitByLineBreaks(nodes: Node[], block: HTMLElement | null): EditorLine[] {
    const lines: EditorLine[] = [];
    let current: Node[] = [];
    for (const node of nodes) {
      if (node.nodeName === 'BR') {
        if (current.length) {
          lines.push({ nodes: current, lineBreak: node, block, existingItem: null });
        }
        current = [];
      } else {
        current.push(node);
      }
    }
    if (current.length) {
      lines.push({ nodes: current, lineBreak: null, block, existingItem: null });
    }
    return lines;
  }

  /** A line counts as selected only if the selection covers at least one of its characters. */
  private isLineSelected(nodes: Node[], range: Range): boolean {
    const lineText = nodes.map((node) => node.textContent ?? '').join('');
    if (lineText.trim().length === 0) {
      return false;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];

    const beforeEnd = document.createRange();
    beforeEnd.setStartBefore(first);
    beforeEnd.setEnd(range.endContainer, range.endOffset);

    const afterStart = document.createRange();
    afterStart.setStart(range.startContainer, range.startOffset);
    afterStart.setEndAfter(last);

    return beforeEnd.toString().length > 0 && afterStart.toString().length > 0;
  }

  /** Removes a wrapper block, keeping checklist items as siblings and re-wrapping leftover text. */
  private unwrapBlock(block: HTMLElement): void {
    const parent = block.parentNode;
    if (!parent) {
      return;
    }
    let leftover: HTMLElement | null = null;
    for (const child of Array.from(block.childNodes)) {
      if (child instanceof HTMLElement && child.classList.contains('qn-checklist-item')) {
        leftover = null;
        parent.insertBefore(child, block);
        continue;
      }
      if (!leftover) {
        leftover = document.createElement(block.tagName.toLowerCase());
        parent.insertBefore(leftover, block);
      }
      leftover.appendChild(child);
    }
    block.remove();
    parent.querySelectorAll(':scope > div:empty, :scope > p:empty').forEach((el) => el.remove());
  }

  private createChecklistItemElement(): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'qn-checklist-item';

    const checkbox = document.createElement('span');
    checkbox.className = 'qn-checkbox';
    checkbox.setAttribute('contenteditable', 'false');
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('aria-checked', 'false');

    const text = document.createElement('span');
    text.className = 'qn-checklist-text';
    text.appendChild(document.createTextNode(' '));

    item.append(checkbox, text);
    return item;
  }

  private closestElement(node: Node): Element | null {
    return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  }

  private buildTableHtml(rows: number, cols: number): string {
    const cell = '<td class="qn-td"><br></td>';
    const row = `<tr>${cell.repeat(cols)}</tr>`;
    const body = row.repeat(rows);
    return `<div class="qn-table-wrap" contenteditable="false"><table class="qn-table" contenteditable="true"><tbody>${body}</tbody></table></div>`;
  }
}
