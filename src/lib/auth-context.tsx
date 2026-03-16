import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  login: () => false,
  logout: () => {},
});

const AUTH_KEY = 'typebot-admin-auth';
const VALID_EMAIL = 'jocilejun@gmail.com';
const VALID_PASSWORD = 'hollywood123';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem(AUTH_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(AUTH_KEY, String(isAuthenticated));
  }, [isAuthenticated]);

  const login = (email: string, password: string): boolean => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    console.log('Login debug:', JSON.stringify({ email: trimmedEmail, password: trimmedPassword, expected: VALID_PASSWORD, match: trimmedPassword === VALID_PASSWORD }));
    if (trimmedEmail === VALID_EMAIL && trimmedPassword === VALID_PASSWORD) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_KEY);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
