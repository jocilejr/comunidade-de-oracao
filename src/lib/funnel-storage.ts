import { StoredFunnel, TypebotFlow } from './typebot-types';

const STORAGE_KEY = 'typebot-funnels';
const STORAGE_BACKUP_KEY = `${STORAGE_KEY}-backup`;
const GALLERY_KEY = 'avatar-gallery';

function parseStoredFunnels(raw: string | null): StoredFunnel[] | null {
  if (raw === null) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed as StoredFunnel[];
    }

    // Compatibilidade com formatos antigos: { funnels: [...] }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'funnels' in parsed &&
      Array.isArray((parsed as { funnels: unknown }).funnels)
    ) {
      return (parsed as { funnels: StoredFunnel[] }).funnels;
    }

    return null;
  } catch {
    return null;
  }
}

function persistFunnels(funnels: StoredFunnel[]): void {
  const payload = JSON.stringify(funnels);
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(STORAGE_BACKUP_KEY, payload);
}

function readFunnels(): StoredFunnel[] {
  try {
    const primaryRaw = localStorage.getItem(STORAGE_KEY);
    const primary = parseStoredFunnels(primaryRaw);

    if (primary !== null) {
      if (primaryRaw !== null) {
        localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(primary));
      }
      return primary;
    }

    const backupRaw = localStorage.getItem(STORAGE_BACKUP_KEY);
    const backup = parseStoredFunnels(backupRaw);

    if (backup !== null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
      return backup;
    }

    return [];
  } catch {
    return [];
  }
}

export function getAllFunnels(): StoredFunnel[] {
  return readFunnels();
}

export function getFunnelBySlug(slug: string): StoredFunnel | undefined {
  return getAllFunnels().find(f => f.slug === slug);
}

export function saveFunnel(name: string, slug: string, flow: TypebotFlow): StoredFunnel {
  const funnels = getAllFunnels();
  const sanitizedSlug = slugify(slug) || `funil-${Date.now()}`;
  const existing = funnels.findIndex(f => f.slug === sanitizedSlug);

  const funnel: StoredFunnel = {
    id: flow.id || crypto.randomUUID(),
    slug: sanitizedSlug,
    name,
    uploadedAt: new Date().toISOString(),
    flow,
  };

  if (existing >= 0) {
    funnels[existing] = funnel;
  } else {
    funnels.push(funnel);
  }

  try {
    persistFunnels(funnels);
  } catch {
    throw new Error('Não foi possível salvar o funil no navegador.');
  }

  return funnel;
}

export function deleteFunnel(slug: string): boolean {
  const funnels = getAllFunnels();
  const nextFunnels = funnels.filter(f => f.slug !== slug);

  if (nextFunnels.length === funnels.length) return false;

  try {
    persistFunnels(nextFunnels);
    return true;
  } catch {
    return false;
  }
}

export function updateFunnelSlug(oldSlug: string, newSlug: string): boolean {
  const funnels = getAllFunnels();
  const sanitized = slugify(newSlug);

  if (!sanitized) return false;
  if (sanitized !== oldSlug && funnels.some(f => f.slug === sanitized)) return false;

  const funnel = funnels.find(f => f.slug === oldSlug);
  if (!funnel) return false;

  funnel.slug = sanitized;

  try {
    persistFunnels(funnels);
    return true;
  } catch {
    return false;
  }
}

export function updateFunnelProfile(slug: string, botName?: string, botAvatar?: string): boolean {
  const funnels = getAllFunnels();
  const funnel = funnels.find(f => f.slug === slug);

  if (!funnel) return false;

  funnel.botName = botName || '';
  funnel.botAvatar = botAvatar || '';

  try {
    persistFunnels(funnels);
    return true;
  } catch {
    return false;
  }
}

// Avatar gallery
export function getAvatarGallery(): string[] {
  try {
    const data = localStorage.getItem(GALLERY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToAvatarGallery(dataUrl: string): string[] {
  const gallery = getAvatarGallery();
  if (!gallery.includes(dataUrl)) {
    gallery.unshift(dataUrl);
    // Keep max 20 images
    if (gallery.length > 20) gallery.pop();

    try {
      localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
    } catch {
      return gallery;
    }
  }
  return gallery;
}

export function removeFromAvatarGallery(dataUrl: string): string[] {
  const gallery = getAvatarGallery().filter(g => g !== dataUrl);

  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  } catch {
    return gallery;
  }

  return gallery;
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
