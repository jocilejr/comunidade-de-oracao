import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getFunnelBySlug } from '@/lib/funnel-storage';
import { StoredFunnel } from '@/lib/typebot-types';
import ChatRenderer from '@/components/chat/ChatRenderer';
import { Link } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';

/** WhatsApp-style skeleton shown instantly while funnel data loads */
const ChatSkeleton = () => (
  <div className="h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden">
    {/* Progress bar placeholder */}
    <div className="shrink-0 h-0.5" style={{ backgroundColor: 'hsl(var(--wa-progress) / 0.3)' }} />

    {/* Header */}
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

    {/* Wallpaper area */}
    <div className="flex-1 wa-wallpaper" />
  </div>
);

const Funnel = () => {
  const { slug } = useParams<{ slug: string }>();
  const [funnel, setFunnel] = useState<StoredFunnel | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) { setFunnel(null); return; }
    getFunnelBySlug(slug).then(f => setFunnel(f ?? null));
  }, [slug]);

  useEffect(() => {
    if (!funnel) return;
    if (funnel.pageTitle) document.title = funnel.pageTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (value) {
        if (!el) {
          el = document.createElement('meta');
          const [key, val] = selector.match(/\[(.+?)="(.+?)"\]/)?.slice(1) || [];
          if (key && val) el.setAttribute(key, val);
          document.head.appendChild(el);
        }
        el.setAttribute(attr, value);
      }
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

  // Loading state — show WhatsApp skeleton instantly
  if (funnel === undefined) {
    return <ChatSkeleton />;
  }

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
