import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { StoredFunnel, TypebotFlow } from './typebot-types';

// ---- Funnel CRUD (Supabase) ----

export async function getAllFunnels(): Promise<StoredFunnel[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

   const { data, error } = await supabase
    .from('funnels')
    .select('id, slug, name, created_at, bot_name, bot_avatar, flow, preview_image, page_title, page_description')
    .eq('user_id', user.id)
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
  }));
}

/** Lightweight listing without the heavy flow column */
export async function getAllFunnelsMeta(): Promise<StoredFunnel[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('funnels')
    .select('id, slug, name, created_at, bot_name, bot_avatar, preview_image, page_title, page_description')
    .eq('user_id', user.id)
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
  }));
}

export async function getFunnelBySlug(slug: string): Promise<StoredFunnel | undefined> {
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
  };
}

export async function saveFunnel(name: string, slug: string, flow: TypebotFlow): Promise<StoredFunnel> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado.');

  const sanitizedSlug = slugify(slug) || `funil-${Date.now()}`;

  const payload = {
    user_id: user.id,
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
  };
}

export async function deleteFunnel(slug: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('funnels')
    .delete()
    .eq('user_id', user.id)
    .eq('slug', slug);

  return !error;
}

export async function updateFunnelSlug(oldSlug: string, newSlug: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const sanitized = slugify(newSlug);
  if (!sanitized) return false;

  const { error } = await supabase
    .from('funnels')
    .update({ slug: sanitized })
    .eq('user_id', user.id)
    .eq('slug', oldSlug);

  return !error;
}

export async function updateFunnelProfile(slug: string, botName?: string, botAvatar?: string, pageTitle?: string, pageDescription?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('funnels')
    .update({
      bot_name: botName || '',
      bot_avatar: botAvatar || '',
      page_title: pageTitle || '',
      page_description: pageDescription || '',
    })
    .eq('user_id', user.id)
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
  };
}

export async function updateFunnelPreviewImage(slug: string, previewImage: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('funnels')
    .update({ preview_image: previewImage })
    .eq('user_id', user.id)
    .eq('slug', slug);

  return !error;
}

// ---- Funnel Preview Images (Supabase) ----

export interface FunnelPreviewImage {
  id: string;
  funnelId: string;
  dataUrl: string;
  position: number;
}

export async function getFunnelPreviewImages(funnelId: string): Promise<FunnelPreviewImage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('funnel_preview_images')
    .select('id, funnel_id, data_url, position')
    .eq('funnel_id', funnelId)
    .eq('user_id', user.id)
    .order('position', { ascending: true });

  if (error || !data) return [];
  return data.map(r => ({ id: r.id, funnelId: r.funnel_id, dataUrl: r.data_url, position: r.position }));
}

export async function addFunnelPreviewImage(funnelId: string, dataUrl: string): Promise<FunnelPreviewImage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get next position
  const existing = await getFunnelPreviewImages(funnelId);
  const nextPos = existing.length > 0 ? Math.max(...existing.map(e => e.position)) + 1 : 0;

  await supabase.from('funnel_preview_images').insert({
    funnel_id: funnelId,
    user_id: user.id,
    data_url: dataUrl,
    position: nextPos,
  });

  // If this is the first image, also set it as the active preview
  if (existing.length === 0) {
    await supabase.from('funnels').update({ preview_image: dataUrl }).eq('id', funnelId).eq('user_id', user.id);
  }

  return getFunnelPreviewImages(funnelId);
}

export async function removeFunnelPreviewImage(imageId: string, funnelId: string): Promise<FunnelPreviewImage[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  await supabase.from('funnel_preview_images').delete().eq('id', imageId).eq('user_id', user.id);

  const remaining = await getFunnelPreviewImages(funnelId);

  // Update active preview to first remaining or clear it
  if (remaining.length > 0) {
    await supabase.from('funnels').update({ preview_image: remaining[0].dataUrl }).eq('id', funnelId).eq('user_id', user.id);
  } else {
    await supabase.from('funnels').update({ preview_image: null }).eq('id', funnelId).eq('user_id', user.id);
  }

  return remaining;
}

// ---- Avatar Gallery (Supabase) ----

export interface AvatarGalleryItem {
  id: string;
  dataUrl: string;
}

export async function getAvatarGallery(): Promise<AvatarGalleryItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('avatar_gallery')
    .select('id, data_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data.map(r => ({ id: r.id, dataUrl: r.data_url }));
}

export async function addToAvatarGallery(dataUrl: string): Promise<AvatarGalleryItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const current = await getAvatarGallery();
  const alreadyExists = current.some(item => item.dataUrl === dataUrl);

  if (!alreadyExists) {
    await supabase.from('avatar_gallery').insert({ user_id: user.id, data_url: dataUrl });
  }

  return getAvatarGallery();
}

export async function removeFromAvatarGallery(imageId: string): Promise<AvatarGalleryItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  await supabase.from('avatar_gallery').delete().eq('user_id', user.id).eq('id', imageId);
  return getAvatarGallery();
}

// ---- Utilities ----

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

export async function getUserSettings(): Promise<UserSettings | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('openai_api_key, typebot_api_token, typebot_workspace_id, typebot_base_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    openai_api_key: data.openai_api_key || '',
    typebot_api_token: (data as any).typebot_api_token || '',
    typebot_workspace_id: (data as any).typebot_workspace_id || '',
    typebot_base_url: (data as any).typebot_base_url || '',
  };
}

export async function saveUserSettings(settings: {
  openai_api_key?: string;
  typebot_api_token?: string;
  typebot_workspace_id?: string;
  typebot_base_url?: string;
}): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const payload: Record<string, unknown> = { user_id: user.id };
  if (settings.openai_api_key !== undefined) payload.openai_api_key = settings.openai_api_key;
  if (settings.typebot_api_token !== undefined) payload.typebot_api_token = settings.typebot_api_token;
  if (settings.typebot_workspace_id !== undefined) payload.typebot_workspace_id = settings.typebot_workspace_id;
  if (settings.typebot_base_url !== undefined) payload.typebot_base_url = settings.typebot_base_url;

  const { error } = await supabase
    .from('user_settings')
    .upsert(payload as any, { onConflict: 'user_id' });

  return !error;
}
