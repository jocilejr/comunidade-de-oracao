import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  signup: async () => ({ success: false }),
  logout: async () => {},
});

function isPublicDomain(): boolean {
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (!publicDomain) return false;
  try {
    return window.location.origin === new URL(publicDomain).origin;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // On public domain, skip auth entirely — no loading delay
  const publicOnly = isPublicDomain();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!publicOnly);

  useEffect(() => {
    if (publicOnly) return; // No auth needed on public domain

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [publicOnly]);

  const login = async (email: string, password: string) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      clearTimeout(timeout);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('Failed to fetch')) {
        return { success: false, error: 'Não foi possível conectar ao servidor. Verifique sua conexão.' };
      }
      return { success: false, error: err?.message || 'Erro desconhecido' };
    }
  };

  const signup = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch')) {
        return { success: false, error: 'Não foi possível conectar ao servidor. Verifique sua conexão.' };
      }
      return { success: false, error: err?.message || 'Erro desconhecido' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
