import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { supabase } from '../supabase/supabase-client';

export type ThemeMode = 'dark' | 'light';

/** Must match the body background for each theme in styles.css. */
const THEME_COLORS: Record<ThemeMode, string> = {
  dark: '#0a0a0a',
  light: '#fafafa',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly authService = inject(AuthService);

  readonly currentTheme = signal<ThemeMode>('dark');

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.applyTheme(this.currentTheme());

    effect(() => {
      const userId = this.authService.currentUserId();
      if (userId) {
        void this.loadTheme(userId);
      }
    });
  }

  toggleTheme(): void {
    this.setTheme(this.currentTheme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: ThemeMode): void {
    this.currentTheme.set(theme);
    this.applyTheme(theme);

    const userId = this.authService.currentUserId();
    if (userId) {
      void this.saveTheme(userId, theme);
    }
  }

  private async loadTheme(userId: string): Promise<void> {
    const { data, error } = await supabase.from('profiles').select('theme').eq('id', userId).maybeSingle();
    if (error) {
      console.error('Failed to load theme preference', error);
      return;
    }

    const theme: ThemeMode = data?.theme === 'light' ? 'light' : 'dark';
    this.currentTheme.set(theme);
    this.applyTheme(theme);
  }

  private async saveTheme(userId: string, theme: ThemeMode): Promise<void> {
    const { error } = await supabase.from('profiles').upsert({ id: userId, theme });
    if (error) {
      console.error('Failed to save theme preference', error);
    }
  }

  private applyTheme(theme: ThemeMode): void {
    const root = this.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
    // Keep the system bars (Android status bar, task switcher) in sync with the app background.
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme]);
  }
}
