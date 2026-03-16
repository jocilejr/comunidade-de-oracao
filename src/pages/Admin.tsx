import { useState, useRef, useCallback } from 'react';
import { getAllFunnels, saveFunnel, deleteFunnel, updateFunnelSlug, validateTypebotJson, slugify } from '@/lib/funnel-storage';
import { StoredFunnel } from '@/lib/typebot-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, ExternalLink, Pencil, Check, X, Eye, LogOut, Sun, Moon, User, Save, Image, Bot, Settings, FolderOpen, BarChart3, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import ChatRenderer from '@/components/chat/ChatRenderer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const [activeTab, setActiveTab] = useState('funnels');
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
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

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Selecione uma imagem válida.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'Imagem deve ter no máximo 2MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setBotProfile(p => ({ ...p, avatarUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Preview mode — mobile frame
  if (previewFunnel) {
    return (
      <div className="flex items-center justify-center h-screen bg-muted/50">
        <div className="relative">
          {/* Close button */}
          <div className="absolute -top-14 left-0 right-0 flex items-center justify-between z-50">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{previewFunnel.name}</span>
            </div>
            <Button variant="secondary" size="sm" className="rounded-xl shadow-lg" onClick={() => setPreviewFunnel(null)}>
              <X className="w-4 h-4 mr-1" /> Fechar
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
      {/* Sidebar + Main Layout */}
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
          {/* Logo area */}
          <div className="px-5 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary text-primary-foreground font-bold text-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground leading-tight">Funnel Manager</h1>
                <p className="text-[11px] text-muted-foreground">Typebot Chat Engine</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <button
              onClick={() => setActiveTab('funnels')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'funnels'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Funis
              {funnels.length > 0 && (
                <span className="ml-auto text-[11px] font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                  {funnels.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Settings className="w-4 h-4" />
              Configurações
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'stats'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Estatísticas
            </button>
          </nav>

          {/* Bottom actions */}
          <div className="px-3 py-4 border-t border-border space-y-1">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-primary shrink-0">
                {botProfile.avatarUrl ? (
                  <img src={botProfile.avatarUrl} alt="Bot" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{botProfile.name || 'Bot'}</p>
                <p className="text-[10px] text-muted-foreground">Chatbot</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {/* Top bar */}
          <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {activeTab === 'funnels' && 'Funis'}
                  {activeTab === 'settings' && 'Configurações do Bot'}
                  {activeTab === 'stats' && 'Estatísticas'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'funnels' && 'Gerencie seus funis de conversação'}
                  {activeTab === 'settings' && 'Personalize nome, avatar e aparência'}
                  {activeTab === 'stats' && 'Acompanhe o desempenho dos funis'}
                </p>
              </div>
              <Link to="/">
                <Button variant="outline" size="sm">← Início</Button>
              </Link>
            </div>
          </header>

          <div className="p-8">
            {/* ===== FUNNELS TAB ===== */}
            {activeTab === 'funnels' && (
              <div className="space-y-6 max-w-4xl">
                {/* Upload area */}
                <Card
                  className={`border-2 border-dashed transition-all cursor-pointer ${
                    dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/40 hover:bg-muted/30'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <CardContent className="flex flex-col items-center justify-center py-14 gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Upload className="w-7 h-7 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Arraste o JSON do Typebot aqui</p>
                      <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar o arquivo</p>
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
                  <div className="text-center py-20">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <FolderOpen className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">Nenhum funil cadastrado</p>
                    <p className="text-muted-foreground text-xs mt-1">Faça upload de um JSON exportado do Typebot para começar.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Todos os funis
                      </h3>
                    </div>
                    {funnels.map(funnel => (
                      <Card key={funnel.slug} className="group hover:shadow-md transition-all hover:border-primary/20">
                        <CardContent className="flex items-center gap-4 py-4 px-5">
                          {/* Icon */}
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="w-5 h-5 text-primary" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">{funnel.name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
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
                                  <span className="text-xs text-muted-foreground font-mono">/f/{funnel.slug}</span>
                                  <button
                                    onClick={() => { setEditingSlug(funnel.slug); setNewSlug(funnel.slug); }}
                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(funnel.uploadedAt).toLocaleDateString('pt-BR')}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {funnel.flow.groups.length} grupos
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setPreviewFunnel(funnel)} title="Simular funil">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Link to={`/f/${funnel.slug}`} target="_blank">
                              <Button variant="ghost" size="icon" className="h-9 w-9" title="Abrir em nova aba">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive"
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
              </div>
            )}

            {/* ===== SETTINGS TAB ===== */}
            {activeTab === 'settings' && (
              <div className="max-w-2xl space-y-6">
                {/* Avatar section */}
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-sm font-semibold text-foreground mb-4">Foto de perfil do bot</h3>
                    <div className="flex items-center gap-6">
                      <div
                        className="w-20 h-20 rounded-full overflow-hidden border-4 border-primary/20 shrink-0 cursor-pointer hover:border-primary/50 transition-colors relative group"
                        onClick={() => avatarRef.current?.click()}
                      >
                        {botProfile.avatarUrl ? (
                          <>
                            <img src={botProfile.avatarUrl} alt="Bot" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                              <Image className="w-5 h-5 text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted group-hover:bg-muted/80 transition-colors">
                            <Image className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" onClick={() => avatarRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" /> Fazer upload
                        </Button>
                        {botProfile.avatarUrl && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setBotProfile(p => ({ ...p, avatarUrl: '' }))}>
                            Remover foto
                          </Button>
                        )}
                        <p className="text-[11px] text-muted-foreground">JPG, PNG ou WebP. Máx 2MB.</p>
                      </div>
                    </div>
                    <input
                      ref={avatarRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </CardContent>
                </Card>

                {/* Name + URL section */}
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Informações do bot</h3>
                    <div className="space-y-1.5">
                      <Label htmlFor="bot-name" className="text-xs text-muted-foreground">Nome exibido no chat</Label>
                      <Input
                        id="bot-name"
                        placeholder="Ex: Assistente Virtual"
                        value={botProfile.name}
                        onChange={e => setBotProfile(p => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bot-avatar-url" className="text-xs text-muted-foreground">Ou cole a URL da foto</Label>
                      <Input
                        id="bot-avatar-url"
                        placeholder="https://exemplo.com/avatar.png"
                        value={botProfile.avatarUrl.startsWith('data:') ? '' : botProfile.avatarUrl}
                        onChange={e => setBotProfile(p => ({ ...p, avatarUrl: e.target.value }))}
                      />
                    </div>
                    <Button onClick={handleProfileSave} className="mt-2">
                      <Save className="w-4 h-4 mr-2" /> Salvar configurações
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ===== STATS TAB ===== */}
            {activeTab === 'stats' && (
              <div className="max-w-4xl">
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Total de funis', value: funnels.length, icon: FolderOpen },
                    { label: 'Total de grupos', value: funnels.reduce((s, f) => s + f.flow.groups.length, 0), icon: BarChart3 },
                    { label: 'Total de blocos', value: funnels.reduce((s, f) => s + f.flow.groups.reduce((ss, g) => ss + g.blocks.length, 0), 0), icon: Bot },
                  ].map((stat, i) => (
                    <Card key={i}>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <stat.icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {funnels.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-sm text-muted-foreground">Adicione funis para ver estatísticas.</p>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Funil</th>
                            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slug</th>
                            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grupos</th>
                            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blocos</th>
                            <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Criado em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {funnels.map(f => (
                            <tr key={f.slug} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-5 py-3 font-medium text-foreground">{f.name}</td>
                              <td className="px-5 py-3 font-mono text-muted-foreground text-xs">/f/{f.slug}</td>
                              <td className="px-5 py-3 text-muted-foreground">{f.flow.groups.length}</td>
                              <td className="px-5 py-3 text-muted-foreground">{f.flow.groups.reduce((s, g) => s + g.blocks.length, 0)}</td>
                              <td className="px-5 py-3 text-muted-foreground">{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Admin;
