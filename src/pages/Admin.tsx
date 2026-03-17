import { useState, useRef, useCallback, useEffect } from 'react';
import { getAllFunnelsMeta, saveFunnel, deleteFunnel, updateFunnelSlug, updateFunnelProfile, getAvatarGallery, addToAvatarGallery, removeFromAvatarGallery, validateTypebotJson, slugify, getUserSettings, saveUserSettings, getFunnelById } from '@/lib/funnel-storage';
import FunnelInspector from '@/components/admin/FunnelInspector';
import { StoredFunnel } from '@/lib/typebot-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, Trash2, ExternalLink, Pencil, Check, X, Eye, LogOut, Sun, Moon, Save, Image, Bot, Settings, FolderOpen, BarChart3, Smartphone, ImagePlus, CircleUser, Key, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import ChatRenderer from '@/components/chat/ChatRenderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const NAV_ITEMS = [
  { id: 'funnels', label: 'Funis', icon: FolderOpen },
  { id: 'gallery', label: 'Avatares', icon: ImagePlus },
  { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: Settings },
] as const;

const FunnelCardSkeleton = () => (
  <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card animate-in fade-in duration-300">
    <Skeleton className="w-11 h-11 rounded-full shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
    <div className="flex gap-1">
      <Skeleton className="w-8 h-8 rounded-lg" />
      <Skeleton className="w-8 h-8 rounded-lg" />
      <Skeleton className="w-8 h-8 rounded-lg" />
    </div>
  </div>
);

