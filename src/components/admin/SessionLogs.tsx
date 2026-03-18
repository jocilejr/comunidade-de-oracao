import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, MessageSquare, User, Bot, Cpu, CheckCircle, XCircle, ChevronRight } from 'lucide-react';

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

const SessionLogs = ({ funnels }: { funnels: FunnelMeta[] }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedFunnel, setSelectedFunnel] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('funnel_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);

    if (selectedFunnel !== 'all') {
      query = query.eq('funnel_id', selectedFunnel);
    }

    const { data } = await query;
    setSessions((data as Session[]) || []);
    setLoading(false);
  }, [selectedFunnel]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const openSession = async (session: Session) => {
    setSelectedSession(session);
    setLoadingEvents(true);
    const { data } = await supabase
      .from('funnel_session_events')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });
    setEvents((data as SessionEvent[]) || []);
    setLoadingEvents(false);
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

  // Detail view
  if (selectedSession) {
    const vars = selectedSession.variables as Record<string, string> | null;
    return (
      <div className="max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedSession(null); setEvents([]); }}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
        </Button>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{getFunnelName(selectedSession.funnel_id)}</p>
              <p className="text-[11px] text-muted-foreground">{formatTime(selectedSession.started_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedSession.completed ? (
                <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" /> Completo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Abandonado
                </span>
              )}
            </div>
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

          {selectedSession.last_group_title && (
            <p className="text-[11px] text-muted-foreground">
              Último grupo: <span className="font-medium text-foreground">{selectedSession.last_group_title}</span>
            </p>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Timeline da conversa</p>
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
                        isUser ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : isGpt ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
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

  // List view
  return (
    <div className="max-w-5xl space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
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
        <Button variant="outline" size="sm" onClick={loadSessions}>
          Atualizar
        </Button>
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
            return (
              <button
                key={session.id}
                onClick={() => openSession(session)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all text-left"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  session.completed ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}>
                  {session.completed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
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
                    {session.last_group_title && (
                      <>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[11px] text-muted-foreground truncate">Parou em: {session.last_group_title}</span>
                      </>
                    )}
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
