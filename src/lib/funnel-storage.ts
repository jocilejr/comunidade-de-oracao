import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { StoredFunnel, TypebotFlow } from './typebot-types';

// Helper: get userId from cached session (no server roundtrip)
async function getCachedUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// ---- Funnel CRUD (Supabase) ----

export async function getAllFunnels(): Promise<StoredFunnel[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

   const { data, error } = await supabase
    .from('funnels')
    .select('id, slug, name, created_at, bot_name, bot_avatar, flow, preview_image, page_title, page_description')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    uploadedAt: row.created_at,
    flow: row.flow as unknown as TypebotFlow,
    botName: row.bot_name || '',
    botAvatar: row.bot_avatar || '',
    previewImage: row.preview_image || '',
    pageTitle: row.page_title || '',
    pageDescription: row.page_description || '',
    metaPixelId: (row as any).meta_pixel_id || '',
    metaCapiToken: (row as any).meta_capi_token || '',
  }));
}

/** Lightweight listing without the heavy flow column */
export async function getAllFunnelsMeta(): Promise<StoredFunnel[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('funnels')
    .select('id, slug, name, created_at, bot_name, bot_avatar, preview_image, page_title, page_description')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    uploadedAt: row.created_at,
    flow: { id: '', name: '', groups: [], edges: [] } as unknown as TypebotFlow,
    botName: row.bot_name || '',
    botAvatar: row.bot_avatar || '',
    previewImage: row.preview_image || '',
    pageTitle: row.page_title || '',
    pageDescription: row.page_description || '',
    metaPixelId: (row as any).meta_pixel_id || '',
    metaCapiToken: (row as any).meta_capi_token || '',
  }));
}

export async function getFunnelBySlug(slug: string): Promise<StoredFunnel | undefined> {
  // On public domain, use api-server /share endpoint to avoid CORS and PostgREST auth issues
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (publicDomain) {
    try {
      const publicOrigin = new URL(publicDomain).origin;
      if (window.location.origin === publicOrigin) {
        const res = await fetch(
          `/functions/v1/share?slug=${encodeURIComponent(slug)}&format=json`
        );
        if (!res.ok) return undefined;
        const data = await res.json();
        if (!data || data.error) return undefined;
        return {
          id: data.id,
          slug: data.slug,
          name: data.name,
          uploadedAt: data.created_at,
          flow: data.flow as unknown as TypebotFlow,
          botName: data.bot_name || '',
          botAvatar: data.bot_avatar || '',
          previewImage: data.preview_image || '',
          pageTitle: data.page_title || '',
          pageDescription: data.page_description || '',
          userId: data.user_id,
          metaPixelId: data.meta_pixel_id || '',
          metaCapiToken: data.meta_capi_token || '',
        };
      }
    } catch {
      // Fall through to Supabase client
    }
  }

  // Default: use Supabase client (Lovable Cloud or dashboard domain)
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  if (error || !data) return undefined;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    uploadedAt: data.created_at,
    flow: data.flow as unknown as TypebotFlow,
    botName: data.bot_name || '',
    botAvatar: data.bot_avatar || '',
    previewImage: data.preview_image || '',
    pageTitle: data.page_title || '',
    pageDescription: data.page_description || '',
    userId: data.user_id,
    metaPixelId: (data as any).meta_pixel_id || '',
    metaCapiToken: (data as any).meta_capi_token || '',
  };
}

export async function saveFunnel(name: string, slug: string, flow: TypebotFlow): Promise<StoredFunnel> {
  const userId = await getCachedUserId();
  if (!userId) throw new Error('Não autenticado.');

  const sanitizedSlug = slugify(slug) || `funil-${Date.now()}`;

  const payload = {
    user_id: userId,
    slug: sanitizedSlug,
    name,
    flow: flow as unknown as Json,
    bot_name: '',
    bot_avatar: '',
  };

  const { data, error } = await supabase
    .from('funnels')
    .upsert(payload, { onConflict: 'user_id,slug' })
    .select()
    .single();

  if (error || !data) throw new Error('Não foi possível salvar o funil.');

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    uploadedAt: data.created_at,
    flow: data.flow as unknown as TypebotFlow,
    botName: data.bot_name || '',
    botAvatar: data.bot_avatar || '',
    previewImage: data.preview_image || '',
    pageTitle: data.page_title || '',
    pageDescription: data.page_description || '',
    metaPixelId: (data as any).meta_pixel_id || '',
    metaCapiToken: (data as any).meta_capi_token || '',
  };
}

export async function deleteFunnel(slug: string): Promise<boolean> {
  const userId = await getCachedUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('funnels')
    .delete()
    .eq('user_id', userId)
    .eq('slug', slug);

  return !error;
}

export async function updateFunnelSlug(oldSlug: string, newSlug: string): Promise<boolean> {
  const userId = await getCachedUserId();
  if (!userId) return false;

  const sanitized = slugify(newSlug);
  if (!sanitized) return false;

  const { error } = await supabase
    .from('funnels')
    .update({ slug: sanitized })
    .eq('user_id', userId)
    .eq('slug', oldSlug);

  return !error;
}

