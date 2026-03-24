import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  MessageSquare, User, Bot, Cpu, CheckCircle, XCircle, 
  ChevronRight, Activity, Filter, Search, Calendar as CalendarIcon,
  Clock, RefreshCw, Sparkles, Copy, Check
} from 'lucide-react';
import { getFunnelById } from '@/lib/funnel-storage';

interface FunnelMeta {
  id: string;
  name: string;
  slug: string;
}

interface Session {
  id: string;
  funnel_id: string;
  started_at: string;
  ended_at: string | null;
  last_group_title: string | null;
  variables: Record<string, string> | null;
  completed: boolean;
  updated_at?: string;
  has_ai?: boolean;
}

interface SessionEvent {
  id: string;
  event_type: string;
  block_id: string | null;
  group_title: string | null;
  content: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

type PeriodPreset = 'today' | 'yesterday' | 'last3' | 'last7' | 'custom';

type DateRange = {
  start: string | null;
  end: string | null;
};

interface SessionStats {
  today: number;
  yesterday: number;
  last3: number;
  last7: number;
  custom: number;
  withAi: number;
}

const EVENT_ICONS: Record<string, typeof MessageSquare> = {
  user_input: User,
  choice: User,
  bot_message: Bot,
  gpt_response: Cpu,
  end: CheckCircle,
};

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last3: '3 dias',
  last7: '7 dias',
  custom: 'Personalizado',
};

const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i;
const AUDIO_EXTS = /\.(mp3|ogg|wav|m4a|aac|webm|opus)(\?.*)?$/i;
const VIDEO_EXTS = /\.(mp4|mov|avi|mkv)(\?.*)?$/i;

type MediaParsed = { type: 'text' | 'audio' | 'image' | 'video' | 'embed'; url?: string; text?: string };

const parseEventMedia = (event: SessionEvent): MediaParsed => {
  const meta = event.metadata as Record<string, any> | null;
  if (meta?.mediaType && meta?.mediaUrl) {
    return { type: meta.mediaType as MediaParsed['type'], url: meta.mediaUrl, text: event.content || undefined };
  }

  const content = (event.content || '').trim();
  if (!content) return { type: 'text', text: '' };

  // [audio] URL or [image] URL patterns
  const prefixMatch = content.match(/^\[(audio|image|video|embed)\]\s*(https?:\/\/\S+)/i);
  if (prefixMatch) {
    return { type: prefixMatch[1].toLowerCase() as MediaParsed['type'], url: prefixMatch[2] };
  }

  // Direct URL detection
  if (/^https?:\/\/\S+$/i.test(content)) {
    if (IMAGE_EXTS.test(content)) return { type: 'image', url: content };
    if (AUDIO_EXTS.test(content)) return { type: 'audio', url: content };
    if (VIDEO_EXTS.test(content)) return { type: 'video', url: content };
  }

  return { type: 'text', text: content };
};

const renderEventContent = (media: MediaParsed) => {
  if (media.type === 'image' && media.url) {
    return (
      <div>
        <img
          src={media.url}
          alt="Imagem"
          className="max-w-full max-h-[260px] rounded-lg object-contain my-1"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            const fallback = document.createElement('a');
            fallback.href = media.url!;
            fallback.target = '_blank';
            fallback.className = 'text-[11px] underline break-all';
            fallback.textContent = '📷 Imagem (clique para abrir)';
            (e.target as HTMLElement).parentElement?.appendChild(fallback);
          }}
        />
        {media.text && <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed mt-1">{media.text}</p>}
      </div>
    );
  }

  if (media.type === 'audio' && media.url) {
    return (
      <div className="min-w-[200px]">
        <audio controls preload="metadata" className="w-full max-w-[300px]" style={{ height: '40px' }}>
          <source src={media.url} />
          <a href={media.url} target="_blank" rel="noopener" className="text-[11px] underline">🎙 Ouvir áudio</a>
        </audio>
        {media.text && <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed mt-1">{media.text}</p>}
      </div>
    );
  }

  if (media.type === 'video' && media.url) {
    return (
      <video controls preload="none" className="max-w-full max-h-[200px] rounded-lg my-1">
        <source src={media.url} />
      </video>
    );
  }

  if (media.type === 'embed' && media.url) {
    return (
      <iframe src={media.url} className="w-full rounded-lg" style={{ height: '200px' }} />
    );
  }

  if (!media.text) return <span className="italic opacity-50 text-[11px]">Sem conteúdo</span>;

  return <div className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{media.text}</div>;
};

