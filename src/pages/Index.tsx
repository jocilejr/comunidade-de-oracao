import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, Upload, Globe } from 'lucide-react';

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center max-w-lg space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Typebot Runtime
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Renderize seus funis do Typebot com carregamento instantâneo, sem dependências externas. Faça upload do JSON exportado e tenha seu funil rodando em segundos.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 text-left">
            <Upload className="w-5 h-5 text-primary mb-2" />
            <h3 className="text-sm font-semibold text-foreground">Upload simples</h3>
            <p className="text-xs text-muted-foreground mt-1">Arraste o JSON do Typebot e pronto</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-left">
            <Globe className="w-5 h-5 text-primary mb-2" />
            <h3 className="text-sm font-semibold text-foreground">URLs únicas</h3>
            <p className="text-xs text-muted-foreground mt-1">Cada funil com seu próprio link</p>
          </div>
        </div>

        <Link to="/admin">
          <Button size="lg" className="rounded-xl px-8 font-semibold">
            Acessar Painel Admin
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default Index;
