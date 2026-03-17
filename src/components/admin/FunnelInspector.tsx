import { useState } from 'react';
import { TypebotFlow, TypebotBlock, TypebotGroup, TypebotVariable } from '@/lib/typebot-types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown, MessageSquare, Image, Video, Headphones, Clock, MousePointer,
  Type, Mail, Phone, Hash, Link2, Calendar, FileUp, CreditCard, Star, ImageIcon,
  GitBranch, Variable, ExternalLink, Globe, Code, Zap, Shuffle, ArrowRight, Bot,
  Layers, Box
} from 'lucide-react';

interface FunnelInspectorProps {
  flow: TypebotFlow;
}

function getBlockCategory(type: string): string {
  const t = type.toLowerCase();
  if (['text', 'bubble text', 'image', 'bubble image', 'video', 'bubble video', 'audio', 'bubble audio', 'embed', 'bubble embed'].includes(t)) return 'bubble';
  if (t.includes('input') || t === 'choice input' || t === 'buttons input' || t.includes('picture choice')) return 'input';
  if (['condition', 'set variable', 'redirect', 'script', 'wait', 'jump', 'ab test', 'typebot link'].includes(t)) return 'logic';
  if (['openai', 'webhook'].includes(t)) return 'integration';
  return 'unknown';
}

const BORDER_COLORS: Record<string, string> = {
  bubble: 'border-l-emerald-500',
  input: 'border-l-sky-500',
  logic: 'border-l-amber-500',
  integration: 'border-l-violet-500',
  unknown: 'border-l-muted-foreground',
};

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

function resolveVarName(ref: string, variables: TypebotVariable[]): string {
  if (!ref) return '?';
  const trimmed = ref.trim();
  // Try by id first
  const byId = variables.find(v => v.id === trimmed);
  if (byId) return byId.name;
  // Try by name
  const byName = variables.find(v => v.name === trimmed);
  if (byName) return byName.name;
  return trimmed;
}

function getInlineVariableId(node: any): string | null {
  // Format 1: variableId directly on node
  if (node.variableId) return node.variableId;
  // Format 2: children[0].variableId
  if (node.children?.[0]?.variableId) return node.children[0].variableId;
  return null;
}

