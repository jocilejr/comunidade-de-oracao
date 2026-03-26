import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getFunnelBySlug, getPixelsByUserId } from '@/lib/funnel-storage';
import { StoredFunnel, UserPixel } from '@/lib/typebot-types';
import ChatRenderer from '@/components/chat/ChatRenderer';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';

/** WhatsApp-style skeleton shown instantly while funnel data loads */
const ChatSkeleton = () => (
  <div className="h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden">
    <div className="shrink-0 h-0.5" style={{ backgroundColor: 'hsl(var(--wa-progress) / 0.3)' }} />
    <header className="shrink-0 flex items-center gap-3 px-4 py-2 shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-header))' }}>
      <ArrowLeft className="w-5 h-5" style={{ color: 'hsl(var(--wa-header-foreground))' }} />
      <div className="w-9 h-9 rounded-full animate-pulse" style={{ backgroundColor: 'hsl(var(--wa-header-foreground) / 0.2)' }} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-24 rounded animate-pulse" style={{ backgroundColor: 'hsl(var(--wa-header-foreground) / 0.25)' }} />
        <div className="h-2.5 w-12 rounded animate-pulse" style={{ backgroundColor: 'hsl(var(--wa-header-foreground) / 0.15)' }} />
      </div>
      <div className="flex items-center gap-4" style={{ color: 'hsl(var(--wa-header-foreground))' }}>
        <Video className="w-5 h-5" />
        <Phone className="w-5 h-5" />
        <MoreVertical className="w-5 h-5" />
      </div>
    </header>
    <div className="flex-1 wa-wallpaper" />
  </div>
);

/**
 * Loads the Meta Pixel SDK once and fires PageView.
 * - The fbq stub is created synchronously (no network wait) so fbq() calls queue instantly.
 * - fbevents.js is injected async so it NEVER blocks the visible page.
 * - Safe to call multiple times — subsequent calls are ignored.
 */
function initMetaPixel(pixelIds: string[]): void {
  if (!pixelIds.length) return;
  const w = window as any;
  if (w._fv_pixel_initialized) return;
  w._fv_pixel_initialized = true;

  // Synchronous stub — lets fbq('track') calls queue before fbevents.js loads
  if (!w.fbq) {
    const fbq: any = function (...args: any[]) {
      fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
    };
    w.fbq = fbq; w._fbq = fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
  }

  for (const id of pixelIds) w.fbq('init', id);
  w.fbq('track', 'PageView');

  // Async load — non-blocking
  if (!document.getElementById('fbevents-js')) {
    const s = document.createElement('script');
    s.id = 'fbevents-js'; s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
}

const Funnel = () => {
  const { slug } = useParams<{ slug: string }>();
  const [funnel, setFunnel] = useState<StoredFunnel | null | undefined>(undefined);
  const pixelFiredRef = useRef(false);

  // ── Phase 1: Load funnel (this unblocks the chat render) ──────────────
  useEffect(() => {
    if (!slug) { setFunnel(null); return; }

    getFunnelBySlug(slug).then(f => {
      setFunnel(f ?? null);

      if (!f) return;

      // ── Phase 2: Pixel — runs in background, never blocks the UI ──────
      const initPixels = async () => {
        let pixelIds: string[] = [];

        // Prefer global_pixels returned from VPS (already embedded in funnel response)
        if (f.globalPixels && f.globalPixels.length > 0) {
          pixelIds = f.globalPixels.map((p: UserPixel) => p.pixelId).filter(Boolean);
        } else if (f.userId) {
          // Fallback: fetch from Supabase (cloud deployment)
          const pixels = await getPixelsByUserId(f.userId);
          pixelIds = pixels.map(p => p.pixelId).filter(Boolean);
        }

        if (pixelIds.length > 0 && !pixelFiredRef.current) {
          pixelFiredRef.current = true;
          initMetaPixel(pixelIds);
        }
      };

      // Slight defer so pixel never competes with first chat message render
      setTimeout(initPixels, 200);
    });
  }, [slug]);

  // ── SEO meta tags ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!funnel) return;
    if (funnel.pageTitle) document.title = funnel.pageTitle;

    const setMeta = (sel: string, attr: string, val: string) => {
      if (!val) return;
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        const [k, v] = sel.match(/\[(.+?)="(.+?)"\]/)?.slice(1) || [];
        if (k && v) el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, val);
    };

    setMeta('meta[name="description"]', 'content', funnel.pageDescription || '');
    setMeta('meta[property="og:title"]', 'content', funnel.pageTitle || funnel.name || '');
    setMeta('meta[property="og:description"]', 'content', funnel.pageDescription || '');
    setMeta('meta[property="og:image"]', 'content', funnel.previewImage || '');
    setMeta('meta[name="twitter:title"]', 'content', funnel.pageTitle || funnel.name || '');
    setMeta('meta[name="twitter:description"]', 'content', funnel.pageDescription || '');
    setMeta('meta[name="twitter:image"]', 'content', funnel.previewImage || '');

    return () => { document.title = 'Typebot Inteligente Origem Viva'; };
  }, [funnel]);

  // ── Render ────────────────────────────────────────────────────────────
  if (funnel === undefined) return <ChatSkeleton />;

  if (!funnel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Funil não encontrado</h1>
          <p className="text-muted-foreground text-sm">O funil "{slug}" não existe ou foi removido.</p>
          <Link to="/admin" className="text-primary text-sm underline hover:no-underline">
            Ir para o painel admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh]">
      <ChatRenderer
        flow={funnel.flow}
        botName={funnel.botName}
        botAvatar={funnel.botAvatar}
        ownerUserId={funnel.userId}
        funnelId={funnel.id}
      />
    </div>
  );
};

export default Funnel;