export async function updateFunnelProfile(slug: string, botName?: string, botAvatar?: string, pageTitle?: string, pageDescription?: string): Promise<boolean> {
  const userId = await getCachedUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('funnels')
    .update({
      bot_name: botName || '',
      bot_avatar: botAvatar || '',
      page_title: pageTitle || '',
      page_description: pageDescription || '',
    })
    .eq('user_id', userId)
    .eq('slug', slug);

  return !error;
}

export async function getFunnelById(id: string): Promise<StoredFunnel | undefined> {
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return undefined;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    uploadedAt: data.created_at,
    flow: data.flow as unknown as TypebotFlow,
    botName: data.bot_name || '',
    botAvatar: data.bot_avatar || '',
    previewImage: data.preview_image || '',
    pageTitle: data.page_title || '',
    pageDescription: data.page_description || '',
    userId: data.user_id,
    metaPixelId: (data as any).meta_pixel_id || '',
    metaCapiToken: (data as any).meta_capi_token || '',
  };
}

export async function updateFunnelPixel(funnelId: string, metaPixelId: string, metaCapiToken: string): Promise<boolean> {
  const userId = await getCachedUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('funnels')
    .update({
      meta_pixel_id: metaPixelId || null,
      meta_capi_token: metaCapiToken || null,
    } as any)
    .eq('user_id', userId)
    .eq('id', funnelId);

  return !error;
}

export async function updateFunnelPreviewImage(slug: string, previewImage: string): Promise<boolean> {
  const userId = await getCachedUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('funnels')
    .update({ preview_image: previewImage })
    .eq('user_id', userId)
    .eq('slug', slug);

  return !error;
}

/** Lightweight fetch of only the active preview_image for a funnel */
export async function getActiveFunnelPreview(funnelId: string): Promise<string> {
  const { data, error } = await supabase
    .from('funnels')
    .select('preview_image')
    .eq('id', funnelId)
    .maybeSingle();

  if (error || !data) return '';
  return data.preview_image || '';
}

// ---- Funnel Preview Images (Supabase) ----

export interface FunnelPreviewImage {
  id: string;
  funnelId: string;
  dataUrl: string;
  position: number;
  accessCount?: number;
}

export async function getFunnelPreviewImages(funnelId: string): Promise<FunnelPreviewImage[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  const withCount = await (supabase
    .from('funnel_preview_images')
    .select('id, funnel_id, data_url, position, access_count') as any)
    .eq('funnel_id', funnelId)
    .eq('user_id', userId)
    .order('position', { ascending: true });

  if (!withCount.error && withCount.data) {
    return (withCount.data as any[]).map((r: any) => ({
      id: r.id,
      funnelId: r.funnel_id,
      dataUrl: r.data_url,
      position: r.position,
      accessCount: r.access_count || 0,
    }));
  }

  // Backward-compatible fallback for VPS databases that still don't have access_count
  const withoutCount = await (supabase
    .from('funnel_preview_images')
    .select('id, funnel_id, data_url, position') as any)
    .eq('funnel_id', funnelId)
    .eq('user_id', userId)
    .order('position', { ascending: true });

  if (withoutCount.error || !withoutCount.data) return [];
  return (withoutCount.data as any[]).map((r: any) => ({
    id: r.id,
    funnelId: r.funnel_id,
    dataUrl: r.data_url,
    position: r.position,
    accessCount: 0,
  }));
}

export async function addFunnelPreviewImage(funnelId: string, dataUrl: string): Promise<FunnelPreviewImage[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  // Get next position
  const existing = await getFunnelPreviewImages(funnelId);
  const nextPos = existing.length > 0 ? Math.max(...existing.map(e => e.position)) + 1 : 0;

  await supabase.from('funnel_preview_images').insert({
    funnel_id: funnelId,
    user_id: userId,
    data_url: dataUrl,
    position: nextPos,
  });

  // If this is the first image, also set it as the active preview
  if (existing.length === 0) {
    await supabase.from('funnels').update({ preview_image: dataUrl }).eq('id', funnelId).eq('user_id', userId);
  }

  return getFunnelPreviewImages(funnelId);
}

export async function removeFunnelPreviewImage(imageId: string, funnelId: string): Promise<FunnelPreviewImage[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  await supabase.from('funnel_preview_images').delete().eq('id', imageId).eq('user_id', userId);

  const remaining = await getFunnelPreviewImages(funnelId);

  // Update active preview to first remaining or clear it
  if (remaining.length > 0) {
    await supabase.from('funnels').update({ preview_image: remaining[0].dataUrl }).eq('id', funnelId).eq('user_id', userId);
  } else {
    await supabase.from('funnels').update({ preview_image: null }).eq('id', funnelId).eq('user_id', userId);
  }

  return remaining;
}

// ---- Avatar Gallery (Supabase) ----

