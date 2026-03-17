import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { StoredFunnel, TypebotFlow } from './typebot-types';

// ---- Funnel CRUD (Supabase) ----

export async function getAllFunnels(): Promise<StoredFunnel[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('funnels')
    .select('*')
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

export async function updateFunnelProfile(slug: string, botName?: string, botAvatar?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('funnels')
    .update({ bot_name: botName || '', bot_avatar: botAvatar || '' })
    .eq('user_id', user.id)
    .eq('slug', slug);

  return !error;
}

// ---- Avatar Gallery (Supabase) ----

export async function getAvatarGallery(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('avatar_gallery')
    .select('data_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data.map(r => r.data_url);
}

export async function addToAvatarGallery(dataUrl: string): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  await supabase.from('avatar_gallery').insert({ user_id: user.id, data_url: dataUrl });
  return getAvatarGallery();
}

export async function removeFromAvatarGallery(dataUrl: string): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  await supabase.from('avatar_gallery').delete().eq('user_id', user.id).eq('data_url', dataUrl);
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
