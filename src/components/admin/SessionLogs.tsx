import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, MessageSquare, User, Bot, Cpu, CheckCircle, XCircle, ChevronRight, Activity } from 'lucide-react';

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

const AUTO_REFRESH_MS = 3000;

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
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('last7');
  const [customStart, setCustomStart] = useState<string>(() => toDateInput(addDays(new Date(), -6)));
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInput(new Date()));
  const [stats, setStats] = useState<SessionStats>({ today: 0, yesterday: 0, last3: 0, last7: 0, custom: 0 });

  const selectedSessionId = selectedSession?.id ?? null;

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

    if (range.start) {
      next = next.gte('started_at', range.start);
    }

    if (range.end) {
      next = next.lte('started_at', range.end);
    }

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

    const [today, yesterday, last3, last7, custom] = await Promise.all([
      countSessionsInRange(getRange('today')),
      countSessionsInRange(getRange('yesterday')),
      countSessionsInRange(getRange('last3')),
      countSessionsInRange(getRange('last7')),
      countSessionsInRange(getRange('custom')),
    ]);

    setStats({ today, yesterday, last3, last7, custom });
    if (!silent) setLoadingStats(false);
  }, [countSessionsInRange, getRange]);

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

    const nextSessions = (data as Session[]) || [];
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
    const nameKeys = ['nome', 'name', 'Nome', 'Name'];
    for (const k of nameKeys) {
      if (vars[k]) return vars[k];
    }
    const vals = Object.values(vars).filter(Boolean);
    return vals[0] || null;
  };

  const activeSessionsCount = useMemo(
    () => sessions.filter(session => !session.ended_at && !session.completed).length,
    [sessions],
  );

  const periodCards: Array<{ key: PeriodPreset; value: number }> = [
    { key: 'today', value: stats.today },
    { key: 'yesterday', value: stats.yesterday },
    { key: 'last3', value: stats.last3 },
    { key: 'last7', value: stats.last7 },
    { key: 'custom', value: stats.custom },
  ];

  if (selectedSession) {
    const vars = selectedSession.variables as Record<string, string> | null;
    const isLive = !selectedSession.ended_at && !selectedSession.completed;

    return (
      <div className="max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedSession(null); setEvents([]); }}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
        </Button>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{getFunnelName(selectedSession.funnel_id)}</p>
              <p className="text-[11px] text-muted-foreground">{formatTime(selectedSession.started_at)}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                <Activity className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse' : ''}`} />
                {isLive ? 'Ao vivo' : 'Encerrada'}
              </span>
            </div>
          </div>

          <div className="text-[12px] text-muted-foreground">
            Etapa atual:{' '}
            <span className="text-foreground font-medium">
              {selectedSession.last_group_title || 'Etapa não identificada'}
            </span>
          </div>

          {vars && Object.keys(vars).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(vars).map(([k, v]) => (
                <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                  {k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Timeline da conversa</p>
            <span className="text-[10px] text-muted-foreground">Atualização automática a cada 3s</span>
          </div>

          {loadingEvents ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y divide-border">
                {events.map(event => {
                  const Icon = EVENT_ICONS[event.event_type] || MessageSquare;
                  const label = EVENT_LABELS[event.event_type] || event.event_type;
                  const isUser = event.event_type === 'user_input' || event.event_type === 'choice';
                  const isGpt = event.event_type === 'gpt_response';

                  return (
                    <div key={event.id} className="px-4 py-2.5 flex gap-3 items-start">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isUser ? 'bg-primary/15 text-primary'
                          : isGpt ? 'bg-secondary text-secondary-foreground'
                            : 'bg-accent text-accent-foreground'
                        }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                          {event.group_title && (
                            <span className="text-[10px] text-muted-foreground/60">• {event.group_title}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground/50 ml-auto shrink-0">
                            {new Date(event.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        {event.content && (
                          <p className={`text-[13px] mt-0.5 break-words ${isUser ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            {event.content}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!defaultFunnel && (
            <select
              value={selectedFunnel}
              onChange={e => setSelectedFunnel(e.target.value)}
              className="text-xs rounded-lg border border-border bg-card px-3 py-1.5 text-foreground"
            >
              <option value="all">Todos os funis</option>
              {funnels.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}

          <Button variant="outline" size="sm" onClick={() => { loadSessions(); loadStats(); }}>
            Atualizar
          </Button>

          <span className="text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary">
            {activeSessionsCount} ao vivo agora
          </span>

          <span className="text-[11px] text-muted-foreground">Atualização automática a cada 3s</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {periodCards.map(card => {
            const isActive = period === card.key;

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setPeriod(card.key)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{PERIOD_LABELS[card.key]}</p>
                <p className="text-lg font-semibold text-foreground">
                  {loadingStats ? '...' : card.value}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Data inicial</label>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Data final</label>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPeriod('custom');
              loadStats();
              loadSessions();
            }}
          >
            Aplicar personalizado
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Nenhuma sessão registrada</p>
          <p className="text-xs text-muted-foreground mt-1">As sessões aparecerão aqui quando usuários interagirem com seus funis.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sessions.map(session => {
            const mainVar = getMainVariable(session.variables as Record<string, string> | null);
            const isLive = !session.ended_at && !session.completed;

            return (
              <button
                key={session.id}
                onClick={() => openSession(session)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all text-left"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  isLive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {isLive ? <Activity className="w-4 h-4 animate-pulse" /> : session.completed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {mainVar || 'Visitante anônimo'}
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground shrink-0">
                      {getFunnelName(session.funnel_id)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{formatTime(session.started_at)}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {isLive ? 'Etapa atual' : 'Última etapa'}: {session.last_group_title || 'Não identificada'}
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SessionLogs;