const AUTO_REFRESH_MS = 5000;


const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfDayIso = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
const endOfDayIso = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString();

const SessionLogs = ({ funnels, defaultFunnel }: { funnels: FunnelMeta[]; defaultFunnel?: string }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedFunnel, setSelectedFunnel] = useState<string>(defaultFunnel || 'all');
  const [selectedStep, setSelectedStep] = useState<string>('all');
  const [filterAi, setFilterAi] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('last7');
  const [customStart, setCustomStart] = useState<string>(() => toDateInput(addDays(new Date(), -6)));
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInput(new Date()));
  const [stats, setStats] = useState<SessionStats>({ today: 0, yesterday: 0, last3: 0, last7: 0, custom: 0, withAi: 0 });
  const [funnelSteps, setFunnelSteps] = useState<{name: string; count: number}[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Event cache
  const eventsCache = useRef<Map<string, SessionEvent[]>>(new Map());
  const [activeEvents, setActiveEvents] = useState<SessionEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  const selectedSession = useMemo(() => sessions.find(s => s.id === selectedSessionId) || null, [sessions, selectedSessionId]);

  const getRange = useCallback((preset: PeriodPreset): DateRange => {
    const now = new Date();
    if (preset === 'today') return { start: startOfDayIso(now), end: endOfDayIso(now) };
    if (preset === 'yesterday') { const y = addDays(now, -1); return { start: startOfDayIso(y), end: endOfDayIso(y) }; }
    if (preset === 'last3') return { start: startOfDayIso(addDays(now, -2)), end: endOfDayIso(now) };
    if (preset === 'last7') return { start: startOfDayIso(addDays(now, -6)), end: endOfDayIso(now) };
    if (!customStart || !customEnd) return { start: null, end: null };
    const parsedStart = new Date(`${customStart}T00:00:00`);
    const parsedEnd = new Date(`${customEnd}T23:59:59.999`);
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) return { start: null, end: null };
    return { start: parsedStart.toISOString(), end: parsedEnd.toISOString() };
  }, [customStart, customEnd]);

  // Load funnel steps with counts
  useEffect(() => {
    const loadSteps = async () => {
      if (selectedFunnel === 'all') { setFunnelSteps([]); setSelectedStep('all'); return; }
      try {
        const funnel = await getFunnelById(selectedFunnel);
        if (funnel?.flow?.groups) {
          const stepNames = funnel.flow.groups.map(g => g.title || g.id).filter((v, i, a) => a.indexOf(v) === i);
          const activeRange = getRange(period);
          let sessionQuery = supabase.from('funnel_sessions').select('id').eq('funnel_id', selectedFunnel);
          if (activeRange.start) sessionQuery = sessionQuery.gte('started_at', activeRange.start);
          if (activeRange.end) sessionQuery = sessionQuery.lte('started_at', activeRange.end);
          const { data: sessionRows } = await sessionQuery;
          const sessionIds = sessionRows?.map(s => s.id) || [];
          if (sessionIds.length === 0) { setFunnelSteps(stepNames.map(name => ({ name, count: 0 }))); return; }
          const { data: eventRows } = await supabase.from('funnel_session_events').select('session_id, group_title').in('session_id', sessionIds).not('group_title', 'is', null);
          const countMap: Record<string, Set<string>> = {};
          for (const e of eventRows || []) { if (!e.group_title) continue; if (!countMap[e.group_title]) countMap[e.group_title] = new Set(); countMap[e.group_title].add(e.session_id); }
          setFunnelSteps(stepNames.map(name => ({ name, count: countMap[name]?.size || 0 })));
        }
      } catch (e) { console.error('Error loading funnel steps:', e); }
    };
    loadSteps();
  }, [selectedFunnel, period, customStart, customEnd, getRange]);

  const applySessionFilters = useCallback((query: any, range: DateRange) => {
    let next = query;
    if (selectedFunnel !== 'all') next = next.eq('funnel_id', selectedFunnel);
    if (range.start) next = next.gte('started_at', range.start);
    if (range.end) next = next.lte('started_at', range.end);
    return next;
  }, [selectedFunnel]);

  const countSessionsInRange = useCallback(async (range: DateRange): Promise<number> => {
    const base = supabase.from('funnel_sessions').select('id', { count: 'exact', head: true });
    const filtered = applySessionFilters(base, range);
    const { count } = await filtered;
    return count || 0;
  }, [applySessionFilters]);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoadingStats(true);
    const activeRange = getRange(period);
    const { data: aiSessions } = await supabase.from('funnel_session_events').select('session_id').eq('event_type', 'gpt_response').gte('created_at', activeRange.start || '1970-01-01').lte('created_at', activeRange.end || new Date().toISOString());
    const uniqueAiSessions = new Set(aiSessions?.map(s => s.session_id) || []);
    const [today, yesterday, last3, last7, custom] = await Promise.all([
      countSessionsInRange(getRange('today')),
      countSessionsInRange(getRange('yesterday')),
      countSessionsInRange(getRange('last3')),
      countSessionsInRange(getRange('last7')),
      countSessionsInRange(getRange('custom')),
    ]);
    setStats({ today, yesterday, last3, last7, custom, withAi: uniqueAiSessions.size });
    if (!silent) setLoadingStats(false);
  }, [countSessionsInRange, getRange, period]);

  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const activeRange = getRange(period);
    const base = supabase.from('funnel_sessions').select('*').order('started_at', { ascending: false }).limit(200);
    const filtered = applySessionFilters(base, activeRange);
    const { data } = await filtered;
    let nextSessions = (data as Session[]) || [];

    if (selectedStep !== 'all' && nextSessions.length > 0) {
      const sessionIds = nextSessions.map(s => s.id);
      const { data: stepEvents } = await supabase.from('funnel_session_events').select('session_id').in('session_id', sessionIds).eq('group_title', selectedStep);
      const stepSessionIds = new Set(stepEvents?.map(e => e.session_id) || []);
      nextSessions = nextSessions.filter(s => stepSessionIds.has(s.id));
    }

    if (nextSessions.length > 0) {
      const sessionIds = nextSessions.map(s => s.id);
      const { data: aiEvents } = await supabase.from('funnel_session_events').select('session_id').in('session_id', sessionIds).eq('event_type', 'gpt_response');
      const aiSessionIds = new Set(aiEvents?.map(e => e.session_id) || []);
      nextSessions = nextSessions.map(s => ({ ...s, has_ai: aiSessionIds.has(s.id) }));
    }

    setSessions(nextSessions);
    if (!silent) setLoading(false);
  }, [applySessionFilters, getRange, period, selectedStep]);

  const loadEvents = useCallback(async (sessionId: string, silent = false) => {
    // Check cache first
    if (eventsCache.current.has(sessionId) && silent) {
      setActiveEvents(eventsCache.current.get(sessionId)!);
      return;
    }
    if (!silent) setLoadingEvents(true);
    const { data } = await supabase.from('funnel_session_events').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
    const events = (data as SessionEvent[]) || [];
    eventsCache.current.set(sessionId, events);
    setActiveEvents(events);
    if (!silent) setLoadingEvents(false);
  }, []);

  // Prefetch events for first 10 sessions
  useEffect(() => {
    if (sessions.length === 0) return;
    const toPrefetch = sessions.slice(0, 10);
    toPrefetch.forEach(s => {
      if (!eventsCache.current.has(s.id)) {
        supabase.from('funnel_session_events').select('*').eq('session_id', s.id).order('created_at', { ascending: true })
          .then(({ data }) => { if (data) eventsCache.current.set(s.id, data as SessionEvent[]); });
      }
    });
  }, [sessions]);

  useEffect(() => { loadSessions(); loadStats(); }, [loadSessions, loadStats]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadSessions(true);
      loadStats(true);
      if (selectedSessionId) loadEvents(selectedSessionId, true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadEvents, loadSessions, loadStats, selectedSessionId]);

  // Auto-scroll timeline to bottom
  useEffect(() => {
    if (timelineEndRef.current) {
      setTimeout(() => timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [activeEvents, selectedSessionId]);

  const selectSession = (session: Session) => {
    setSelectedSessionId(session.id);
    if (eventsCache.current.has(session.id)) {
      setActiveEvents(eventsCache.current.get(session.id)!);
    } else {
      loadEvents(session.id);
    }
  };

  const getFunnelName = (funnelId: string) => funnels.find(f => f.id === funnelId)?.name || 'Funil desconhecido';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getMainVariable = (vars: Record<string, string> | null) => {
    if (!vars) return null;
    const nameKeys = ['nome', 'name', 'Nome', 'Name', 'whatsapp', 'phone', 'email'];
    for (const k of nameKeys) { if (vars[k]) return vars[k]; }
    const vals = Object.values(vars).filter(Boolean);
    return vals[0] || null;
  };

  const isSessionLive = (session: Session) => {
    if (session.ended_at || session.completed) return false;
    const now = new Date().getTime();
    const lastUpdate = new Date(session.updated_at || session.started_at).getTime();
    return now - lastUpdate < 120000;
  };

  const activeSessionsCount = useMemo(() => sessions.filter(isSessionLive).length, [sessions]);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (filterAi) result = result.filter(s => s.has_ai);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => {
        const mainVar = getMainVariable(s.variables)?.toLowerCase() || '';
        const funnelName = getFunnelName(s.funnel_id).toLowerCase();
        const lastStep = (s.last_group_title || '').toLowerCase();
        return mainVar.includes(q) || funnelName.includes(q) || lastStep.includes(q);
      });
    }
    return result;
  }, [sessions, searchQuery, filterAi]);

  const periodCards: Array<{ key: PeriodPreset; value: number }> = [
    { key: 'today', value: stats.today },
    { key: 'yesterday', value: stats.yesterday },
    { key: 'last3', value: stats.last3 },
    { key: 'last7', value: stats.last7 },
    { key: 'custom', value: stats.custom },
  ];

  const copyToClipboard = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // ─── Detail panel (right side) ───
  const renderDetailPanel = () => {
    if (!selectedSession) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-bold text-foreground">Selecione uma sessão</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em uma sessão à esquerda para ver os detalhes</p>
        </div>
      );
    }

    const vars = selectedSession.variables as Record<string, string> | null;
    const live = isSessionLive(selectedSession);

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{getMainVariable(vars) || 'Visitante Anônimo'}</p>
            <p className="text-[11px] text-muted-foreground">{getFunnelName(selectedSession.funnel_id)}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full font-bold shrink-0 ${
            live ? 'bg-emerald-500/10 text-emerald-500' : selectedSession.completed ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}>
            <Activity className={`w-3 h-3 ${live ? 'animate-pulse' : ''}`} />
            {live ? 'Ativa' : selectedSession.completed ? 'Concluída' : 'Encerrada'}
          </span>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="resumo" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0 shrink-0">
            <TabsTrigger value="resumo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-bold px-4 py-2.5">
              Resumo
            </TabsTrigger>
            <TabsTrigger value="dados" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-bold px-4 py-2.5">
              Dados {vars && Object.keys(vars).length > 0 && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{Object.keys(vars).length}</span>}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs font-bold px-4 py-2.5">
              Chat {activeEvents.length > 0 && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{activeEvents.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* Resumo tab */}
          <TabsContent value="resumo" className="flex-1 m-0 overflow-auto">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Etapa Atual</p>
                  <p className="text-sm font-bold text-foreground">{selectedSession.last_group_title || 'Início'}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-bold text-foreground">
                    {live ? '🟢 Navegando' : selectedSession.completed ? '✅ Concluiu' : '⛔ Abandonou'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Início</p>
                  <p className="text-sm font-medium text-foreground">{formatTime(selectedSession.started_at)}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Interações</p>
                  <p className="text-sm font-bold text-foreground">{activeEvents.length} eventos</p>
                </div>
              </div>
              {selectedSession.has_ai && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Esta sessão teve interação com IA</span>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Dados tab */}
          <TabsContent value="dados" className="flex-1 m-0 overflow-auto">
            <div className="p-4">
              {!vars || Object.keys(vars).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Nenhum dado coletado nesta sessão.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Campo</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Valor</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(vars).map(([k, v]) => (
                        <tr key={k} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">{k}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-foreground break-all">{v}</td>
                          <td className="px-2 py-2.5">
                            <button onClick={() => copyToClipboard(k, v)} className="p-1 rounded hover:bg-muted transition-colors" title="Copiar">
                              {copiedKey === k ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Timeline tab */}
          <TabsContent value="timeline" className="flex-1 m-0 min-h-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              {loadingEvents ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-3/4 rounded-lg" />
                  <Skeleton className="h-10 w-1/2 rounded-lg ml-auto" />
                  <Skeleton className="h-10 w-2/3 rounded-lg" />
                </div>
              ) : activeEvents.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
                </div>
              ) : (
                <div className="p-4 space-y-3 w-full overflow-x-hidden">
                  {[...activeEvents].reverse().map((event) => {
                    const Icon = EVENT_ICONS[event.event_type] || MessageSquare;
                    const isUser = event.event_type === 'user_input' || event.event_type === 'choice';
                    const isGpt = event.event_type === 'gpt_response';
                    const media = parseEventMedia(event);

                    return (
                      <div key={event.id} className={`flex w-full min-w-0 overflow-x-hidden ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`w-fit min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-[12px] ${
                          isUser 
                            ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                            : isGpt 
                              ? 'bg-secondary/40 text-secondary-foreground border border-primary/20 rounded-tl-sm' 
                              : 'bg-muted/60 text-foreground border border-border rounded-tl-sm'
                        }`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon className="w-3 h-3 opacity-60 shrink-0" />
                            <span className="text-[9px] opacity-60 font-medium">
                              {new Date(event.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="min-w-0 max-w-full overflow-hidden [&_a]:break-all">
                            {renderEventContent(media)}
                          </div>
                          {event.group_title && (
                            <span className="text-[9px] opacity-40 block mt-0.5 truncate">{event.group_title}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Filters & Stats bar */}
      <div className="space-y-3 mb-4 shrink-0">
        {/* Period cards + active count */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setFilterAi(!filterAi)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap text-[11px] font-bold ${
              filterAi ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            IA {loadingStats ? '...' : stats.withAi}
          </button>

          <div className="w-px h-5 bg-border" />

          {periodCards.map(card => (
            <button
              key={card.key}
              onClick={() => setPeriod(card.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap text-[11px] font-bold ${
                period === card.key ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/30'
              }`}
            >
              {PERIOD_LABELS[card.key]} <span className={period === card.key ? 'text-primary' : 'text-foreground'}>{loadingStats ? '...' : card.value}</span>
            </button>
          ))}

          <div className="w-px h-5 bg-border" />

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 whitespace-nowrap text-[11px] font-bold">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {activeSessionsCount} ativos
          </div>

          <Button variant="ghost" size="sm" onClick={() => { loadSessions(); loadStats(); }} className="h-7 w-7 p-0 shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-3 rounded-lg border border-border bg-background text-xs focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          {!defaultFunnel && (
            <select
              value={selectedFunnel}
              onChange={e => setSelectedFunnel(e.target.value)}
              className="h-8 px-3 rounded-lg border border-border bg-background text-xs font-medium appearance-none outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">Todos os Funis</option>
              {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}

          <select
            value={selectedStep}
            onChange={e => setSelectedStep(e.target.value)}
            disabled={selectedFunnel === 'all'}
            className="h-8 px-3 rounded-lg border border-border bg-background text-xs font-medium appearance-none outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            <option value="all">Todas Etapas</option>
            {funnelSteps.map(step => <option key={step.name} value={step.name}>{step.name} ({step.count})</option>)}
          </select>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/20" />
            <span className="text-xs text-muted-foreground">até</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/20" />
            <Button size="sm" onClick={() => { setPeriod('custom'); loadStats(); loadSessions(); }} className="h-8 px-4 text-xs font-bold">Aplicar</Button>
          </div>
        )}
      </div>

      {/* Split panel: sessions list + detail */}
      <div className="flex-1 min-h-0 flex gap-3 rounded-xl border border-border bg-card overflow-hidden">
        {/* Left: session list */}
        <div className="w-[40%] border-r border-border flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border bg-muted/30 shrink-0">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {filteredSessions.length} sessões
            </p>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-3 space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-8 text-center">
                <Search className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma sessão encontrada</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredSessions.map(session => {
                  const mainVar = getMainVariable(session.variables as Record<string, string> | null);
                  const live = isSessionLive(session);
                  const isSelected = selectedSessionId === session.id;

                  return (
                    <button
                      key={session.id}
                      onClick={() => selectSession(session)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        isSelected 
                          ? 'bg-primary/10 border border-primary/30' 
                          : 'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        live ? 'bg-emerald-500/10 text-emerald-500' : session.completed ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {live ? <Activity className="w-4 h-4 animate-pulse" /> : session.completed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-foreground truncate">{mainVar || 'Anônimo'}</p>
                          {session.has_ai && <Sparkles className="w-3 h-3 text-primary shrink-0" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {session.last_group_title || 'Início'} · {formatTime(session.started_at)}
                        </p>
                      </div>

                      <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground/40'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 flex flex-col min-h-0">
          {renderDetailPanel()}
        </div>
      </div>
    </div>
  );
};

export default SessionLogs;
