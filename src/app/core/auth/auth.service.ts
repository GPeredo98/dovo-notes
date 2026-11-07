import { Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/supabase-client';

export interface AuthResult {
  success: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<string | null>(null);
  readonly currentUserId = signal<string | null>(null);

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = supabase.auth.getSession().then(({ data }) => {
      this.applySession(data.session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
    });
  }

  ensureReady(): Promise<void> {
    return this.readyPromise;
  }

  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !password.trim()) {
      return { success: false, message: 'Email and password are required.' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true };
  }

  async register(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !password.trim()) {
      return { success: false, message: 'Email and password are required.' };
    }
    if (password.length < 6) {
      return { success: false, message: 'Password must contain at least 6 characters.' };
    }

    const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
    if (error) {
      return { success: false, message: error.message };
    }
    if (!data.session) {
      return { success: true, message: 'Check your email to confirm your account before signing in.' };
    }

    return { success: true };
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  }

  private applySession(session: Session | null): void {
    this.currentUser.set(session?.user.email ?? null);
    this.currentUserId.set(session?.user.id ?? null);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
