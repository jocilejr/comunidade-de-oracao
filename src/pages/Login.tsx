import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isAuthenticated } = useAuth();

  if (isAuthenticated) return <Navigate to="/admin" replace />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = login(email, password);
    if (!success) {
      setError('Email ou senha incorretos.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Acesso Admin</CardTitle>
          <p className="text-sm text-muted-foreground">Faça login para gerenciar seus funis</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                className="rounded-xl"
                autoFocus
              />
              <Input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                className="rounded-xl"
              />
            </div>
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <Button type="submit" className="w-full rounded-xl font-semibold">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