export interface AvatarGalleryItem {
  id: string;
  dataUrl: string;
}

export async function getAvatarGallery(): Promise<AvatarGalleryItem[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('avatar_gallery')
    .select('id, data_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data.map(r => ({ id: r.id, dataUrl: r.data_url }));
}

export async function addToAvatarGallery(dataUrl: string): Promise<AvatarGalleryItem[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  const current = await getAvatarGallery();
  const alreadyExists = current.some(item => item.dataUrl === dataUrl);

  if (!alreadyExists) {
    await supabase.from('avatar_gallery').insert({ user_id: userId, data_url: dataUrl });
  }

  return getAvatarGallery();
}

export async function removeFromAvatarGallery(imageId: string): Promise<AvatarGalleryItem[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];

  await supabase.from('avatar_gallery').delete().eq('user_id', userId).eq('id', imageId);
  return getAvatarGallery();
}

// ---- Utilities ----

/** Compress an image dataUrl to JPEG, max 1200px wide, quality 0.85 */
export function compressPreviewImage(dataUrl: string, maxWidth = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round(h * (maxWidth / w));
        w = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateTypebotJson(json: unknown): { valid: boolean; flow?: TypebotFlow; error?: string } {
  try {
    const obj = json as Record<string, unknown>;
    let flow: TypebotFlow;

    if (obj.groups && obj.edges) {
      flow = obj as unknown as TypebotFlow;
    } else if (obj.typebot && typeof obj.typebot === 'object') {
      flow = obj.typebot as TypebotFlow;
    } else {
      return { valid: false, error: 'JSON não possui a estrutura esperada do Typebot (groups/edges).' };
    }

    if (!Array.isArray(flow.groups) || flow.groups.length === 0) {
      return { valid: false, error: 'O fluxo não possui grupos (groups).' };
    }

    if (!flow.id) flow.id = crypto.randomUUID();
    if (!flow.name) flow.name = 'Funil sem nome';
    if (!flow.variables) flow.variables = [];
    if (!flow.edges) flow.edges = [];

    return { valid: true, flow };
  } catch {
    return { valid: false, error: 'JSON inválido.' };
  }
}

// ---- User Settings ----

export interface UserSettings {
  openai_api_key: string;
  typebot_api_token: string;
  typebot_workspace_id: string;
  typebot_base_url: string;
}

export type UserSettingsResult =
  | { status: 'ok'; data: UserSettings }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export async function getUserSettings(): Promise<UserSettingsResult> {
  try {
    // VPS: use api-server endpoint directly (bypasses PostgREST)
    const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
    if (publicDomain) {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) return { status: 'empty' };
      const res = await fetch('/functions/v1/user-settings', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
      const result = await res.json();
      if (result.status === 'empty') return { status: 'empty' };
      return { status: 'ok', data: result.data };
    }

    const userId = await getCachedUserId();
    if (!userId) return { status: 'empty' };

    const { data, error } = await supabase
      .from('user_settings')
      .select('openai_api_key, typebot_api_token, typebot_workspace_id, typebot_base_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('getUserSettings error:', error);
      return { status: 'error', message: error.message };
    }

    if (!data) return { status: 'empty' };

    return {
      status: 'ok',
      data: {
        openai_api_key: data.openai_api_key || '',
        typebot_api_token: (data as any).typebot_api_token || '',
        typebot_workspace_id: (data as any).typebot_workspace_id || '',
        typebot_base_url: (data as any).typebot_base_url || '',
      },
    };
  } catch (err: any) {
    console.error('getUserSettings exception:', err);
    return { status: 'error', message: err?.message || 'Erro de conexão' };
  }
}

export async function saveUserSettings(settings: {
  openai_api_key?: string;
  typebot_api_token?: string;
  typebot_workspace_id?: string;
  typebot_base_url?: string;
}): Promise<boolean> {
  // VPS: use api-server endpoint directly (bypasses PostgREST)
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (publicDomain) {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session?.access_token) return false;
    const res = await fetch('/functions/v1/user-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(settings),
    });
    return res.ok;
  }

  const userId = await getCachedUserId();
  if (!userId) return false;

  const updateFields: Record<string, unknown> = {};
  if (settings.openai_api_key !== undefined) updateFields.openai_api_key = settings.openai_api_key;
  if (settings.typebot_api_token !== undefined) updateFields.typebot_api_token = settings.typebot_api_token;
  if (settings.typebot_workspace_id !== undefined) updateFields.typebot_workspace_id = settings.typebot_workspace_id;
  if (settings.typebot_base_url !== undefined) updateFields.typebot_base_url = settings.typebot_base_url;

  // Check if row already exists (avoids upsert which can fail on self-hosted PostgREST)
  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_settings')
      .update(updateFields as any)
      .eq('user_id', userId);
    return !error;
  } else {
    const { error } = await supabase
      .from('user_settings')
      .insert({ user_id: userId, ...updateFields } as any);
    return !error;
  }
}
