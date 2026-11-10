import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Download, LogOut, LucideAngularModule, MoonStar, SunMedium, Upload } from 'lucide-angular';
import { NotesFacade } from '../../application/notes.facade';
import { NotesTransferService } from '../../application/services/notes-transfer.service';
import { AuthService } from '../../core/auth/auth.service';
import { MAX_NOTES_PER_USER } from '../../core/models/note.defaults';
import { ThemeService } from '../../core/theme/theme.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { version } from '../../../../package.json';

@Component({
  selector: 'qn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, RouterLink],
  templateUrl: './settings.page.html',
})
export class SettingsPage {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly notesFacade = inject(NotesFacade);
  private readonly notesTransfer = inject(NotesTransferService);
  private readonly toastService = inject(ToastService);

  protected readonly notesCount = computed(() => this.notesFacade.notes().length);
  protected readonly maxNotes = MAX_NOTES_PER_USER;
  protected readonly exportIcon = Download;
  protected readonly importIcon = Upload;

  protected readonly currentTheme = this.themeService.currentTheme;
  protected readonly currentUser = this.authService.currentUser;
  protected readonly appVersion = version;
  protected readonly themeLabel = computed(() =>
    this.currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
  protected readonly darkIcon = MoonStar;
  protected readonly lightIcon = SunMedium;
  protected readonly logoutIcon = LogOut;

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected exportNotes(): void {
    const notes = this.notesFacade.notes();
    if (notes.length === 0) {
      this.toastService.show('You have no notes to export');
      return;
    }
    const url = URL.createObjectURL(this.notesTransfer.buildExportFile(notes));
    const link = document.createElement('a');
    link.href = url;
    link.download = this.notesTransfer.exportFileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  protected async importNotes(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    const result = this.notesTransfer.parseImportFile(await file.text());
    if (!result.ok) {
      this.toastService.show(result.error);
      return;
    }
    if (this.notesFacade.importNotes(result.notes)) {
      const count = result.notes.length;
      this.toastService.show(`Imported ${count} ${count === 1 ? 'note' : 'notes'}`);
    }
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