const Admin = () => {
  const [funnels, setFunnels] = useState<StoredFunnel[]>([]);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [previewFunnel, setPreviewFunnel] = useState<StoredFunnel | null>(null);
  const [activeTab, setActiveTab] = useState('funnels');
  const [profileDialog, setProfileDialog] = useState<StoredFunnel | null>(null);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [gallery, setGallery] = useState<string[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(true);
  const [openaiKey, setOpenaiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inspectFunnel, setInspectFunnel] = useState<StoredFunnel | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const refresh = useCallback(async () => {
    const data = await getAllFunnelsMeta();
    setFunnels(data);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingFunnels(true);
      const [funnelData, galleryData, settingsData] = await Promise.all([
        getAllFunnelsMeta(),
        getAvatarGallery(),
        getUserSettings(),
      ]);
      setFunnels(funnelData);
      setGallery(galleryData);
      if (settingsData) setOpenaiKey(settingsData.openai_api_key);
      setLoadingFunnels(false);
    };
    load();

    import('@/integrations/supabase/client').then(({ supabase }) => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setCurrentUserId(user.id);
      });
    });
  }, []);

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
      await saveFunnel(name, slug, result.flow);
      await refresh();
      toast({ title: 'Funil adicionado!', description: `"${name}" disponível em /f/${slug}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Arquivo JSON inválido.';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  }, [toast, refresh]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.json')) handleFile(file);
  }, [handleFile]);

  const handleDelete = async (slug: string, name: string) => {
    const success = await deleteFunnel(slug);
    if (!success) {
      toast({ title: 'Erro', description: 'Não foi possível remover o funil.', variant: 'destructive' });
      return;
    }
    await refresh();
    if (previewFunnel?.slug === slug) setPreviewFunnel(null);
    toast({ title: 'Excluído', description: `"${name}" foi removido.` });
  };

  const handleSlugSave = async (oldSlug: string) => {
    if (!newSlug.trim()) return;
    const success = await updateFunnelSlug(oldSlug, newSlug);
    if (success) {
      setEditingSlug(null);
      await refresh();
      toast({ title: 'Slug atualizado!' });
    } else {
      toast({ title: 'Erro', description: 'Slug inválido ou já existe.', variant: 'destructive' });
    }
  };

  const openProfileDialog = (funnel: StoredFunnel) => {
    setProfileDialog(funnel);
    setEditName(funnel.botName || '');
    setEditAvatar(funnel.botAvatar || '');
  };

  const handleInspect = async (funnel: StoredFunnel) => {
    setLoadingInspect(true);
    const full = await getFunnelById(funnel.id);
    setLoadingInspect(false);
    if (full) setInspectFunnel(full);
    else toast({ title: 'Erro', description: 'Não foi possível carregar o funil.', variant: 'destructive' });
  };

  const handlePreview = async (funnel: StoredFunnel) => {
    const full = await getFunnelById(funnel.id);
    if (full) setPreviewFunnel(full);
    else toast({ title: 'Erro', description: 'Não foi possível carregar o funil para simulação.', variant: 'destructive' });
  };

  const handleProfileSave = async () => {
    if (!profileDialog) return;
    const success = await updateFunnelProfile(profileDialog.slug, editName, editAvatar);
    if (!success) {
      toast({ title: 'Erro', description: 'Não foi possível salvar o perfil do funil.', variant: 'destructive' });
      return;
    }
    if (editAvatar && editAvatar.startsWith('data:')) {
      const updated = await addToAvatarGallery(editAvatar);
      setGallery(updated);
    }
    await refresh();
    setProfileDialog(null);
    toast({ title: 'Perfil do funil salvo!' });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setEditAvatar(dataUrl);
      const updated = await addToAvatarGallery(dataUrl);
      setGallery(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGalleryRemove = async (url: string) => {
    const updated = await removeFromAvatarGallery(url);
    setGallery(updated);
    if (editAvatar === url) setEditAvatar('');
  };

  // Preview mode — mobile frame
  if (previewFunnel) {
    const pf = funnels.find(f => f.slug === previewFunnel.slug) || previewFunnel;
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="relative">
          <div className="absolute -top-14 left-0 right-0 flex items-center justify-between z-50">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{pf.name}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPreviewFunnel(null)}>
              <X className="w-4 h-4 mr-1" /> Fechar
            </Button>
          </div>
          <div className="w-[375px] h-[667px] rounded-[2.5rem] border-[6px] border-foreground/80 overflow-hidden shadow-2xl bg-background relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/80 rounded-b-2xl z-50 pointer-events-none" />
            <div className="h-full pt-6">
              <ChatRenderer
                key={pf.slug}
                flow={pf.flow}
                botName={pf.botName || undefined}
                botAvatar={pf.botAvatar || undefined}
                ownerUserId={currentUserId || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-60 border-r border-border bg-card/50 flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground leading-none">Funnel Manager</h1>
                <p className="text-[10px] text-muted-foreground mt-0.5">Typebot Runtime</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {NAV_ITEMS.map(item => {
              const badge = item.id === 'funnels' && funnels.length > 0 ? funnels.length
                : item.id === 'gallery' && gallery.length > 0 ? gallery.length
                : undefined;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    activeTab === item.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                  {badge !== undefined && (
                    <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      activeTab === item.id
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-2 py-3 border-t border-border space-y-0.5">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </button>
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-6 py-3">
            <div className="flex items-center justify-between max-w-5xl">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {activeTab === 'funnels' && 'Funis'}
                  {activeTab === 'gallery' && 'Galeria de Avatares'}
                  {activeTab === 'stats' && 'Estatísticas'}
                  {activeTab === 'settings' && 'Configurações'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeTab === 'funnels' && 'Gerencie seus funis de conversação'}
                  {activeTab === 'gallery' && 'Fotos de perfil para reutilizar nos funis'}
                  {activeTab === 'stats' && 'Acompanhe o desempenho dos funis'}
                  {activeTab === 'settings' && 'Configure integrações e chaves de API'}
                </p>
              </div>
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-xs">← Início</Button>
              </Link>
            </div>
          </header>

          <div className="px-6 py-6">
            {/* ===== FUNNELS TAB ===== */}
            {activeTab === 'funnels' && (
              <div className="space-y-5 max-w-5xl">
                {/* Upload */}
                <div
                  className={`rounded-xl border-2 border-dashed transition-all cursor-pointer p-8 text-center ${
                    dragOver
                      ? 'border-primary bg-primary/5 scale-[1.01]'
                      : 'border-border hover:border-primary/30 hover:bg-accent/30'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Arraste o JSON aqui ou clique para selecionar</p>
                    <p className="text-[11px] text-muted-foreground">Aceita arquivos exportados do Typebot (.json)</p>
                  </div>
                </div>
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
                {loadingFunnels ? (
                  <div className="space-y-3">
                    <FunnelCardSkeleton />
                    <FunnelCardSkeleton />
                    <FunnelCardSkeleton />
                  </div>
                ) : funnels.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                      <FolderOpen className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Nenhum funil cadastrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Faça upload de um JSON exportado do Typebot.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {funnels.map(funnel => (
                      <div
                        key={funnel.slug}
                        className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all"
                      >
                        {/* Avatar */}
                        <div
                          className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0 cursor-pointer hover:border-primary/40 transition-colors"
                          onClick={() => openProfileDialog(funnel)}
                        >
                          {funnel.botAvatar ? (
                            <img src={funnel.botAvatar} alt={funnel.botName || funnel.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <CircleUser className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{funnel.name}</p>
                            {funnel.botName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground shrink-0">
                                {funnel.botName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {editingSlug === funnel.slug ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-muted-foreground">/f/</span>
                                <Input
                                  value={newSlug}
                                  onChange={e => setNewSlug(e.target.value)}
                                  className="h-5 text-[11px] w-28 px-1"
                                  autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') handleSlugSave(funnel.slug); if (e.key === 'Escape') setEditingSlug(null); }}
                                />
                                <button onClick={() => handleSlugSave(funnel.slug)} className="text-primary hover:text-primary/80"><Check className="w-3 h-3" /></button>
                                <button onClick={() => setEditingSlug(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-muted-foreground font-mono">/f/{funnel.slug}</span>
                                <button
                                  onClick={() => { setEditingSlug(funnel.slug); setNewSlug(funnel.slug); }}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(funnel.uploadedAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openProfileDialog(funnel)} title="Perfil do bot">
                            <CircleUser className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleInspect(funnel)} title="Inspecionar funil">
                            <Settings className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewFunnel(funnel)} title="Simular funil">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Link to={`/f/${funnel.slug}`} target="_blank">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Abrir em nova aba">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(funnel.slug, funnel.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== GALLERY TAB ===== */}
            {activeTab === 'gallery' && (
              <div className="max-w-5xl space-y-5">
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => avatarRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Importar foto
                  </Button>
                  <p className="text-[11px] text-muted-foreground">JPG, PNG ou WebP • Máx 2MB</p>
                </div>

                {gallery.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                      <ImagePlus className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Nenhuma foto na galeria</p>
                    <p className="text-xs text-muted-foreground mt-1">Importe fotos aqui ou durante a configuração de um funil.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {gallery.map((url, i) => (
                      <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/30 transition-colors">
                        <img src={url} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleGalleryRemove(url)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== STATS TAB ===== */}
            {activeTab === 'stats' && (
              <div className="max-w-5xl">
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: 'Total de funis', value: funnels.length, icon: FolderOpen },
                    { label: 'Total de grupos', value: funnels.reduce((s, f) => s + f.flow.groups.length, 0), icon: BarChart3 },
                    { label: 'Total de blocos', value: funnels.reduce((s, f) => s + f.flow.groups.reduce((ss, g) => ss + g.blocks.length, 0), 0), icon: Bot },
                  ].map((stat, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <stat.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground">{stat.value}</p>
                          <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {funnels.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-xs text-muted-foreground">Adicione funis para ver estatísticas.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">Funil</th>
                          <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">Slug</th>
                          <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">Grupos</th>
                          <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">Blocos</th>
                          <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">Criado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funnels.map(f => (
                          <tr key={f.slug} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                            <td className="px-4 py-2.5 text-[13px] font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                {f.botAvatar ? (
                                  <img src={f.botAvatar} className="w-5 h-5 rounded-full object-cover" />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                                    <CircleUser className="w-3 h-3 text-muted-foreground" />
                                  </div>
                                )}
                                {f.name}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">/f/{f.slug}</td>
                            <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{f.flow.groups.length}</td>
                            <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{f.flow.groups.reduce((s, g) => s + g.blocks.length, 0)}</td>
                            <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ===== SETTINGS TAB ===== */}
            {activeTab === 'settings' && (
              <div className="max-w-lg space-y-5">
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Key className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Chave da OpenAI</h3>
                      <p className="text-[11px] text-muted-foreground">Usada pelos blocos de IA nos funis</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">API Key</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showKey ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={openaiKey}
                          onChange={e => setOpenaiKey(e.target.value)}
                          className="pr-9 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          setSavingKey(true);
                          const ok = await saveUserSettings(openaiKey);
                          setSavingKey(false);
                          toast({
                            title: ok ? 'Chave salva!' : 'Erro',
                            description: ok ? 'Chave salva com sucesso.' : 'Não foi possível salvar.',
                            variant: ok ? 'default' : 'destructive',
                          });
                        }}
                        disabled={savingKey}
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {savingKey ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Obtenha em{' '}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        platform.openai.com
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Hidden file inputs */}
      <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {/* Funnel Inspector dialog */}
      <Dialog open={!!inspectFunnel} onOpenChange={open => { if (!open) setInspectFunnel(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Settings className="w-4 h-4" />
              Inspetor — {inspectFunnel?.name}
            </DialogTitle>
          </DialogHeader>
          {loadingInspect ? (
            <div className="space-y-3 py-6">
              <Skeleton className="h-4 w-48 mx-auto" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : inspectFunnel ? (
            <FunnelInspector flow={inspectFunnel.flow} />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Profile dialog */}
      <Dialog open={!!profileDialog} onOpenChange={open => { if (!open) setProfileDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CircleUser className="w-4 h-4" />
              Perfil — {profileDialog?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full overflow-hidden border border-border shrink-0 cursor-pointer hover:border-primary/40 transition-colors relative group"
                onClick={() => avatarRef.current?.click()}
              >
                {editAvatar ? (
                  <>
                    <img src={editAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-foreground/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Image className="w-4 h-4 text-primary-foreground" />
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <Image className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Button variant="outline" size="sm" onClick={() => avatarRef.current?.click()}>
                  <Upload className="w-3 h-3 mr-1" /> Upload
                </Button>
                {editAvatar && (
                  <Button variant="ghost" size="sm" className="text-destructive text-[11px]" onClick={() => setEditAvatar('')}>
                    Remover
                  </Button>
                )}
              </div>
            </div>

            {gallery.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Selecione da galeria</Label>
                <div className="grid grid-cols-6 gap-1.5 max-h-28 overflow-y-auto">
                  {gallery.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setEditAvatar(url)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        editAvatar === url ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">URL da foto</Label>
              <Input
                placeholder="https://exemplo.com/avatar.png"
                value={editAvatar.startsWith('data:') ? '' : editAvatar}
                onChange={e => setEditAvatar(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Nome no chat</Label>
              <Input
                placeholder="Ex: Assistente Virtual"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="text-xs"
              />
            </div>

            <Button onClick={handleProfileSave} className="w-full" size="sm">
              <Save className="w-3.5 h-3.5 mr-1.5" /> Salvar perfil
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
