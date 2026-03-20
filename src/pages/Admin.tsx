import { useState, useRef, useCallback, useEffect } from 'react';

function getShareUrl(slug: string): string {
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (publicDomain) {
    return `${publicDomain.replace(/\/$/, '')}/${slug}`;
  }
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share?slug=${slug}&v=${Date.now()}`;
}
import { getAllFunnelsMeta, saveFunnel, deleteFunnel, updateFunnelSlug, updateFunnelProfile, updateFunnelPreviewImage, getAvatarGallery, addToAvatarGallery, removeFromAvatarGallery, validateTypebotJson, slugify, getUserSettings, saveUserSettings, getFunnelById, getFunnelPreviewImages, addFunnelPreviewImage, removeFunnelPreviewImage, FunnelPreviewImage, UserSettings, AvatarGalleryItem, UserSettingsResult } from '@/lib/funnel-storage';
import { supabase } from '@/integrations/supabase/client';
import FunnelInspector from '@/components/admin/FunnelInspector';
import SessionLogs from '@/components/admin/SessionLogs';
import { StoredFunnel } from '@/lib/typebot-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, Trash2, Pencil, Check, X, Eye, LogOut, Sun, Moon, Save, Image, Bot, Settings, FolderOpen, BarChart3, Smartphone, ImagePlus, CircleUser, Key, EyeOff, ScrollText, Camera, Plus, Star, Download, Loader2, Copy, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
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

const RotationCountdownGallery = ({ previewImages, loadingPreviews, activeDataUrl, onRemove, onRotateNow, rotating }: {
  previewImages: FunnelPreviewImage[];
  loadingPreviews: boolean;
  activeDataUrl?: string | null;
  onRemove: (id: string) => void;
  onRotateNow: () => void;
  rotating: boolean;
}) => {
  const [minutesLeft, setMinutesLeft] = useState(0);

  useEffect(() => {
    const calc = () => {
      const now = new Date();
      setMinutesLeft(59 - now.getUTCMinutes());
    };
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentHour = new Date().getUTCHours();
  const nextIdx = previewImages.length > 1 ? (currentHour + 1) % previewImages.length : -1;

  return (
    <div className="space-y-4 pt-2">
      <p className="text-[11px] text-muted-foreground">
        Adicione múltiplas imagens de preview. A cada hora o sistema alterna automaticamente qual imagem será exibida.
      </p>

      {previewImages.length === 1 && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>Adicione pelo menos <strong>2 imagens</strong> para a rotação automática funcionar.</span>
        </div>
      )}

      {previewImages.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5">
            <Clock className="w-3 h-3" />
            <span>Próxima rotação em <strong className="text-foreground">{minutesLeft} min</strong></span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={onRotateNow} disabled={rotating}>
            <RefreshCw className={`w-3 h-3 ${rotating ? 'animate-spin' : ''}`} />
            Rotacionar agora
          </Button>
        </div>
      )}

      {loadingPreviews ? (
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="aspect-video rounded-lg" />
          <Skeleton className="aspect-video rounded-lg" />
          <Skeleton className="aspect-video rounded-lg" />
        </div>
      ) : previewImages.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
          <Image className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Nenhuma imagem de preview</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {previewImages.map((img, idx) => {
            const isActive = activeDataUrl === img.dataUrl;
            const isNext = idx === nextIdx;
            return (
              <div key={img.id} className="relative group aspect-video rounded-lg overflow-hidden border border-border hover:border-primary/30 transition-colors">
                <img src={img.dataUrl} alt={`Preview ${img.position + 1}`} className="w-full h-full object-cover" />
                {isActive && (
                  <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-0.5" title="Imagem ativa">
                    <Star className="w-2.5 h-2.5 fill-current" />
                  </div>
                )}
                {isNext && !isActive && (
                  <div className="absolute top-1 left-1 bg-muted text-muted-foreground rounded-full p-0.5 border border-border" title="Próxima">
                    <Clock className="w-2.5 h-2.5" />
                  </div>
                )}
                <button
                  onClick={() => onRemove(img.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

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
  const [editPageTitle, setEditPageTitle] = useState('');
  const [editPageDescription, setEditPageDescription] = useState('');
  const [gallery, setGallery] = useState<AvatarGalleryItem[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(true);
  const [openaiKey, setOpenaiKey] = useState('');
  const [typebotToken, setTypebotToken] = useState('');
  const [typebotWorkspaceId, setTypebotWorkspaceId] = useState('');
  const [typebotBaseUrl, setTypebotBaseUrl] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showTypebotToken, setShowTypebotToken] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [typebotImportDialog, setTypebotImportDialog] = useState(false);
  const [typebotList, setTypebotList] = useState<Array<{ id: string; name: string; createdAt?: string }>>([]);
  const [loadingTypebots, setLoadingTypebots] = useState(false);
  const [importingTypebotId, setImportingTypebotId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inspectFunnel, setInspectFunnel] = useState<StoredFunnel | null>(null);
  const [logsFunnel, setLogsFunnel] = useState<StoredFunnel | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const previewImageRef = useRef<HTMLInputElement>(null);
  const previewGalleryRef = useRef<HTMLInputElement>(null);
  const [uploadingPreviewSlug, setUploadingPreviewSlug] = useState<string | null>(null);
  const [previewGalleryDialog, setPreviewGalleryDialog] = useState<StoredFunnel | null>(null);
  const [previewImages, setPreviewImages] = useState<FunnelPreviewImage[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
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
      setLoadingSettings(true);
      const [funnelData, galleryData, settingsResult] = await Promise.all([
        getAllFunnelsMeta(),
        getAvatarGallery(),
        getUserSettings(),
      ]);
      setFunnels(funnelData);
      setGallery(galleryData);
      if (settingsResult.status === 'ok') {
        setOpenaiKey(settingsResult.data.openai_api_key);
        setTypebotToken(settingsResult.data.typebot_api_token);
        setTypebotWorkspaceId(settingsResult.data.typebot_workspace_id);
        setTypebotBaseUrl(settingsResult.data.typebot_base_url);
        setBackendError(null);
      } else if (settingsResult.status === 'error') {
        setBackendError(settingsResult.message);
      }
      setLoadingSettings(false);
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
    setEditPageTitle(funnel.pageTitle || '');
    setEditPageDescription(funnel.pageDescription || '');
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

  const [savingProfile, setSavingProfile] = useState(false);

  const handleProfileSave = async () => {
    if (!profileDialog || savingProfile) return;
    setSavingProfile(true);
    try {
      const success = await updateFunnelProfile(profileDialog.slug, editName, editAvatar, editPageTitle, editPageDescription);
      if (!success) {
        toast({ title: 'Erro', description: 'Não foi possível salvar o perfil do funil.', variant: 'destructive' });
        return;
      }
      await refresh();
      setProfileDialog(null);
      toast({ title: 'Perfil do funil salvo!' });
    } finally {
      setSavingProfile(false);
    }
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

  const handleGalleryRemove = async (imageId: string, url: string) => {
    // Optimistic update: remove from UI immediately
    setGallery(prev => prev.filter(item => item.id !== imageId));
    if (editAvatar === url) {
      setEditAvatar('');
    }
    // Then delete from database in background
    removeFromAvatarGallery(imageId);
  };
  const handlePreviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingPreviewSlug) return;
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
      const success = await updateFunnelPreviewImage(uploadingPreviewSlug, dataUrl);
      if (success) {
        await refresh();
        toast({ title: 'Imagem de preview salva!' });
      } else {
        toast({ title: 'Erro', description: 'Não foi possível salvar a imagem.', variant: 'destructive' });
      }
      setUploadingPreviewSlug(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openPreviewGallery = async (funnel: StoredFunnel) => {
    setPreviewGalleryDialog(funnel);
    setActivePreviewUrl(funnel.previewImage || null);
    setLoadingPreviews(true);
    const imgs = await getFunnelPreviewImages(funnel.id);
    setPreviewImages(imgs);
    setLoadingPreviews(false);
  };

  const handleRotateNow = async () => {
    if (!previewGalleryDialog || rotating) return;
    setRotating(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const resp = await fetch(`${baseUrl}/functions/v1/rotate-preview-images`, { method: 'POST' });
      if (resp.ok) {
        // Refresh funnel data to get new active image
        await refresh();
        const updatedFunnels = await getAllFunnelsMeta();
        const updated = updatedFunnels.find(f => f.id === previewGalleryDialog.id);
        if (updated) {
          setActivePreviewUrl(updated.previewImage || null);
          setPreviewGalleryDialog(updated);
        }
        toast({ title: 'Rotação executada!', description: 'A imagem ativa foi atualizada.' });
      } else {
        toast({ title: 'Erro', description: 'Falha ao executar rotação.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível conectar ao servidor.', variant: 'destructive' });
    } finally {
      setRotating(false);
    }
  };

  const handlePreviewGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !previewGalleryDialog) return;
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
      const updated = await addFunnelPreviewImage(previewGalleryDialog.id, dataUrl);
      setPreviewImages(updated);
      await refresh();
      toast({ title: 'Preview adicionado!' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePreviewImage = async (imageId: string) => {
    if (!previewGalleryDialog) return;
    const updated = await removeFunnelPreviewImage(imageId, previewGalleryDialog.id);
    setPreviewImages(updated);
    await refresh();
    toast({ title: 'Preview removido!' });
  };


  if (previewFunnel) {
    const pf = previewFunnel;
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
                forceNewTab
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
        <aside className="w-64 bg-sidebar flex flex-col shrink-0">
          <div className="px-5 py-5 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 shadow-sm">
                <img src="/logo-ov.png" alt="Origem Viva" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-[13px] font-extrabold text-sidebar-foreground leading-tight tracking-tight">Typebot Inteligente</h1>
                <p className="text-[10px] text-sidebar-foreground/50 font-medium tracking-wide uppercase">Origem Viva</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV_ITEMS.map(item => {
              const badge = item.id === 'funnels' && funnels.length > 0 ? funnels.length
                : item.id === 'gallery' && gallery.length > 0 ? gallery.length
                : undefined;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                    activeTab === item.id
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                  {badge !== undefined && (
                    <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      activeTab === item.id
                        ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground'
                        : 'bg-sidebar-accent text-sidebar-foreground/60'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </button>
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto bg-background">
          <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-xl px-8 py-4">
            <div className="flex items-center justify-between max-w-6xl">
              <div>
                <h2 className="text-lg font-bold text-foreground tracking-tight">
                  {activeTab === 'funnels' && 'Funis'}
                  
                  {activeTab === 'gallery' && 'Galeria de Avatares'}
                  {activeTab === 'stats' && 'Estatísticas'}
                  {activeTab === 'settings' && 'Configurações'}
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {activeTab === 'funnels' && 'Gerencie seus funis de conversação'}
                  
                  {activeTab === 'gallery' && 'Fotos de perfil para reutilizar nos funis'}
                  {activeTab === 'stats' && 'Acompanhe o desempenho dos funis'}
                  {activeTab === 'settings' && 'Configure integrações e chaves de API'}
                </p>
              </div>
              <Link to="/">
                <Button variant="outline" size="sm" className="text-xs">← Início</Button>
              </Link>
            </div>
          </header>

          {backendError && (
            <div className="mx-8 mt-4 p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <span className="font-medium">⚠ Backend indisponível:</span>
              <span>{backendError}</span>
              <span className="text-muted-foreground ml-1">— suas configurações podem não ter sido carregadas, mas não foram perdidas.</span>
            </div>
          )}

          <div className="px-8 py-6">
            {/* ===== FUNNELS TAB ===== */}
            {activeTab === 'funnels' && (
              <div className="space-y-5 max-w-6xl">
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
                        className="group flex items-stretch gap-0 rounded-xl border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all overflow-hidden"
                      >
                        {/* Preview image */}
                        <div
                          className="relative w-28 shrink-0 bg-muted cursor-pointer group/preview"
                          onClick={() => openPreviewGallery(funnel)}
                          title="Gerenciar imagens de preview"
                        >
                          {funnel.previewImage ? (
                            <img src={funnel.previewImage} alt={funnel.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 min-h-[72px]">
                              <Image className="w-5 h-5 text-muted-foreground/50" />
                              <span className="text-[9px] text-muted-foreground/50">Preview</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-foreground/0 group-hover/preview:bg-foreground/40 flex items-center justify-center transition-all">
                            <ImagePlus className="w-4 h-4 text-background opacity-0 group-hover/preview:opacity-100 transition-opacity" />
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 flex-1 min-w-0">
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLogsFunnel(funnel)} title="Logs do funil">
                              <ScrollText className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleInspect(funnel)} title="Inspecionar funil">
                              <Settings className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(funnel)} title="Simular funil">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 px-2.5 gap-1.5 text-[11px] font-medium" title="Copiar link para WhatsApp (com preview)" onClick={() => {
                              const shareUrl = getShareUrl(funnel.slug);
                              navigator.clipboard.writeText(shareUrl);
                              toast({ title: 'Link copiado!', description: 'Cole este link no WhatsApp para compartilhar com preview de imagem.' });
                            }}>
                              <Copy className="w-3.5 h-3.5" /> Compartilhar
                            </Button>
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
                      </div>
                    ))}
                    <input
                      ref={previewImageRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePreviewImageUpload}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Logs Dialog */}
            <Dialog open={!!logsFunnel} onOpenChange={open => { if (!open) setLogsFunnel(null); }}>
              <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Logs — {logsFunnel?.name}</DialogTitle>
                </DialogHeader>
                {logsFunnel && (
                  <SessionLogs funnels={[{ id: logsFunnel.id, name: logsFunnel.name, slug: logsFunnel.slug }]} defaultFunnel={logsFunnel.id} />
                )}
              </DialogContent>
            </Dialog>

            {/* ===== GALLERY TAB ===== */}
            {activeTab === 'gallery' && (
              <div className="max-w-6xl space-y-5">
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
                    {gallery.map((item, i) => (
                      <div key={item.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/30 transition-colors">
                        <img src={item.dataUrl} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleGalleryRemove(item.id, item.dataUrl)}
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
              <div className="max-w-6xl">
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
                {loadingSettings ? (
                  <div className="space-y-5">
                    {[1, 2].map(i => (
                      <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-9 h-9 rounded-lg" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Skeleton className="h-10 w-full rounded-md" />
                          <Skeleton className="h-10 w-full rounded-md" />
                          <Skeleton className="h-8 w-20 rounded-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <>
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
                          const ok = await saveUserSettings({ openai_api_key: openaiKey });
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

                {/* Typebot Integration */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Download className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Integração Typebot</h3>
                      <p className="text-[11px] text-muted-foreground">Importe fluxos diretamente da API do Typebot</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">API Token</Label>
                      <div className="relative">
                        <Input
                          type={showTypebotToken ? 'text' : 'password'}
                          placeholder="Token do Typebot..."
                          value={typebotToken}
                          onChange={e => setTypebotToken(e.target.value)}
                          className="pr-9 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTypebotToken(!showTypebotToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showTypebotToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Workspace ID</Label>
                      <Input
                        placeholder="clxxxxxxxxxxxxxxxx"
                        value={typebotWorkspaceId}
                        onChange={e => setTypebotWorkspaceId(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">URL Base (Self-hosted)</Label>
                      <Input
                        placeholder="https://meu-typebot.com"
                        value={typebotBaseUrl}
                        onChange={e => setTypebotBaseUrl(e.target.value)}
                        className="font-mono text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">Deixe vazio para usar typebot.io</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          setSavingKey(true);
                          const ok = await saveUserSettings({
                            typebot_api_token: typebotToken,
                            typebot_workspace_id: typebotWorkspaceId,
                            typebot_base_url: typebotBaseUrl,
                          });
                          setSavingKey(false);
                          toast({
                            title: ok ? 'Configurações salvas!' : 'Erro',
                            description: ok ? 'Token e Workspace ID salvos.' : 'Não foi possível salvar.',
                            variant: ok ? 'default' : 'destructive',
                          });
                        }}
                        disabled={savingKey}
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        Salvar
                      </Button>

                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!typebotToken || !typebotWorkspaceId) {
                            toast({ title: 'Erro', description: 'Configure o Token e Workspace ID primeiro.', variant: 'destructive' });
                            return;
                          }
                          setTypebotImportDialog(true);
                          setLoadingTypebots(true);
                          try {
                            // Auto-save settings before calling proxy
                            await saveUserSettings({
                              typebot_api_token: typebotToken,
                              typebot_workspace_id: typebotWorkspaceId,
                              typebot_base_url: typebotBaseUrl,
                            });
                            const { data, error } = await supabase.functions.invoke('typebot-proxy', {
                              body: { action: 'list' },
                            });
                            if (error) {
                              const serverMsg = data?.error || error?.message || 'Erro desconhecido';
                              throw new Error(serverMsg);
                            }
                            const bots = data?.typebots || [];
                            setTypebotList(bots.map((b: any) => ({ id: b.id, name: b.name, createdAt: b.createdAt })));
                          } catch (err: any) {
                            toast({ title: 'Erro', description: err?.message || 'Não foi possível listar os typebots.', variant: 'destructive' });
                            setTypebotImportDialog(false);
                          }
                          setLoadingTypebots(false);
                        }}
                        disabled={!typebotToken || !typebotWorkspaceId}
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        Importar do Typebot
                      </Button>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      Obtenha o token em{' '}
                      <a href="https://typebot.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        typebot.io
                      </a>
                      {' '}→ Configurações → API Tokens
                    </p>
                  </div>
                </div>
                </>
                )}
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

          <div className="max-h-[60vh] overflow-y-auto space-y-4 pt-2 pr-1">
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
                  {gallery.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => setEditAvatar(item.dataUrl)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        editAvatar === item.dataUrl ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <img src={item.dataUrl} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
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

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Título da página</Label>
              <Input
                placeholder="Ex: Fale com nosso assistente"
                value={editPageTitle}
                onChange={e => setEditPageTitle(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Descrição da página</Label>
              <Input
                placeholder="Ex: Tire suas dúvidas rapidamente"
                value={editPageDescription}
                onChange={e => setEditPageDescription(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Share link section */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <Label className="text-[11px] text-muted-foreground">Link de compartilhamento (WhatsApp / redes sociais)</Label>
              <div className="flex gap-1.5">
                <Input
                  readOnly
                  value={getShareUrl(profileDialog?.slug || '')}
                  className="text-[10px] font-mono bg-muted"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                  const shareUrl = getShareUrl(profileDialog?.slug || '');
                  navigator.clipboard.writeText(shareUrl);
                  toast({ title: 'Link copiado!', description: 'Cole este link no WhatsApp para compartilhar com preview de imagem.' });
                }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Use este link para compartilhar no WhatsApp/redes sociais com preview de imagem.
              </p>
            </div>
          </div>

          <Button onClick={handleProfileSave} className="w-full" size="sm" disabled={savingProfile}>
            {savingProfile ? (
              <><span className="w-3.5 h-3.5 mr-1.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin inline-block" /> Salvando...</>
            ) : (
              <><Save className="w-3.5 h-3.5 mr-1.5" /> Salvar perfil</>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Preview Gallery Dialog */}
      <Dialog open={!!previewGalleryDialog} onOpenChange={open => { if (!open) setPreviewGalleryDialog(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ImagePlus className="w-4 h-4" />
              Previews — {previewGalleryDialog?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <RotationCountdownGallery
              previewImages={previewImages}
              loadingPreviews={loadingPreviews}
              activeDataUrl={activePreviewUrl}
              onRemove={handleRemovePreviewImage}
              onRotateNow={handleRotateNow}
              rotating={rotating}
            />

            <Button variant="outline" size="sm" className="w-full" onClick={() => previewGalleryRef.current?.click()}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar imagem
            </Button>
            <input ref={previewGalleryRef} type="file" accept="image/*" className="hidden" onChange={handlePreviewGalleryUpload} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Typebot Import Dialog */}
      <Dialog open={typebotImportDialog} onOpenChange={open => { if (!open) setTypebotImportDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Download className="w-4 h-4" />
              Importar do Typebot
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {loadingTypebots ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Carregando fluxos...</p>
              </div>
            ) : typebotList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Nenhum fluxo encontrado no workspace.</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {typebotList.map(bot => (
                  <div
                    key={bot.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent/30 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{bot.name}</p>
                      {bot.createdAt && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(bot.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={importingTypebotId === bot.id}
                      onClick={async () => {
                        setImportingTypebotId(bot.id);
                        try {
                          const { data, error } = await supabase.functions.invoke('typebot-proxy', {
                            body: { action: 'get', typebotId: bot.id },
                          });
                          if (error) {
                            const serverMsg = data?.error || error?.message || 'Erro desconhecido';
                            throw new Error(serverMsg);
                          }
                          const flow = data?.typebot || data;
                          const result = validateTypebotJson(flow);
                          if (!result.valid || !result.flow) {
                            toast({ title: 'Erro', description: result.error || 'Fluxo inválido.', variant: 'destructive' });
                            return;
                          }
                          const name = result.flow.name || bot.name;
                          const slug = slugify(name) || 'funil-' + Date.now();
                          await saveFunnel(name, slug, result.flow);
                          await refresh();
                          toast({ title: 'Importado!', description: `"${name}" disponível em /f/${slug}` });
                          setTypebotImportDialog(false);
                        } catch (err: any) {
                          toast({ title: 'Erro', description: err?.message || 'Falha ao importar.', variant: 'destructive' });
                        } finally {
                          setImportingTypebotId(null);
                        }
                      }}
                    >
                      {importingTypebotId === bot.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
