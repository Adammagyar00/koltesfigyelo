import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth } from '@/services/firebase';

interface AuthState {
  user: User | null;
  /** Igaz, amíg nem tudjuk, be van-e jelentkezve (app indításkor). */
  initializing: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function requireAuth() {
  if (!auth) throw new Error('A Firebase nincs beállítva.');
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  const value: AuthState = {
    user,
    initializing,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
    },
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(requireAuth(), email.trim());
    },
    signOut: async () => {
      await fbSignOut(requireAuth());
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth csak AuthProvider-en belül használható');
  return ctx;
}

/** Firebase hibakódok magyarul. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Érvénytelen e-mail-cím.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Hibás e-mail-cím vagy jelszó.';
    case 'auth/email-already-in-use':
      return 'Ezzel az e-mail-címmel már van fiók.';
    case 'auth/weak-password':
      return 'A jelszó legalább 6 karakter legyen.';
    case 'auth/too-many-requests':
      return 'Túl sok próbálkozás. Várj egy kicsit, és próbáld újra.';
    case 'auth/network-request-failed':
      return 'Nincs internetkapcsolat.';
    default:
      return (e as Error)?.message ?? 'Ismeretlen hiba történt.';
  }
}
