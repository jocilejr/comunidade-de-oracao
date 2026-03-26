import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

// Páginas — sempre lazy para separar os chunks
const Index = lazy(() => import("./pages/Index.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const Funnel = lazy(() => import("./pages/Funnel.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// UI pesada (Radix UI) — lazy para não entrar no bundle público
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })));
const TooltipProvider = lazy(() => import("@/components/ui/tooltip").then(m => ({ default: m.TooltipProvider })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Detecta se estamos no domínio público (só funis) */
function isPublicDomain(): boolean {
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (!publicDomain) return false;
  try {
    const publicOrigin = new URL(publicDomain).origin;
    return window.location.origin === publicOrigin;
  } catch {
    return false;
  }
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Carregando...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/**
 * App leve para o domínio PÚBLICO.
 * Sem Toaster/Sonner/Tooltip/AuthProvider/ThemeProvider — não carrega o CSS pesado do Radix UI.
 */
const PublicApp = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/:slug" element={<Funnel />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </QueryClientProvider>
);

/**
 * App completo para o domínio do DASHBOARD.
 * Carrega todos os providers e componentes UI.
 */
const DashboardApp = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <Suspense fallback={null}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                  <Route path="/:slug" element={<Funnel />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

const App = () => isPublicDomain() ? <PublicApp /> : <DashboardApp />;

export default App;
