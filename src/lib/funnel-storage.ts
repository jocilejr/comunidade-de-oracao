import { StoredFunnel, TypebotFlow } from './typebot-types';

const STORAGE_KEY = 'typebot-funnels';

export function getAllFunnels(): StoredFunnel[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getFunnelBySlug(slug: string): StoredFunnel | undefined {
  return getAllFunnels().find(f => f.slug === slug);
}

export function saveFunnel(name: string, slug: string, flow: TypebotFlow): StoredFunnel {
  const funnels = getAllFunnels();
  const existing = funnels.findIndex(f => f.slug === slug);
  
  const funnel: StoredFunnel = {
    id: flow.id || crypto.randomUUID(),
    slug: slugify(slug),
    name,
    uploadedAt: new Date().toISOString(),
    flow,
  };

  if (existing >= 0) {
    funnels[existing] = funnel;
  } else {
    funnels.push(funnel);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(funnels));
  return funnel;
}

export function deleteFunnel(slug: string): void {
  const funnels = getAllFunnels().filter(f => f.slug !== slug);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(funnels));
}

export function updateFunnelSlug(oldSlug: string, newSlug: string): boolean {
  const funnels = getAllFunnels();
  const sanitized = slugify(newSlug);
  if (funnels.some(f => f.slug === sanitized && f.slug !== oldSlug)) return false;
  
  const funnel = funnels.find(f => f.slug === oldSlug);
  if (!funnel) return false;
  
  funnel.slug = sanitized;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(funnels));
  return true;
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
    
    // Typebot exports can have the flow at root or nested
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
