import { useState, useRef, useCallback, useEffect } from 'react';
import { getAllFunnels, saveFunnel, deleteFunnel, updateFunnelSlug, validateTypebotJson, slugify } from '@/lib/funnel-storage';
import { StoredFunnel } from '@/lib/typebot-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, ExternalLink, Pencil, Check, X, Eye, LogOut, Sun, Moon, User, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import ChatRenderer from '@/components/chat/ChatRenderer';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface BotProfile {
  name: string;
  avatarUrl: string;
}

const loadBotProfile = (): BotProfile => {
  try {
    const raw = localStorage.getItem('bot-profile');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: '', avatarUrl: '' };
};

const Admin = () => {
  const [funnels, setFunnels] = useState<StoredFunnel[]>(getAllFunnels());
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewFunnel, setPreviewFunnel] = useState<StoredFunnel | null>(null);
  const [botProfile, setBotProfile] = useState<BotProfile>(loadBotProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const refresh = () => setFunnels(getAllFunnels());

  const handleFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = validateTypebotJson(json);

      if (!result.valid || !result.flow) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        return;
      }

      const name = result.flow.name || file.name.replace('.json', '');
      const slug = slugify(name) || 'funil-' + Date.now();
      saveFunnel(name, slug, result.flow);
      refresh();
      toast({ title: 'Funil adicionado!', description: `"${name}" disponível em /f/${slug}` });
    } catch {
      toast({ title: 'Erro', description: 'Arquivo JSON inválido.', variant: 'destructive' });
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.json')) handleFile(file);
  }, [handleFile]);

  const handleDelete = (slug: string, name: string) => {
    deleteFunnel(slug);
    refresh();
    toast({ title: 'Excluído', description: `"${name}" foi removido.` });
  };

  const handleSlugSave = (oldSlug: string) => {
    if (!newSlug.trim()) return;
    const success = updateFunnelSlug(oldSlug, newSlug);
    if (success) {
      setEditingSlug(null);
      refresh();
      toast({ title: 'Slug atualizado!' });
    } else {
      toast({ title: 'Erro', description: 'Slug já existe.', variant: 'destructive' });
    }
  };

  const handleProfileSave = () => {
    localStorage.setItem('bot-profile', JSON.stringify(botProfile));
    toast({ title: 'Perfil salvo!' });
  };

  // Preview mode — mobile frame
  if (previewFunnel) {
    return (
      <div className="flex items-center justify-center h-screen bg-muted/50">
        <div className="relative">
          {/* Close button */}
          <div className="absolute -top-12 right-0 z-50">
            <Button variant="secondary" size="sm" className="rounded-xl shadow-lg" onClick={() => setPreviewFunnel(null)}>
              <X className="w-4 h-4 mr-1" /> Fechar preview
            </Button>
          </div>
          {/* Phone frame */}
          <div className="w-[375px] h-[667px] rounded-[2.5rem] border-[6px] border-foreground/80 overflow-hidden shadow-2xl bg-background relative">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/80 rounded-b-2xl z-50" />
            <div className="h-full">
              <ChatRenderer
                key={previewFunnel.slug + '-' + Date.now()}
                flow={previewFunnel.flow}
                botName={botProfile.name || undefined}
                botAvatar={botProfile.avatarUrl || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Painel de Funis</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus funis do Typebot</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Link to="/">
              <Button variant="ghost" size="sm">← Início</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive">
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Bot Profile Settings */}
        <Collapsible open={profileOpen} onOpenChange={setProfileOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardContent className="flex items-center gap-3 py-4 px-5 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 border-primary flex items-center justify-center bg-muted">
                  {botProfile.avatarUrl ? (
                    <img src={botProfile.avatarUrl} alt="Bot" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{botProfile.name || 'Configurar perfil do bot'}</p>
                  <p className="text-xs text-muted-foreground">Nome e foto exibidos no chat</p>
                </div>
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-4 px-5 space-y-4 border-t border-border">
                <div className="grid gap-3 pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bot-name" className="text-xs">Nome do bot</Label>
                    <Input
                      id="bot-name"
                      placeholder="Ex: Assistente"
                      value={botProfile.name}
                      onChange={e => setBotProfile(p => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bot-avatar" className="text-xs">URL da foto de perfil</Label>
                    <Input
                      id="bot-avatar"
                      placeholder="https://exemplo.com/avatar.png"
                      value={botProfile.avatarUrl}
                      onChange={e => setBotProfile(p => ({ ...p, avatarUrl: e.target.value }))}
                    />
                  </div>
                  <Button size="sm" onClick={handleProfileSave} className="w-fit">
                    <Save className="w-4 h-4 mr-1" /> Salvar perfil
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Upload area */}
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Upload className="w-10 h-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Arraste o JSON do Typebot aqui</p>
              <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
            </div>
          </CardContent>
        </Card>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />

        {/* Funnel list */}
        {funnels.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">Nenhum funil cadastrado ainda.</p>
            <p className="text-muted-foreground text-xs mt-1">Faça upload de um JSON exportado do Typebot para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Funis ({funnels.length})</h2>
            {funnels.map(funnel => (
              <Card key={funnel.slug} className="group">
                <CardContent className="flex items-center gap-4 py-4 px-5">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{funnel.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {editingSlug === funnel.slug ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">/f/</span>
                          <Input
                            value={newSlug}
                            onChange={e => setNewSlug(e.target.value)}
                            className="h-6 text-xs w-32 px-1"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleSlugSave(funnel.slug); if (e.key === 'Escape') setEditingSlug(null); }}
                          />
                          <button onClick={() => handleSlugSave(funnel.slug)} className="text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingSlug(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">/f/{funnel.slug}</span>
                          <button
                            onClick={() => { setEditingSlug(funnel.slug); setNewSlug(funnel.slug); }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(funnel.uploadedAt).toLocaleDateString('pt-BR')} · {funnel.flow.groups.length} grupos
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPreviewFunnel(funnel)}
                      title="Simular funil"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Link to={`/f/${funnel.slug}`} target="_blank">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Abrir em nova aba">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(funnel.slug, funnel.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Admin;
