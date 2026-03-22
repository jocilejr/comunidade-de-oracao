import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, MessageSquare, User, Bot, Cpu, CheckCircle, XCircle, 
  ChevronRight, Activity, Filter, Search, Calendar as CalendarIcon,
  Clock, RefreshCw, Sparkles
} from 'lucide-react';
import { getFunnelById } from '@/lib/funnel-storage';
import { TypebotFlow } from '@/lib/typebot-types';

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
  has_ai?: boolean; // Virtual field for filtering
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

const EVENT_LABELS: Record<string, string> = {
  user_input: 'Resposta do usuário',
  choice: 'Escolha do usuário',
  bot_message: 'Mensagem do bot',
  gpt_response: 'Resposta GPT',
  end: 'Fim da conversa',
};

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last3: '3 dias',
  last7: '7 dias',
  custom: 'Personalizado',
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
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedFunnel, setSelectedFunnel] = useState<string>(defaultFunnel || 'all');
  const [selectedStep, setSelectedStep] = useState<string>('all');
  const [filterAi, setFilterAi] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('last7');
  const [customStart, setCustomStart] = useState<string>(() => toDateInput(addDays(new Date(), -6)));
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInput(new Date()));
  const [stats, setStats] = useState<SessionStats>({ today: 0, yesterday: 0, last3: 0, last7: 0, custom: 0, withAi: 0 });
  const [funnelSteps, setFunnelSteps] = useState<string[]>([]);

  const selectedSessionId = selectedSession?.id ?? null;

  // Load funnel steps when funnel changes
  useEffect(() => {
    const loadSteps = async () => {
      if (selectedFunnel === 'all') {
        setFunnelSteps([]);
        setSelectedStep('all');
        return;
      }
      
      try {
        const funnel = await getFunnelById(selectedFunnel);
        if (funnel?.flow?.groups) {
          const steps = funnel.flow.groups
            .map(g => g.title || g.id)
            .filter((v, i, a) => a.indexOf(v) === i); // unique
          setFunnelSteps(steps);
        }
      } catch (e) {
        console.error('Error loading funnel steps:', e);
      }
    };
    loadSteps();
  }, [selectedFunnel]);

  const getRange = useCallback((preset: PeriodPreset): DateRange => {
    const now = new Date();

    if (preset === 'today') {
      return { start: startOfDayIso(now), end: endOfDayIso(now) };
    }

    if (preset === 'yesterday') {
      const y = addDays(now, -1);
      return { start: startOfDayIso(y), end: endOfDayIso(y) };
    }

    if (preset === 'last3') {
      const start = addDays(now, -2);
      return { start: startOfDayIso(start), end: endOfDayIso(now) };
    }

    if (preset === 'last7') {
      const start = addDays(now, -6);
      return { start: startOfDayIso(start), end: endOfDayIso(now) };
    }

    if (!customStart || !customEnd) return { start: null, end: null };

    const parsedStart = new Date(`${customStart}T00:00:00`);
    const parsedEnd = new Date(`${customEnd}T23:59:59.999`);

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      return { start: null, end: null };
    }

    return {
      start: parsedStart.toISOString(),
      end: parsedEnd.toISOString(),
    };
  }, [customStart, customEnd]);

  const applySessionFilters = useCallback((query: any, range: DateRange) => {
    let next = query;

    if (selectedFunnel !== 'all') {
      next = next.eq('funnel_id', selectedFunnel);
    }

    if (selectedStep !== 'all') {
      next = next.eq('last_group_title', selectedStep);
    }

    if (range.start) {
      next = next.gte('started_at', range.start);
    }

    if (range.end) {
      next = next.lte('started_at', range.end);
    }

    return next;
  }, [selectedFunnel, selectedStep]);

  const countSessionsInRange = useCallback(async (range: DateRange): Promise<number> => {
    const base = supabase.from('funnel_sessions').select('id', { count: 'exact', head: true });
    const filtered = applySessionFilters(base, range);
    const { count } = await filtered;
    return count || 0;
  }, [applySessionFilters]);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoadingStats(true);

    const activeRange = getRange(period);
    
    // Count sessions with AI events in the current period
    const { data: aiSessions } = await supabase
      .from('funnel_session_events')
      .select('session_id')
      .eq('event_type', 'gpt_response')
      .gte('created_at', activeRange.start || '1970-01-01')
      .lte('created_at', activeRange.end || new Date().toISOString());
    
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
    const base = supabase
      .from('funnel_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200);

    const filtered = applySessionFilters(base, activeRange);
    const { data } = await filtered;

    let nextSessions = (data as Session[]) || [];

    // Fetch AI event presence for these sessions
    if (nextSessions.length > 0) {
      const sessionIds = nextSessions.map(s => s.id);
      const { data: aiEvents } = await supabase
        .from('funnel_session_events')
        .select('session_id')
        .in('session_id', sessionIds)
        .eq('event_type', 'gpt_response');
      
      const aiSessionIds = new Set(aiEvents?.map(e => e.session_id) || []);
      nextSessions = nextSessions.map(s => ({
        ...s,
        has_ai: aiSessionIds.has(s.id)
      }));
    }

    setSessions(nextSessions);

    if (selectedSessionId) {
      const updatedSelected = nextSessions.find(s => s.id === selectedSessionId);
      if (updatedSelected) setSelectedSession(updatedSelected);
    }

    if (!silent) setLoading(false);
  }, [applySessionFilters, getRange, period, selectedSessionId]);

  const loadEvents = useCallback(async (sessionId: string, silent = false) => {
    if (!silent) setLoadingEvents(true);

    const { data } = await supabase
      .from('funnel_session_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    setEvents((data as SessionEvent[]) || []);
    if (!silent) setLoadingEvents(false);
  }, []);

  useEffect(() => {
    loadSessions();
    loadStats();
  }, [loadSessions, loadStats]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadSessions(true);
      loadStats(true);

      if (selectedSessionId) {
        loadEvents(selectedSessionId, true);
      }
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadEvents, loadSessions, loadStats, selectedSessionId]);

  const openSession = async (session: Session) => {
    setSelectedSession(session);
    await loadEvents(session.id);
  };

  const getFunnelName = (funnelId: string) => {
    return funnels.find(f => f.id === funnelId)?.name || 'Funil desconhecido';
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getMainVariable = (vars: Record<string, string> | null) => {
    if (!vars) return null;
    const nameKeys = ['nome', 'name', 'Nome', 'Name', 'whatsapp', 'phone', 'email'];
    for (const k of nameKeys) {
      if (vars[k]) return vars[k];
    }
    const vals = Object.values(vars).filter(Boolean);
    return vals[0] || null;
  };

  const activeSessionsCount = useMemo(() => {
    const now = new Date().getTime();
    return sessions.filter(session => {
      if (session.ended_at || session.completed) return false;
      const lastUpdate = new Date(session.updated_at || session.started_at).getTime();
      return now - lastUpdate < 120000;
    }).length;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    
    if (filterAi) {
      result = result.filter(s => s.has_ai);
    }

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

  if (selectedSession) {
    const vars = selectedSession.variables as Record<string, string> | null;
    const now = new Date().getTime();
    const lastUpdate = new Date(selectedSession.updated_at || selectedSession.started_at).getTime();
    const isLive = !selectedSession.ended_at && !selectedSession.completed && (now - lastUpdate < 120000);

    return (
      <div className="flex flex-col h-full max-h-[80vh]">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedSession(null); setEvents([]); }} className="h-8">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para a lista
          </Button>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium ${
              isLive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
            }`}>
              <Activity className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse' : ''}`} />
              {isLive ? 'Sessão Ativa' : 'Sessão Encerrada'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 shrink-0">
          <div className="md:col-span-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">{getFunnelName(selectedSession.funnel_id)}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Clock className="w-3 h-3" /> Iniciada em {formatTime(selectedSession.started_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Etapa Atual</p>
                <p className="text-sm font-medium text-primary">{selectedSession.last_group_title || 'Início'}</p>
              </div>
            </div>

            {vars && Object.keys(vars).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Dados Coletados</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(vars).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/50 border border-border/50">
                      <span className="text-[10px] text-muted-foreground font-medium">{k}:</span>
                      <span className="text-[11px] text-foreground font-semibold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
              isLive ? 'bg-primary/10 text-primary' : selectedSession.completed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
            }`}>
              {isLive ? <Activity className="w-6 h-6 animate-pulse" /> : selectedSession.completed ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            </div>
            <p className="text-sm font-bold text-foreground">
              {isLive ? 'Navegando agora' : selectedSession.completed ? 'Concluiu o funil' : 'Abandonou o funil'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isLive ? 'O usuário ainda está interagindo' : 'Interação finalizada'}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">Timeline da Conversa</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin-slow" />
              <span>Atualizando em tempo real</span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loadingEvents ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-3/4 rounded-lg" />
                <Skeleton className="h-12 w-1/2 rounded-lg ml-auto" />
                <Skeleton className="h-12 w-2/3 rounded-lg" />
              </div>
            ) : events.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">Nenhum evento registrado nesta sessão.</p>
              </div>
            ) : (
              <div className="p-6 space-y-8 max-w-full overflow-x-hidden">
                {events.map((event, idx) => {
                  const Icon = EVENT_ICONS[event.event_type] || MessageSquare;
                  const label = EVENT_LABELS[event.event_type] || event.event_type;
                  const isUser = event.event_type === 'user_input' || event.event_type === 'choice';
                  const isGpt = event.event_type === 'gpt_response';
                  const isBot = event.event_type === 'bot_message';

                  return (
                    <div key={event.id} className={`flex flex-col w-full ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-2 mb-2 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {isUser ? 'Usuário' : isBot ? 'Assistente' : isGpt ? 'IA' : label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40 font-mono">
                          {new Date(event.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      <div className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-[13px] shadow-sm border transition-all ${
                        isUser 
                          ? 'bg-primary text-primary-foreground border-primary rounded-tr-none mr-1' 
                          : isGpt 
                            ? 'bg-secondary/40 text-secondary-foreground border-primary/20 rounded-tl-none ml-1' 
                            : 'bg-muted/40 text-foreground border-border rounded-tl-none ml-1'
                      }`}>
                        {event.content ? (
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {event.content.startsWith('http') && (event.content.includes('.png') || event.content.includes('.jpg') || event.content.includes('.webp')) ? (
                              <img src={event.content} alt="Mídia" className="max-w-full rounded-lg my-1" />
                            ) : event.content === '[audio]' ? (
                              <div className="flex items-center gap-2 py-1">
                                <div className="w-8 h-8 rounded-full bg-background/20 flex items-center justify-center">
                                  <Activity className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-medium">Mensagem de áudio</span>
                              </div>
                            ) : (
                              event.content
                            )}
                          </div>
                        ) : (
                          <span className="italic opacity-50 text-xs">Sem conteúdo</span>
                        )}
                      </div>
                      
                      {event.group_title && (
                        <span className="text-[9px] text-muted-foreground/60 mt-1.5 px-2 font-medium">
                          Etapa: {event.group_title}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6 shrink-0">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nome, funil ou etapa..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {!defaultFunnel && (
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <select
                    value={selectedFunnel}
                    onChange={e => setSelectedFunnel(e.target.value)}
                    className="h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-xs font-medium appearance-none outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="all">Todos os Funis</option>
                    {funnels.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative">
                <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <select
                  value={selectedStep}
                  onChange={e => setSelectedStep(e.target.value)}
                  disabled={selectedFunnel === 'all'}
                  className="h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-xs font-medium appearance-none outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                >
                  <option value="all">Todas as Etapas</option>
                  {funnelSteps.map(step => (
                    <option key={step} value={step}>{step}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setFilterAi(!filterAi)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap mr-2 ${
                filterAi
                  ? 'border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/20'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/30'
              }`}
            >
              <Sparkles className={`w-4 h-4 ${filterAi ? 'fill-primary/20' : ''}`} />
              <span className="text-[11px] font-bold uppercase tracking-wider">Com Resposta IA</span>
              <span className={`text-sm font-bold ${filterAi ? 'text-primary' : 'text-foreground'}`}>
                {loadingStats ? '...' : stats.withAi}
              </span>
            </button>

            <div className="w-px h-6 bg-border mx-1" />

            {periodCards.map(card => {
              const isActive = period === card.key;
              return (
                <button
                  key={card.key}
                  onClick={() => setPeriod(card.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider">{PERIOD_LABELS[card.key]}</span>
                  <span className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                    {loadingStats ? '...' : card.value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status Agora</p>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">{activeSessionsCount}</p>
            <p className="text-[11px] text-muted-foreground font-medium">Usuários ativos nos últimos 2 min</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { loadSessions(); loadStats(); }}
            className="mt-3 h-8 text-[11px] font-bold uppercase tracking-wider"
          >
            <RefreshCw className="w-3 h-3 mr-2" /> Atualizar
          </Button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-dashed border-border mb-6 bg-muted/10 shrink-0">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon className="w-3 h-3" /> Data Inicial
            </label>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon className="w-3 h-3" /> Data Final
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              setPeriod('custom');
              loadStats();
              loadSessions();
            }}
            className="h-9 px-6 font-bold text-xs uppercase tracking-wider"
          >
            Aplicar Filtro
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4" /> Histórico de Sessões
          </h3>
          <p className="text-[10px] text-muted-foreground">Mostrando as últimas 200 sessões</p>
        </div>

        <ScrollArea className="flex-1 -mx-1 px-1">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-bold text-foreground">Nenhuma sessão encontrada</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                Tente ajustar os filtros ou o termo de busca para encontrar o que procura.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 pb-4">
              {filteredSessions.map(session => {
                const mainVar = getMainVariable(session.variables as Record<string, string> | null);
                const now = new Date().getTime();
                const lastUpdate = new Date(session.updated_at || session.started_at).getTime();
                const isLive = !session.ended_at && !session.completed && (now - lastUpdate < 120000);

                return (
                  <button
                    key={session.id}
                    onClick={() => openSession(session)}
                    className="group w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all text-left relative overflow-hidden"
                  >
                    {isLive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary animate-pulse" />}
                    
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                      isLive ? 'bg-primary/10 text-primary' : session.completed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                    }`}>
                      {isLive ? <Activity className="w-5 h-5 animate-pulse" /> : session.completed ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                          {mainVar || 'Visitante Anônimo'}
                        </p>
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-accent text-accent-foreground uppercase tracking-tighter">
                          {getFunnelName(session.funnel_id)}
                        </span>
                        {session.has_ai && (
                          <Sparkles className="w-3 h-3 text-primary fill-primary/20" />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatTime(session.started_at)}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                          <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
                          <span className="truncate max-w-[180px]">
                            {isLive ? 'Etapa atual' : 'Última etapa'}: <span className="text-foreground">{session.last_group_title || 'Início'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex -space-x-1.5">
                        {session.variables && Object.keys(session.variables).slice(0, 3).map((k, i) => (
                          <div key={k} className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground" title={k}>
                            {k[0].toUpperCase()}
                          </div>
                        ))}
                        {session.variables && Object.keys(session.variables).length > 3 && (
                          <div className="w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                            +{Object.keys(session.variables).length - 3}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default SessionLogs;