function MustacheText({ text, variables }: { text: string; variables: TypebotVariable[] }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\{\{(.+)\}\}$/);
        if (match) {
          const name = resolveVarName(match[1].trim(), variables);
          return (
            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[11px] font-mono mx-0.5 align-baseline">
              {`{{${name}}}`}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function VarBadge({ id, variables }: { id: string; variables: TypebotVariable[] }) {
  const name = resolveVarName(id, variables);
  const notFound = !variables.find(v => v.id === id.trim() || v.name === id.trim());
  return (
    <Badge variant="outline" className={`font-mono text-xs ${notFound ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'}`}>
      {name}{notFound ? ' ⚠' : ''}
    </Badge>
  );
}

// ---- Block Renderers ----

function BlockContent({ block, variables }: { block: TypebotBlock; variables: TypebotVariable[] }) {
  const b = block as any;
  const type = block.type.toLowerCase();

  // Text bubble — supports inline variables from richText
  if (type === 'text' || type === 'bubble text') {
    const richText = b.content?.richText;
    if (richText && richText.length > 0) {
      const renderChild = (child: any, idx: number) => {
        // Inline variable node
        if (child.type === 'inline-variable') {
          const varId = child.children?.[0]?.variableId;
          if (varId) {
            return (
              <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[11px] font-mono mx-0.5 align-baseline">
                {`{{${getVarName(varId, variables)}}}`}
              </span>
            );
          }
          return null;
        }
        // Normal text node
        const text = child.text || '';
        if (!text) return null;
        const style: React.CSSProperties = {};
        if (child.bold) style.fontWeight = 'bold';
        if (child.italic) style.fontStyle = 'italic';
        if (child.underline) style.textDecoration = 'underline';
        return <span key={idx} style={style}>{text}</span>;
      };

      const hasContent = richText.some((r: any) =>
        (r.children || []).some((c: any) => c.text || c.type === 'inline-variable')
      );

      if (hasContent) {
        return (
          <div className="text-sm leading-relaxed text-foreground/90">
            {richText.map((r: any, ri: number) => (
              <p key={ri}>{(r.children || []).map(renderChild)}</p>
            ))}
          </div>
        );
      }
    }
    // Fallback to html/plainText
    const html = b.content?.html || b.content?.plainText || '';
    return html
      ? <div className="text-sm leading-relaxed text-foreground/90" dangerouslySetInnerHTML={{ __html: html }} />
      : <span className="text-sm text-muted-foreground italic">Vazio</span>;
  }

  // Image
  if (type === 'image' || type === 'bubble image') {
    const url = b.content?.url || '';
    return url
      ? <img src={url} alt={b.content?.alt || ''} className="max-w-[220px] max-h-[140px] rounded border border-border object-cover" />
      : <span className="text-sm text-muted-foreground">Sem URL</span>;
  }

  // Audio
  if (type === 'audio' || type === 'bubble audio') {
    const url = b.content?.url || '';
    return (
      <div className="space-y-1.5">
        {url && <audio controls src={url} className="w-full max-w-md h-9" preload="metadata" />}
        <p className="text-xs text-muted-foreground font-mono truncate">{url || 'Sem URL'}</p>
      </div>
    );
  }

  // Video
  if (type === 'video' || type === 'bubble video') {
    const url = b.content?.url || '';
    return (
      <div className="space-y-1.5">
        {url && <video controls src={url} className="max-w-[240px] max-h-[140px] rounded border border-border" preload="metadata" />}
        <p className="text-xs text-muted-foreground font-mono truncate">{url || 'Sem URL'}</p>
      </div>
    );
  }

  // Wait — fix: check options first
  if (type === 'wait') {
    const secs = b.options?.secondsToWaitFor || b.content?.secondsToWaitFor || '?';
    const shouldPause = b.options?.shouldPause || b.content?.shouldPause;
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-amber-500/15 rounded-full px-3 py-1.5">
          <Clock className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{secs}s</span>
        </div>
        {shouldPause && <span className="text-xs text-muted-foreground">(pausa o chat)</span>}
      </div>
    );
  }

  // Choice / Buttons
  if (type === 'choice input' || type === 'buttons input') {
    const items = b.items || [];
    const varId = b.options?.variableId;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {items.map((item: any, i: number) => (
            <Badge key={item.id || i} variant="outline" className="bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-400 text-xs">
              {item.content || `Opção ${i + 1}`}
            </Badge>
          ))}
        </div>
        {varId && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">→ <VarBadge id={varId} variables={variables} /></div>}
      </div>
    );
  }

  // Text Input — fix: prioritize options
  if (type === 'text input') {
    const placeholder = b.options?.labels?.placeholder || b.content?.placeholder || 'Digite aqui...';
    const varId = b.options?.variableId || b.content?.variableId;
    const buttonLabel = b.options?.labels?.button || '';
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground">
            {placeholder}
          </div>
          {buttonLabel && (
            <div className="bg-primary/20 border border-primary/30 rounded-md px-3 py-2 text-sm text-primary font-medium">
              {buttonLabel}
            </div>
          )}
        </div>
        {varId && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">Salva em: <VarBadge id={varId} variables={variables} /></div>}
      </div>
    );
  }

  // Other inputs
  if (type.includes('input')) {
    const placeholder = b.options?.labels?.placeholder || b.content?.placeholder || '';
    const varId = b.options?.variableId || b.content?.variableId;
    const buttonLabel = b.options?.labels?.button || '';
    return (
      <div className="space-y-2">
        {(placeholder || buttonLabel) && (
          <div className="flex items-center gap-2">
            {placeholder && (
              <div className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground">
                {placeholder}
              </div>
            )}
            {buttonLabel && (
              <div className="bg-primary/20 border border-primary/30 rounded-md px-3 py-2 text-sm text-primary font-medium">
                {buttonLabel}
              </div>
            )}
          </div>
        )}
        {varId && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">Salva em: <VarBadge id={varId} variables={variables} /></div>}
      </div>
    );
  }

  // Set Variable
  if (type === 'set variable') {
    const varName = getVarName(b.content?.variableId || '', variables);
    const expr = b.content?.expressionToEvaluate || b.content?.type || '';
    return (
      <div className="space-y-1">
        <div className="font-mono text-sm">
          <span className="text-amber-600 dark:text-amber-400 font-semibold">{varName}</span>
          <span className="text-muted-foreground"> = </span>
          <span className="text-foreground">{expr || '(vazio)'}</span>
        </div>
        {b.content?.isCode && <Badge variant="outline" className="text-[10px]">JavaScript</Badge>}
      </div>
    );
  }

  // Condition
  if (type === 'condition') {
    const items = b.items || [];
    return (
      <div className="space-y-2">
        {items.map((item: any, i: number) => (
          <div key={item.id || i} className="bg-muted/30 border border-border rounded-md p-2.5 text-sm space-y-1">
            <span className="font-semibold text-amber-600 dark:text-amber-400 text-xs">
              {i === 0 ? 'Se' : 'Senão se'} ({item.content?.logicalOperator || 'AND'})
            </span>
            {(item.content?.comparisons || []).map((cmp: any, j: number) => (
              <p key={cmp.id || j} className="font-mono text-xs pl-2">
                {getVarName(cmp.variableId, variables)} <span className="text-muted-foreground">{cmp.comparisonOperator}</span> "{cmp.value}"
              </p>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // OpenAI — fix: handle tools, options structure
  if (type === 'openai') {
    const opts = b.options || {};
    const messages = opts.messages || [];
    const model = opts.model || 'default';
    const responseMapping = opts.responseMapping || [];
    const tools = opts.tools || [];
    const credentialsId = b.credentialsId || opts.credentialsId;
    return (
      <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/40">
            <Bot className="w-3 h-3 mr-1" /> {model}
          </Badge>
          {opts.action && <Badge variant="outline" className="text-[10px]">{opts.action}</Badge>}
          {credentialsId && <span className="text-[10px] text-muted-foreground">cred: {credentialsId}</span>}
        </div>
        {messages.map((msg: any, i: number) => (
          <div key={i} className="space-y-1">
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">{msg.role}</p>
            <pre className="text-xs bg-background/80 rounded p-2.5 whitespace-pre-wrap break-words border border-border max-h-52 overflow-y-auto leading-relaxed">
              {msg.content || '(vazio)'}
            </pre>
          </div>
        ))}
        {tools.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">Tools</p>
            {tools.map((tool: any, i: number) => (
              <div key={i} className="bg-background/80 border border-border rounded p-2 space-y-1">
                <p className="text-xs font-semibold">{tool.name || `Tool ${i + 1}`}</p>
                {tool.description && <p className="text-xs text-muted-foreground">{tool.description}</p>}
                {tool.code && (
                  <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">{tool.code}</pre>
                )}
                {tool.parameters && (
                  <pre className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">
                    {typeof tool.parameters === 'string' ? tool.parameters : JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
        {responseMapping.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">Response Mapping</p>
            {responseMapping.map((rm: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-xs font-mono">
                <span>{rm.valueToExtract}</span>
                <span className="text-muted-foreground">→</span>
                <VarBadge id={rm.variableId} variables={variables} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Webhook
  if (type === 'webhook') {
    const webhook = b.options?.webhook || b.content || {};
    const url = webhook.url || b.content?.url || '';
    const method = webhook.method || b.content?.method || 'POST';
    const responseMapping = b.options?.responseVariableMapping || b.content?.responseVariableMapping || [];
    return (
      <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">{method}</Badge>
          <span className="text-xs font-mono text-foreground/80 break-all">{url || 'Sem URL'}</span>
        </div>
        {webhook.body && (
          <pre className="text-xs bg-background/80 rounded p-2 whitespace-pre-wrap break-words border border-border max-h-32 overflow-y-auto">{webhook.body}</pre>
        )}
        {responseMapping.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Response Mapping</p>
            {responseMapping.map((rm: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-xs font-mono">
                <span>{rm.bodyPath}</span>
                <span className="text-muted-foreground">→</span>
                <VarBadge id={rm.variableId} variables={variables} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Redirect
  if (type === 'redirect') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-mono break-all text-foreground/80">{b.content?.url || 'Sem URL'}</span>
        {b.content?.isNewTab && <Badge variant="outline" className="text-[10px]">Nova aba</Badge>}
      </div>
    );
  }

  // Script
  if (type === 'script') {
    return (
      <pre className="text-xs bg-muted/30 rounded p-2.5 whitespace-pre-wrap break-words border border-border max-h-40 overflow-y-auto font-mono">
        {b.content?.code || '// vazio'}
      </pre>
    );
  }

  // Jump
  if (type === 'jump') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
        <span>Ir para grupo: <span className="font-mono text-amber-600 dark:text-amber-400">{b.content?.groupId || '?'}</span></span>
      </div>
    );
  }

  // AB Test
  if (type === 'ab test') {
    return (
      <div className="flex gap-2">
        {(b.items || []).map((item: any) => (
          <Badge key={item.id} variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
            Path {item.path}: {item.percent}%
          </Badge>
        ))}
      </div>
    );
  }

  // Typebot Link
  if (type === 'typebot link') {
    return (
      <p className="text-sm font-mono">Link → Typebot: {b.content?.typebotId || '?'} {b.content?.groupId ? `/ Grupo: ${b.content.groupId}` : ''}</p>
    );
  }

  // Embed
  if (type === 'embed' || type === 'bubble embed') {
    return <p className="text-sm font-mono break-all text-foreground/80">{b.content?.url || 'Sem URL'}</p>;
  }

  // Fallback
  return (
    <pre className="text-xs bg-muted/20 rounded p-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

// ---- Group ----

function GroupSection({ group, index, variables }: { group: TypebotGroup; index: number; variables: TypebotVariable[] }) {
  const [open, setOpen] = useState(index === 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors">
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        <Layers className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm flex-1 text-left">{group.title || `Grupo ${index + 1}`}</span>
        <span className="text-xs text-muted-foreground">{group.blocks.length} bloco{group.blocks.length !== 1 ? 's' : ''}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 pl-2">
          {group.blocks.map((block, bi) => {
            const Icon = getBlockIcon(block.type);
            const cat = getBlockCategory(block.type);
            return (
              <div key={block.id || bi} className={`border-l-[3px] ${BORDER_COLORS[cat]} bg-card/50 rounded-r-md p-3 space-y-1.5`}>
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground">{block.type}</span>
                </div>
                <BlockContent block={block} variables={variables} />
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Main ----

const FunnelInspector = ({ flow }: FunnelInspectorProps) => {
  const totalBlocks = flow.groups.reduce((sum, g) => sum + g.blocks.length, 0);

  return (
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Compact header */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span><strong className="text-foreground">{flow.groups.length}</strong> grupos</span>
        <span><strong className="text-foreground">{totalBlocks}</strong> blocos</span>
        <span><strong className="text-foreground">{flow.variables?.length || 0}</strong> variáveis</span>
        <span><strong className="text-foreground">{flow.edges?.length || 0}</strong> edges</span>
      </div>

      {/* Variables */}
      {flow.variables && flow.variables.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors text-sm">
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            <Variable className="w-3.5 h-3.5 text-sky-500" />
            <span className="font-medium">Variáveis ({flow.variables.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-1.5 mt-2 px-3">
              {flow.variables.map(v => (
                <Badge key={v.id} variant="outline" className="font-mono text-xs bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30">
                  {v.name}{v.value ? ` = ${v.value}` : ''}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Groups */}
      <div className="space-y-2">
        {flow.groups.map((group, i) => (
          <GroupSection key={group.id} group={group} index={i} variables={flow.variables || []} />
        ))}
      </div>
    </div>
  );
};

export default FunnelInspector;
