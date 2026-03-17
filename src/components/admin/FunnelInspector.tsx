import { useState } from 'react';
import { TypebotFlow, TypebotBlock, TypebotGroup, TypebotVariable } from '@/lib/typebot-types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown, MessageSquare, Image, Video, Headphones, Clock, MousePointer,
  Type, Mail, Phone, Hash, Link2, Calendar, FileUp, CreditCard, Star, ImageIcon,
  GitBranch, Variable, ExternalLink, Globe, Code, Zap, Shuffle, ArrowRight, Bot,
  Layers, Box, ListChecks
} from 'lucide-react';

interface FunnelInspectorProps {
  flow: TypebotFlow;
}

const CATEGORY_COLORS: Record<string, string> = {
  bubble: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  input: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  logic: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  integration: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

function getBlockCategory(type: string): string {
  const t = type.toLowerCase();
  if (['text', 'bubble text', 'image', 'bubble image', 'video', 'bubble video', 'audio', 'bubble audio', 'embed', 'bubble embed'].includes(t)) return 'bubble';
  if (t.includes('input') || t === 'choice input' || t === 'buttons input' || t.includes('picture choice')) return 'input';
  if (['condition', 'set variable', 'redirect', 'script', 'wait', 'jump', 'ab test', 'typebot link'].includes(t)) return 'logic';
  if (['openai', 'webhook'].includes(t)) return 'integration';
  return 'unknown';
}

function getBlockIcon(type: string) {
  const t = type.toLowerCase();
  if (t === 'text' || t === 'bubble text') return MessageSquare;
  if (t === 'image' || t === 'bubble image') return Image;
  if (t === 'video' || t === 'bubble video') return Video;
  if (t === 'audio' || t === 'bubble audio') return Headphones;
  if (t === 'embed' || t === 'bubble embed') return Globe;
  if (t === 'choice input' || t === 'buttons input') return MousePointer;
  if (t === 'text input') return Type;
  if (t === 'email input') return Mail;
  if (t === 'phone input') return Phone;
  if (t === 'number input') return Hash;
  if (t === 'url input') return Link2;
  if (t === 'date input') return Calendar;
  if (t === 'file input') return FileUp;
  if (t === 'payment input') return CreditCard;
  if (t === 'rating input') return Star;
  if (t.includes('picture choice')) return ImageIcon;
  if (t === 'condition') return GitBranch;
  if (t === 'set variable') return Variable;
  if (t === 'redirect') return ExternalLink;
  if (t === 'webhook') return Zap;
  if (t === 'script') return Code;
  if (t === 'wait') return Clock;
  if (t === 'jump') return ArrowRight;
  if (t === 'ab test') return Shuffle;
  if (t === 'typebot link') return Link2;
  if (t === 'openai') return Bot;
  return Box;
}

function getVariableName(id: string, variables: TypebotVariable[]): string {
  return variables.find(v => v.id === id)?.name || id;
}

// ---- Block Renderers ----

function BlockRenderer({ block, variables }: { block: TypebotBlock; variables: TypebotVariable[] }) {
  const type = block.type.toLowerCase();

  // Text bubble
  if (type === 'text' || type === 'bubble text') {
    const b = block as any;
    const html = b.content?.html || b.content?.plainText || '';
    const richText = b.content?.richText;
    let display = html;
    if (!display && richText) {
      display = richText.map((r: any) =>
        (r.children || []).map((c: any) => c.text || '').join('')
      ).join('\n');
    }
    return (
      <div className="bg-emerald-500/10 rounded-lg p-3 text-sm" dangerouslySetInnerHTML={{ __html: display || '<em class="text-muted-foreground">Vazio</em>' }} />
    );
  }

  // Image
  if (type === 'image' || type === 'bubble image') {
    const b = block as any;
    const url = b.content?.url || '';
    return (
      <div className="space-y-1">
        {url ? <img src={url} alt={b.content?.alt || ''} className="max-w-[200px] max-h-[150px] rounded-md border border-border object-cover" /> : null}
        <p className="text-xs text-muted-foreground break-all">{url || 'Sem URL'}</p>
      </div>
    );
  }

  // Audio
  if (type === 'audio' || type === 'bubble audio') {
    const b = block as any;
    const url = b.content?.url || '';
    return (
      <div className="space-y-2">
        {url && <audio controls src={url} className="w-full max-w-sm h-10" preload="metadata" />}
        <p className="text-xs text-muted-foreground break-all">{url || 'Sem URL'}</p>
      </div>
    );
  }

  // Video
  if (type === 'video' || type === 'bubble video') {
    const b = block as any;
    const url = b.content?.url || '';
    return (
      <div className="space-y-2">
        {url && <video controls src={url} className="max-w-[250px] max-h-[150px] rounded-md border border-border" preload="metadata" />}
        <p className="text-xs text-muted-foreground break-all">{url || 'Sem URL'}</p>
      </div>
    );
  }

  // Wait
  if (type === 'wait') {
    const b = block as any;
    const secs = b.content?.secondsToWaitFor || '?';
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={CATEGORY_COLORS.logic}>
          <Clock className="w-3 h-3 mr-1" /> {secs}s
        </Badge>
        {b.content?.shouldPause && <span className="text-xs text-muted-foreground">(pausa o chat)</span>}
      </div>
    );
  }

  // Choice / Buttons
  if (type === 'choice input' || type === 'buttons input') {
    const b = block as any;
    const items = b.items || [];
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item: any, i: number) => (
          <Badge key={item.id || i} variant="outline" className="bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400">
            {item.content || `Opção ${i + 1}`}
          </Badge>
        ))}
      </div>
    );
  }

  // Inputs (text, email, phone, number, url, date, file, rating)
  if (type.includes('input')) {
    const b = block as any;
    const placeholder = b.content?.placeholder || b.options?.labels?.placeholder || '';
    const varId = b.options?.variableId || b.content?.variableId;
    return (
      <div className="space-y-1">
        {placeholder && <p className="text-xs text-muted-foreground">Placeholder: <span className="font-mono">{placeholder}</span></p>}
        {varId && <p className="text-xs text-muted-foreground">Variável: <span className="font-mono text-sky-600 dark:text-sky-400">{getVariableName(varId, variables)}</span></p>}
      </div>
    );
  }

  // Set Variable
  if (type === 'set variable') {
    const b = block as any;
    const varName = getVariableName(b.content?.variableId || '', variables);
    const expr = b.content?.expressionToEvaluate || b.content?.type || '';
    return (
      <div className="font-mono text-xs space-y-1">
        <p><span className="text-amber-600 dark:text-amber-400">{varName}</span> = <span className="text-foreground">{expr || '<vazio>'}</span></p>
        {b.content?.isCode && <Badge variant="outline" className="text-[10px]">JavaScript</Badge>}
      </div>
    );
  }

  // Condition
  if (type === 'condition') {
    const b = block as any;
    const items = b.items || [];
    return (
      <div className="space-y-2">
        {items.map((item: any, i: number) => (
          <div key={item.id || i} className="border border-border rounded-md p-2 text-xs space-y-1">
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {i === 0 ? 'Se' : 'Senão se'} ({item.content?.logicalOperator || 'AND'})
            </span>
            {(item.content?.comparisons || []).map((cmp: any, j: number) => (
              <p key={cmp.id || j} className="font-mono pl-2">
                {getVariableName(cmp.variableId, variables)} <span className="text-muted-foreground">{cmp.comparisonOperator}</span> "{cmp.value}"
              </p>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // OpenAI
  if (type === 'openai') {
    const b = block as any;
    const opts = b.options || {};
    const messages = opts.messages || [];
    const model = opts.model || 'default';
    const responseMapping = opts.responseMapping || [];
    return (
      <div className="border-2 border-violet-500/30 bg-violet-500/5 rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/40">
            <Bot className="w-3 h-3 mr-1" /> {model}
          </Badge>
          {opts.action && <Badge variant="outline" className="text-[10px]">{opts.action}</Badge>}
        </div>
        {messages.map((msg: any, i: number) => (
          <div key={i} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">{msg.role}</p>
            <pre className="text-xs bg-background/60 rounded p-2 whitespace-pre-wrap break-words border border-border max-h-48 overflow-y-auto">{msg.content || '(vazio)'}</pre>
          </div>
        ))}
        {responseMapping.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Response Mapping</p>
            {responseMapping.map((rm: any, i: number) => (
              <p key={i} className="text-xs font-mono">
                {rm.valueToExtract} → <span className="text-violet-600 dark:text-violet-400">{getVariableName(rm.variableId, variables)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Webhook
  if (type === 'webhook') {
    const b = block as any;
    const webhook = b.options?.webhook || b.content || {};
    const url = webhook.url || b.content?.url || '';
    const method = webhook.method || b.content?.method || 'POST';
    const responseMapping = b.options?.responseVariableMapping || b.content?.responseVariableMapping || [];
    return (
      <div className="border border-violet-500/30 bg-violet-500/5 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">{method}</Badge>
          <span className="text-xs font-mono break-all">{url || 'Sem URL'}</span>
        </div>
        {webhook.body && (
          <pre className="text-xs bg-background/60 rounded p-2 whitespace-pre-wrap break-words border border-border max-h-32 overflow-y-auto">{webhook.body}</pre>
        )}
        {responseMapping.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response Mapping</p>
            {responseMapping.map((rm: any, i: number) => (
              <p key={i} className="text-xs font-mono">{rm.bodyPath} → {getVariableName(rm.variableId, variables)}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Redirect
  if (type === 'redirect') {
    const b = block as any;
    return (
      <div className="flex items-center gap-2 text-xs">
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
        <span className="font-mono break-all">{b.content?.url || 'Sem URL'}</span>
        {b.content?.isNewTab && <Badge variant="outline" className="text-[10px]">Nova aba</Badge>}
      </div>
    );
  }

  // Script
  if (type === 'script') {
    const b = block as any;
    return (
      <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words border border-border max-h-40 overflow-y-auto font-mono">
        {b.content?.code || '// vazio'}
      </pre>
    );
  }

  // Jump
  if (type === 'jump') {
    const b = block as any;
    return (
      <div className="flex items-center gap-2 text-xs">
        <ArrowRight className="w-3 h-3 text-amber-500" />
        <span>Ir para grupo: <span className="font-mono text-amber-600 dark:text-amber-400">{b.content?.groupId || '?'}</span></span>
      </div>
    );
  }

  // AB Test
  if (type === 'ab test') {
    const b = block as any;
    return (
      <div className="flex gap-2">
        {(b.items || []).map((item: any) => (
          <Badge key={item.id} variant="outline" className={CATEGORY_COLORS.logic}>
            Path {item.path}: {item.percent}%
          </Badge>
        ))}
      </div>
    );
  }

  // Typebot Link
  if (type === 'typebot link') {
    const b = block as any;
    return (
      <p className="text-xs font-mono">Link → Typebot: {b.content?.typebotId || '?'} {b.content?.groupId ? `/ Grupo: ${b.content.groupId}` : ''}</p>
    );
  }

  // Embed
  if (type === 'embed' || type === 'bubble embed') {
    const b = block as any;
    return <p className="text-xs font-mono break-all">{b.content?.url || 'Sem URL'}</p>;
  }

  // Generic fallback
  return (
    <pre className="text-xs bg-muted/30 rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

// ---- Group Renderer ----

function GroupSection({ group, index, variables }: { group: TypebotGroup; index: number; variables: TypebotVariable[] }) {
  const [open, setOpen] = useState(index === 0);
  const blockCount = group.blocks.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors group">
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        <Layers className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm text-foreground flex-1 text-left">{group.title || `Grupo ${index + 1}`}</span>
        <Badge variant="secondary" className="text-[10px]">{blockCount} bloco{blockCount !== 1 ? 's' : ''}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 pl-4 border-l-2 border-border mt-2 space-y-2 pb-2">
          {group.blocks.map((block, bi) => {
            const Icon = getBlockIcon(block.type);
            const cat = getBlockCategory(block.type);
            return (
              <div key={block.id || bi} className="flex gap-3 items-start">
                <div className={`mt-1 w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${CATEGORY_COLORS[cat]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{block.type}</p>
                  <BlockRenderer block={block} variables={variables} />
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Main Inspector ----

const FunnelInspector = ({ flow }: FunnelInspectorProps) => {
  const totalBlocks = flow.groups.reduce((sum, g) => sum + g.blocks.length, 0);

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Grupos', value: flow.groups.length, icon: Layers },
          { label: 'Blocos', value: totalBlocks, icon: Box },
          { label: 'Variáveis', value: flow.variables?.length || 0, icon: Variable },
          { label: 'Edges', value: flow.edges?.length || 0, icon: GitBranch },
        ].map(s => (
          <div key={s.label} className="border border-border rounded-lg p-3 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Variables list */}
      {flow.variables && flow.variables.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors">
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
            <ListChecks className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Variáveis ({flow.variables.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-2 mt-2 px-4">
              {flow.variables.map(v => (
                <Badge key={v.id} variant="outline" className="font-mono text-xs">
                  {v.name}{v.value ? ` = ${v.value}` : ''}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Groups */}
      <div className="space-y-3">
        {flow.groups.map((group, i) => (
          <GroupSection key={group.id} group={group} index={i} variables={flow.variables || []} />
        ))}
      </div>
    </div>
  );
};

export default FunnelInspector;
