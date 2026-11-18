import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ListTodo, LucideAngularModule, SeparatorHorizontal, SquareCode, Table } from 'lucide-angular';
import { ContentGadgetsService } from '../../../application/services/content-gadgets.service';

@Component({
  selector: 'qn-gadgets-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './gadgets-toolbar.component.html',
})
export class GadgetsToolbarComponent {
  private readonly gadgets = inject(ContentGadgetsService);

  protected readonly dividerIcon = SeparatorHorizontal;
  protected readonly tableIcon = Table;
  protected readonly checklistIcon = ListTodo;
  protected readonly codeIcon = SquareCode;

  protected preventFocusLoss(event: MouseEvent): void {
    event.preventDefault();
  }

  protected insertDivider(): void {
    this.gadgets.insertDivider();
  }

  protected insertTable(): void {
    this.gadgets.insertTable();
  }

  protected insertChecklistItem(): void {
    this.gadgets.insertChecklistItem();
  }

  protected insertCodeBlock(): void {
    this.gadgets.insertCodeBlock();
  }
}
