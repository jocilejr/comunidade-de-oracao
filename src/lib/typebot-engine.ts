import {
  TypebotFlow,
  TypebotBlock,
  TypebotGroup,
  TypebotEdge,
  TypebotVariable,
  TypebotComparison,
  ComparisonOperator,
  ChatMessage,
  RichTextChild,
  RichTextContent,
  ChoiceInputBlock,
  ConditionBlock,
  SetVariableBlock,
  WebhookBlock,
  RedirectBlock,
  WaitBlock,
  AbTestBlock,
  JumpBlock,
  OpenAIBlock,
  TextBubbleBlock,
  ImageBubbleBlock,
  VideoBubbleBlock,
  AudioBubbleBlock,
  EmbedBubbleBlock,
} from './typebot-types';

export type EngineEvent =
  | { type: 'messages'; messages: ChatMessage[] }
  | { type: 'input'; block: TypebotBlock }
  | { type: 'choices'; block: ChoiceInputBlock }
  | { type: 'redirect'; url: string; isNewTab: boolean }
  | { type: 'wait'; seconds: number }
  | { type: 'end' }
  | { type: 'error'; message: string };

export class TypebotEngine {
  private flow: TypebotFlow;
  private variables: Map<string, string>;
  private currentGroupIndex: number = 0;
  private currentBlockIndex: number = 0;
  private totalBlocks: number = 0;
  private processedBlocks: number = 0;
  private ownerUserId: string | null = null;
  private pausedContext: { group: TypebotGroup; nextBlockIndex: number } | null = null;
  private conversationHistory: Array<{ role: 'assistant' | 'user'; content: string }> = [];
  private sessionId: string | null = null;
  private funnelId: string | null = null;
  private lastGroupTitle: string = '';
  private lastBlockId: string = '';
  private useApiLog: boolean = false;
  private sessionReady: Promise<void>;
  private heartbeatInterval: number | null = null;
  private resolveSessionReady!: () => void;

  constructor(flow: TypebotFlow, options?: { ownerUserId?: string; funnelId?: string }) {
    this.flow = flow;
    this.variables = new Map();
    this.ownerUserId = options?.ownerUserId || null;
    this.funnelId = options?.funnelId || null;
    this.sessionReady = new Promise<void>(resolve => {
      this.resolveSessionReady = resolve;
    });

    // On public domain, use the api-server endpoint for logging instead of Supabase client
    const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
    if (publicDomain) {
      try {
        const pubHost = new URL(publicDomain).hostname;
        if (window.location.hostname === pubHost) {
          this.useApiLog = true;
        }
      } catch { /* ignore */ }
    }

    // Initialize variables
    for (const v of flow.variables || []) {
      if (v.value !== undefined && v.value !== null) {
        this.variables.set(v.id, String(v.value));
      }
    }

    // Count total blocks for progress
    this.totalBlocks = flow.groups.reduce((sum, g) => sum + g.blocks.length, 0);
  }

  getProgress(): number {
    if (this.totalBlocks === 0) return 0;
    return Math.min((this.processedBlocks / this.totalBlocks) * 100, 100);
  }

  getVariableValue(variableId: string): string {
    return this.variables.get(variableId) || '';
  }

  getVariableName(variableId: string): string {
    const v = this.flow.variables?.find(v => v.id === variableId);
    return v?.name || variableId;
  }

  setVariable(variableId: string, value: string): void {
    this.variables.set(variableId, value);
  }

  replaceVariables(text: string): string {
    if (!text) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
      const trimmed = varName.trim();
      // Search by name
      const v = this.flow.variables?.find(v => v.name === trimmed);
      if (v) return this.variables.get(v.id) || '';
      // Search by id
      return this.variables.get(trimmed) || '';
    });
  }

  private getStartGroupFromEvent(): TypebotGroup | undefined {
    const rawFlow = this.flow as TypebotFlow & {
      events?: Array<{ id?: string; type?: string; outgoingEdgeId?: string }>;
    };

    const startEvent = rawFlow.events?.find(
      event => String(event?.type || '').toLowerCase() === 'start'
    );

    if (startEvent?.outgoingEdgeId) {
      const edge = this.findEdge(startEvent.outgoingEdgeId);
      const targetGroupId = edge?.to?.groupId;
      if (targetGroupId) {
        const targetGroup = this.findGroupById(targetGroupId);
        if (targetGroup) return targetGroup;
      }
    }

    const fallbackEventEdge = (this.flow.edges || []).find(edge => {
      const from = edge.from as { eventId?: string } | undefined;
      return Boolean(from?.eventId) && Boolean(edge.to?.groupId);
    });

    if (fallbackEventEdge?.to?.groupId) {
      return this.findGroupById(fallbackEventEdge.to.groupId);
    }

    return undefined;
  }

  private getStartGroup(): TypebotGroup | undefined {
    const groups = this.flow.groups || [];
    if (groups.length === 0) return undefined;

    // 1) Prefer start event (Typebot runtime behavior)
    const eventStart = this.getStartGroupFromEvent();
    if (eventStart) return eventStart;

    // 2) Prefer explicit "start" block
    const explicitStart = groups.find(group =>
      group.blocks.some(block => this.normalizeBlockType(block.type) === 'start')
    );
    if (explicitStart) return explicitStart;

    // 3) Fallback to groups without incoming edges
    const incomingGroupIds = new Set(
      (this.flow.edges || [])
        .map(edge => edge.to?.groupId)
        .filter((groupId): groupId is string => Boolean(groupId))
    );

    const noIncoming = groups.filter(group => !incomingGroupIds.has(group.id));
    if (noIncoming.length === 1) return noIncoming[0];

    if (noIncoming.length > 1) {
      const withOutgoing = noIncoming.find(group => this.findEdgeFromGroup(group.id));
      if (withOutgoing) return withOutgoing;
      return noIncoming[0];
    }

    // 4) Final fallback
    return groups[0];
  }

  private findGroupById(groupId: string): TypebotGroup | undefined {
    return this.flow.groups.find(g => g.id === groupId);
  }

  private findEdge(edgeId: string): TypebotEdge | undefined {
    return this.flow.edges.find(e => e.id === edgeId);
  }

  private findEdgeFromBlock(blockId: string): TypebotEdge | undefined {
    return this.flow.edges.find(e => e.from.blockId === blockId);
  }

  private findEdgeFromGroup(groupId: string): TypebotEdge | undefined {
    return this.flow.edges.find(e => e.from.groupId === groupId && !e.from.blockId);
  }

  async* start(): AsyncGenerator<EngineEvent> {
    // Fire-and-forget session creation — don't block first message rendering
    if (this.funnelId) {
      this.createSessionAsync().then(() => {
        this.startHeartbeat();
      });
    } else {
      this.resolveSessionReady();
    }

    const group = this.getStartGroup();
    if (!group) {
      yield { type: 'end' };
      return;
    }
    yield* this.processGroup(group, 0);
  }

  private async createSessionAsync(): Promise<void> {
    try {
      if (this.useApiLog) {
        const resp = await fetch('/functions/v1/session-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_session', funnel_id: this.funnelId }),
        });
        const data = await resp.json();
        if (data?.id) this.sessionId = data.id;
      } else {
        const { supabase } = await import('@/integrations/supabase/client');
        
        // Increment access_count for the currently active preview image
        const { data: funnelData } = await supabase
          .from('funnels')
          .select('preview_image')
          .eq('id', this.funnelId!)
          .maybeSingle();

        if (funnelData?.preview_image) {
          const { data: imgData } = await supabase
            .from('funnel_preview_images')
            .select('id, access_count')
            .eq('funnel_id', this.funnelId!)
            .eq('data_url', funnelData.preview_image)
            .maybeSingle();

          if (imgData) {
            await supabase
              .from('funnel_preview_images')
              .update({ access_count: (imgData.access_count || 0) + 1 } as any)
              .eq('id', imgData.id);
          }
        }

        const { data } = await supabase
          .from('funnel_sessions')
          .insert({ funnel_id: this.funnelId! })
          .select('id')
          .single();
        if (data) this.sessionId = data.id;
      }
    } catch (e) {
      console.warn('Failed to create session:', e);
    } finally {
      this.resolveSessionReady();
    }
  }

  private async logEvent(
    eventType: string,
    blockId?: string,
    content?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.sessionReady;
    if (!this.sessionId) return;
    try {
      if (this.useApiLog) {
        await fetch('/functions/v1/session-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_event',
            session_id: this.sessionId,
            event_type: eventType,
            block_id: blockId || null,
            group_title: this.lastGroupTitle || null,
            content: content || null,
            metadata: metadata || {},
          }),
        });
      } else {
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.from('funnel_session_events').insert({
          session_id: this.sessionId,
          event_type: eventType,
          block_id: blockId || null,
          group_title: this.lastGroupTitle || null,
          content: content || null,
          metadata: metadata || {},
        });
      }
    } catch (e) {
      console.warn('Failed to log event:', e);
    }
  }

  private async updateSession(updates: Record<string, any>): Promise<void> {
    await this.sessionReady;
    if (!this.sessionId) return;
    try {
      const vars: Record<string, string> = {};
      for (const v of this.flow.variables || []) {
        const val = this.variables.get(v.id);
        if (val) vars[v.name] = val;
      }

      const payload = {
        session_id: this.sessionId,
        variables: vars,
        last_group_title: this.lastGroupTitle,
        last_block_id: this.lastBlockId,
        ...updates,
      };

      if (this.useApiLog) {
        await fetch('/functions/v1/session-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_session',
            ...payload,
          }),
        });
      } else {
        const { supabase } = await import('@/integrations/supabase/client');
        const updateData: Record<string, unknown> = {
          variables: payload.variables,
          last_group_title: payload.last_group_title,
          last_block_id: payload.last_block_id,
        };
        if ('ended_at' in payload) updateData.ended_at = (payload as any).ended_at;
        if ('completed' in payload) updateData.completed = (payload as any).completed;
        await supabase.from('funnel_sessions').update(updateData as any).eq('id', this.sessionId);
      }
    } catch (e) {
      console.warn('Failed to update session:', e);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = window.setInterval(() => {
      this.updateSession({});
    }, 30000); // Heartbeat every 30s
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async* processFromEdge(edgeId: string): AsyncGenerator<EngineEvent> {
    const edge = this.findEdge(edgeId);
    if (!edge) {
      yield { type: 'end' };
      return;
    }

    const group = this.findGroupById(edge.to.groupId);
    if (!group) {
      yield { type: 'end' };
      return;
    }

    // Find starting block index
    let blockIndex = 0;
    if (edge.to.blockId) {
      const idx = group.blocks.findIndex(b => b.id === edge.to.blockId);
      if (idx >= 0) blockIndex = idx;
    }
    yield* this.processGroup(group, blockIndex);
  }

  private pushHistory(role: 'assistant' | 'user', content: string): void {
    if (!content.trim()) return;
    this.conversationHistory.push({ role, content });
    if (this.conversationHistory.length > 5) {
      this.conversationHistory.shift();
    }
  }

  async* continueAfterInput(block: TypebotBlock, value: string): AsyncGenerator<EngineEvent> {
    // Store value in variable if configured
    const options = (block as any).options;
    if (options?.variableId) {
      this.setVariable(options.variableId, value);
    }

    this.pushHistory('user', value);
    this.logEvent('user_input', block.id, value, options?.variableId ? { variableId: options.variableId } : {});

    this.processedBlocks++;

    // Follow outgoing edge
    const edgeId = block.outgoingEdgeId;
    if (edgeId) {
      this.pausedContext = null;
      yield* this.processFromEdge(edgeId);
    } else {
      const edge = this.findEdgeFromBlock(block.id);
      if (edge) {
        this.pausedContext = null;
        yield* this.processFromEdge(edge.id);
      } else if (this.pausedContext) {
        // Fallback: continue to next block in the same group
        const { group, nextBlockIndex } = this.pausedContext;
        this.pausedContext = null;
        if (nextBlockIndex < group.blocks.length) {
          yield* this.processGroup(group, nextBlockIndex);
        } else {
          yield { type: 'end' };
        }
      } else {
        yield { type: 'end' };
      }
    }
  }

  async* continueAfterChoice(block: ChoiceInputBlock, itemId: string, value: string): AsyncGenerator<EngineEvent> {
    // Store selected value
    const options = (block as any).options;
    if (options?.variableId) {
      this.setVariable(options.variableId, value);
    }

    this.pushHistory('user', value);
    this.logEvent('choice', block.id, value, { itemId });

    this.processedBlocks++;

    // Find the chosen item's edge
    const item = block.items.find(i => i.id === itemId);
    if (item?.outgoingEdgeId) {
      this.pausedContext = null;
      yield* this.processFromEdge(item.outgoingEdgeId);
      return;
    }

    // Fallback to block's outgoing edge
    if (block.outgoingEdgeId) {
      this.pausedContext = null;
      yield* this.processFromEdge(block.outgoingEdgeId);
    } else {
      const edge = this.findEdgeFromBlock(block.id);
      if (edge) {
        this.pausedContext = null;
        yield* this.processFromEdge(edge.id);
      } else if (this.pausedContext) {
        // Fallback: continue to next block in the same group
        const { group, nextBlockIndex } = this.pausedContext;
        this.pausedContext = null;
        if (nextBlockIndex < group.blocks.length) {
          yield* this.processGroup(group, nextBlockIndex);
        } else {
          yield { type: 'end' };
        }
      } else {
        yield { type: 'end' };
      }
    }
  }

  private async* processGroup(group: TypebotGroup, startIndex: number): AsyncGenerator<EngineEvent> {
    const messages: ChatMessage[] = [];
    this.lastGroupTitle = group.title || group.id;
    this.updateSession({}); // Update stage in DB immediately when entering group

    for (let i = startIndex; i < group.blocks.length; i++) {
      const block = group.blocks[i];
      this.lastBlockId = block.id;
      const blockType = this.normalizeBlockType(block.type);
      

      // Bubble blocks — collect messages
      if (this.isBubbleBlock(blockType)) {
          const msg = this.blockToMessage(block);
          if (msg) {
            messages.push(msg);
            // Track bot text messages in conversation history
            if (msg.content && !msg.mediaType) {
              const plainText = msg.content.replace(/<[^>]*>/g, '').trim();
              if (plainText) {
                this.pushHistory('assistant', plainText);
                this.logEvent('bot_message', block.id, plainText);
              }
            } else if (msg.mediaType) {
              this.logEvent('bot_message', block.id, `[${msg.mediaType}] ${msg.mediaUrl || ''}`);
            }
          }
        this.processedBlocks++;
        continue;
      }

      // Flush messages before processing logic/input
      if (messages.length > 0) {
        yield { type: 'messages', messages: [...messages] };
        messages.length = 0;
      }

      // Input blocks — pause and wait for user
      if (this.isInputBlock(blockType)) {
        // Save context so we can resume at the next block in this group
        this.pausedContext = { group, nextBlockIndex: i + 1 };
        if (blockType === 'choice' || blockType === 'picturechoice') {
          yield { type: 'choices', block: block as ChoiceInputBlock };
        } else {
          yield { type: 'input', block };
        }
        return; // Pause — will resume via continueAfterInput/continueAfterChoice
      }

      // Logic blocks — process immediately
      const result = yield* this.processLogicBlock(block, group, i);
      if (result === 'stop') return;
    }

    // Flush remaining messages
    if (messages.length > 0) {
      yield { type: 'messages', messages: [...messages] };
    }

    // After processing all blocks in group, follow outgoing edge of last block
    const lastBlock = group.blocks[group.blocks.length - 1];
    if (lastBlock) {
      const edgeId = lastBlock.outgoingEdgeId;
      if (edgeId) {
        yield* this.processFromEdge(edgeId);
        return;
      }
      const edge = this.findEdgeFromBlock(lastBlock.id);
      if (edge) {
        yield* this.processFromEdge(edge.id);
        return;
      }
    }

    // Fallback: try edge from group itself (e.g. Start group)
    const groupEdge = this.findEdgeFromGroup(group.id);
    if (groupEdge) {
      yield* this.processFromEdge(groupEdge.id);
      return;
    }

    this.logEvent('end');
    this.stopHeartbeat();
    this.updateSession({ ended_at: new Date().toISOString(), completed: true });
    yield { type: 'end' };
  }

  private async* processLogicBlock(block: TypebotBlock, group: TypebotGroup, index: number): AsyncGenerator<EngineEvent, 'continue' | 'stop'> {
    const blockType = this.normalizeBlockType(block.type);
    this.processedBlocks++;

    try {
      switch (blockType) {
        case 'condition': {
          const condBlock = block as ConditionBlock;
          if (condBlock.items) {
            for (const item of condBlock.items) {
              if (item.content?.comparisons && this.evaluateCondition(item.content.comparisons, item.content.logicalOperator || 'AND')) {
                if (item.outgoingEdgeId) {
                  yield* this.processFromEdge(item.outgoingEdgeId);
                  return 'stop';
                }
              }
            }
          }
          if (block.outgoingEdgeId) {
            yield* this.processFromEdge(block.outgoingEdgeId);
            return 'stop';
          }
          return 'continue';
        }

        case 'setvariable': {
          const svBlock = block as SetVariableBlock;
          if (svBlock.content?.variableId) {
            const value = this.evaluateSetVariable(svBlock);
            this.setVariable(svBlock.content.variableId, value);
          }
          return 'continue';
        }

        case 'redirect': {
          const rdBlock = block as RedirectBlock;
          const rdOpts = (rdBlock as any).options || {};
          const rdUrl = rdBlock.content?.url || rdOpts.url;
          if (rdUrl) {
            const url = this.replaceVariables(rdUrl);
            const isNewTab = rdBlock.content?.isNewTab ?? rdOpts.isNewTab ?? false;
            yield { type: 'redirect', url, isNewTab };
            return 'stop';
          }
          return 'continue';
        }

        case 'webhook': {
          const whBlock = block as WebhookBlock;
          await this.executeWebhook(whBlock);
          return 'continue';
        }

        case 'script': {
          try {
            const code = this.replaceVariables((block as any).content?.code || '');
            if (code) {
              const fn = new Function('variables', 'setVariable', code);
              const getVar = (name: string) => {
                const v = this.flow.variables?.find(v => v.name === name);
                return v ? this.variables.get(v.id) || '' : '';
              };
              const setVar = (name: string, val: string) => {
                const v = this.flow.variables?.find(v => v.name === name);
                if (v) this.variables.set(v.id, String(val));
              };
              fn(getVar, setVar);
            }
          } catch (e) {
            console.warn('Script execution error:', e);
          }
          return 'continue';
        }

        case 'wait': {
          const waitBlock = block as WaitBlock;
          const waitOpts = (waitBlock as any).options || {};
          const raw = waitBlock.content?.secondsToWaitFor
            ?? waitOpts.secondsToWaitFor
            ?? waitOpts.seconds
            ?? waitOpts.delay
            ?? (waitBlock.content as any)?.seconds
            ?? (waitBlock.content as any)?.delay;
          const seconds = raw !== undefined && raw !== null
            ? Number(this.replaceVariables(String(raw)))
            : 1;
          yield { type: 'wait', seconds: isNaN(seconds) || seconds <= 0 ? 1 : seconds };
          return 'continue';
        }

        case 'abtest': {
          const abBlock = block as AbTestBlock;
          if (abBlock.items) {
            const random = Math.random() * 100;
            let cumulative = 0;
            for (const item of abBlock.items) {
              cumulative += item.percent;
              if (random <= cumulative && item.outgoingEdgeId) {
                yield* this.processFromEdge(item.outgoingEdgeId);
                return 'stop';
              }
            }
          }
          return 'continue';
        }

        case 'jump': {
          const jumpBlock = block as JumpBlock;
          if (jumpBlock.content?.groupId) {
            const targetGroup = this.findGroupById(jumpBlock.content.groupId);
            if (targetGroup) {
              let blockIdx = 0;
              if (jumpBlock.content.blockId) {
                const idx = targetGroup.blocks.findIndex(b => b.id === jumpBlock.content.blockId);
                if (idx >= 0) blockIdx = idx;
              }
              yield* this.processGroup(targetGroup, blockIdx);
              return 'stop';
            }
          }
          return 'continue';
        }

        case 'typebotlink': {
          console.warn('Typebot link blocks not supported in standalone mode');
          return 'continue';
        }

        case 'openai': {
          await this.executeOpenAI(block as OpenAIBlock);
          return 'continue';
        }

        default:
          console.warn(`Unsupported block type: ${block.type}`);
          return 'continue';
      }
    } catch (e) {
      console.warn(`Error processing block ${block.type}:`, e);
      return 'continue';
    }
  }

  private evaluateSetVariable(block: SetVariableBlock): string {
    if (!block.content) return '';
    const { type, expressionToEvaluate, isCode } = block.content;

    if (type === 'Empty') return '';
    if (type === 'Random ID') return crypto.randomUUID().slice(0, 8);
    if (type === 'Today') return new Date().toISOString().split('T')[0];
    if (type === 'Tomorrow') {
      const d = new Date(); d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    if (type === 'Yesterday') {
      const d = new Date(); d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    if (type === 'Now') return new Date().toISOString();
    if (type === 'Moment of the day') {
      const h = new Date().getHours();
      if (h < 12) return 'morning';
      if (h < 18) return 'afternoon';
      return 'evening';
    }

    if (expressionToEvaluate) {
      const replaced = this.replaceVariables(expressionToEvaluate);
      if (isCode) {
        try {
          return String(new Function('return ' + replaced)());
        } catch {
          return replaced;
        }
      }
      return replaced;
    }

    return '';
  }

  private evaluateCondition(comparisons: TypebotComparison[], logicalOp: 'AND' | 'OR'): boolean {
    if (comparisons.length === 0) return true;

    const results = comparisons.map(c => {
      const varValue = this.variables.get(c.variableId) || '';
      const compareValue = this.replaceVariables(c.value || '');
      return this.compare(varValue, c.comparisonOperator, compareValue);
    });

    return logicalOp === 'AND' ? results.every(Boolean) : results.some(Boolean);
  }

  private normalize(s: string): string {
    return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private compare(a: string, op: ComparisonOperator, b: string): boolean {
    const aN = this.normalize(a);
    const bN = this.normalize(b);

    switch (op) {
      case 'Equal to': return aN === bN;
      case 'Not equal': return aN !== bN;
      case 'Contains': return aN.includes(bN);
      case 'Does not contain': return !aN.includes(bN);
      case 'Greater than': return Number(a) > Number(b);
      case 'Less than': return Number(a) < Number(b);
      case 'Is set': return a !== '' && a !== undefined && a !== null;
      case 'Is empty': return a === '' || a === undefined || a === null;
      case 'Starts with': return aN.startsWith(bN);
      case 'Ends with': return aN.endsWith(bN);
      case 'Matches regex': try { return new RegExp(b).test(a); } catch { return false; }
      case 'Does not match regex': try { return !new RegExp(b).test(a); } catch { return true; }
      default: return false;
    }
  }

  private async executeWebhook(block: WebhookBlock): Promise<void> {
    try {
      const webhook = block.options?.webhook || block.content;
      if (!webhook?.url) return;

      const url = this.replaceVariables(webhook.url);
      const method = (webhook.method || 'POST').toUpperCase();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Add custom headers
      if (block.options?.webhook?.headers) {
        for (const h of block.options.webhook.headers) {
          if (h.key && h.value) {
            headers[this.replaceVariables(h.key)] = this.replaceVariables(h.value);
          }
        }
      } else if (webhook.headers) {
        const hdrs = webhook.headers as Record<string, string>;
        for (const [k, v] of Object.entries(hdrs)) {
          headers[this.replaceVariables(k)] = this.replaceVariables(v);
        }
      }

      let body: string | undefined;
      const rawBody = (block.options?.webhook?.body || webhook.body) as string | undefined;
      if (rawBody && method !== 'GET') {
        body = this.replaceVariables(rawBody);
      } else if (method !== 'GET') {
        // Send all variables as body
        const vars: Record<string, string> = {};
        for (const v of this.flow.variables || []) {
          const val = this.variables.get(v.id);
          if (val) vars[v.name] = val;
        }
        body = JSON.stringify(vars);
      }

      // Build query params
      const queryParams = block.options?.webhook?.queryParams || (webhook as any).queryParams;
      let finalUrl = url;
      if (queryParams && Array.isArray(queryParams)) {
        const params = new URLSearchParams();
        for (const p of queryParams) {
          if (p.key && p.value) {
            params.set(this.replaceVariables(p.key), this.replaceVariables(p.value));
          }
        }
        const qs = params.toString();
        if (qs) finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs;
      }

      const response = await fetch(finalUrl, {
        method,
        headers,
        body: method !== 'GET' ? body : undefined,
      });

      // Map response to variables
      const mapping = block.options?.responseVariableMapping || block.content?.responseVariableMapping;
      if (mapping && mapping.length > 0) {
        try {
          const data = await response.json();
          for (const m of mapping) {
            if (m.variableId && m.bodyPath) {
              const value = this.getNestedValue(data, m.bodyPath);
              if (value !== undefined) {
                this.setVariable(m.variableId, String(value));
              }
            }
          }
        } catch {
          console.warn('Failed to parse webhook response');
        }
      }
    } catch (e) {
      console.warn('Webhook execution error:', e);
    }
  }

  private async executeOpenAI(block: OpenAIBlock): Promise<void> {
    try {
      const opts = block.options;
      if (!opts?.messages || opts.messages.length === 0) {
        console.warn('OpenAI block has no messages configured');
        return;
      }

      // Build messages with variable replacement
      const rawMessages = opts.messages.map(m => ({
        role: m.role || 'user',
        content: this.replaceVariables(m.content || ''),
      }));

      // Inject conversation history between system prompt and user messages
      const messages: Array<{ role: string; content: string }> = [];
      const systemMessages = rawMessages.filter(m => m.role === 'system');
      const nonSystemMessages = rawMessages.filter(m => m.role !== 'system');

      messages.push(...systemMessages);
      messages.push(...this.conversationHistory);
      messages.push(...nonSystemMessages);

      // Separate code tools (local execution) from API tools (sent to OpenAI)
      const allTools = opts.tools || [];
      const codeToolMap = new Map<string, string>();
      for (const t of allTools) {
        const ct = t as any;
        if (ct.code !== undefined) {
          const name = ct.function?.name || ct.name;
          if (name) codeToolMap.set(name, ct.code);
        }
      }
      // Only send NON-code tools to OpenAI API — code tools run locally as post-processing
      const apiTools = allTools
        .filter((t: any) => {
          const ct = t as any;
          return ct.code === undefined;
        })
        .map((t: any) => {
          const name = t.function?.name || t.name;
          if (!name) return null;
          const rawParams = t.function?.parameters || t.parameters;
          const params: Record<string, any> = (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams))
            ? { ...rawParams }
            : { type: 'object', properties: {} };
          return {
            type: 'function' as const,
            function: {
              name,
              description: t.function?.description || t.description || '',
              parameters: params,
            },
          };
        })
        .filter(Boolean);
      const tools = apiTools.length > 0 ? apiTools : undefined;

      if (!this.ownerUserId) {
        console.warn('Owner user ID not available for OpenAI block.');
        return;
      }

      // VPS: route to local api-server; Cloud: route to Supabase edge function
      const vpsPublic = import.meta.env.VITE_PUBLIC_DOMAIN;
      const vpsDash = import.meta.env.VITE_DASHBOARD_ORIGIN;
      const isVps = (vpsPublic && window.location.hostname === vpsPublic) ||
                    (vpsDash && window.location.origin === vpsDash);
      const proxyUrl = isVps
        ? `${window.location.origin}/openai-proxy`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`;
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages,
          model: opts.model || 'gpt-4',
          tools,
          userId: this.ownerUserId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('OpenAI proxy error:', response.status, errText);
        return;
      }

      const data = await response.json();

      // Extract response content
      const choice = data.choices?.[0];
      if (!choice) return;

      const assistantContent = choice.message?.content || '';
      this.logEvent('gpt_response', block.id, assistantContent, {
        model: opts.model || 'gpt-4',
        prompt: messages.map(m => `[${m.role}] ${m.content.substring(0, 200)}`),
      });

      // Execute code tools locally as POST-PROCESSING on GPT's text response
      // Code tools are NOT sent to OpenAI — they process the assistant's reply
      const codeToolResults: Record<string, string> = {};
      if (codeToolMap.size > 0) {
        for (const [fnName, code] of codeToolMap.entries()) {
          try {
            const input = assistantContent;
            const args: Record<string, any> = { input };
            for (const alias of ['texto', 'text', 'mensagem', 'message']) {
              if (code.includes(alias)) {
                args[alias] = input;
              }
            }
            const argDeclarations = Object.keys(args)
              .map(k => `var ${k} = args[${JSON.stringify(k)}];`)
              .join('\n');
            const fn = new Function('args', argDeclarations + '\n' + code);
            const result = fn(args);
            if (result === undefined || result === null) {
              codeToolResults[fnName] = '';
            } else if (typeof result === 'object') {
              codeToolResults[fnName] = JSON.stringify(result);
            } else {
              codeToolResults[fnName] = String(result);
            }
            console.log(`Code tool "${fnName}" executed on GPT response. Result:`, codeToolResults[fnName]);
          } catch (e) {
            console.warn(`Code tool "${fnName}" execution error:`, e);
          }
        }
      }

      const toolCalls = choice.message?.tool_calls;

      // Map response to variables
      if (opts.responseMapping) {
        // Get code tool result names for quick lookup
        const codeToolNames = Object.keys(codeToolResults);

        for (let idx = 0; idx < opts.responseMapping.length; idx++) {
          const mapping = opts.responseMapping[idx];
          if (!mapping.variableId) continue;

          const extract = mapping.valueToExtract || '';

          if (extract === 'Message content' || extract === 'Message Content' || (extract === '' && idx === 0)) {
            this.setVariable(mapping.variableId, assistantContent);
          } else if (extract === '' && idx > 0 && codeToolNames.length > 0) {
            // Subsequent mapping: use code tool result (post-processing of GPT response)
            const firstResult = codeToolResults[codeToolNames[0] as string];
            let finalValue = firstResult || '';
            try {
              const parsed = JSON.parse(finalValue);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const values = Object.values(parsed);
                if (values.length === 1) {
                  finalValue = String(values[0]);
                }
              }
            } catch { /* use raw string */ }
            this.setVariable(mapping.variableId, finalValue);
          } else if (extract === '' && idx > 0) {
            // No code tools, no API tool calls — fallback to assistant content
            this.setVariable(mapping.variableId, assistantContent);
          } else if (toolCalls && toolCalls.length > 0) {
            for (const tc of toolCalls) {
              try {
                const args = JSON.parse(tc.function?.arguments || '{}');
                const value = this.getNestedValue(args, extract) ?? args[extract];
                if (value !== undefined && value !== null) {
                  this.setVariable(mapping.variableId, String(value));
                }
              } catch {
                console.warn('Failed to parse tool call arguments');
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('OpenAI block execution error:', e);
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }

  private normalizeBlockType(type: string): string {
    const t = type.toLowerCase();
    if (t.includes('text') && (t.includes('bubble') || !t.includes('input'))) return 'text';
    if (t.includes('image') && t.includes('bubble')) return 'image';
    if (t.includes('image') && !t.includes('input')) return 'image';
    if (t.includes('video') && !t.includes('input')) return 'video';
    if (t.includes('audio') && !t.includes('input')) return 'audio';
    if (t.includes('embed')) return 'embed';
    if (t.includes('choice') && t.includes('picture')) return 'picturechoice';
    if (t.includes('choice') || t.includes('button')) return 'choice';
    if (t.includes('email')) return 'email';
    if (t.includes('phone')) return 'phone';
    if (t.includes('number')) return 'number';
    if (t.includes('url') && t.includes('input')) return 'url';
    if (t.includes('date')) return 'date';
    if (t.includes('file')) return 'file';
    if (t.includes('payment')) return 'payment';
    if (t.includes('rating')) return 'rating';
    if (t.includes('text') && t.includes('input')) return 'textinput';
    if (t === 'condition') return 'condition';
    if (t === 'set variable') return 'setvariable';
    if (t === 'redirect') return 'redirect';
    if (t.includes('webhook')) return 'webhook';
    if (t === 'script') return 'script';
    if (t === 'wait' || t.includes('wait')) return 'wait';
    if (t.includes('ab test')) return 'abtest';
    if (t === 'jump') return 'jump';
    if (t.includes('typebot link')) return 'typebotlink';
    if (t === 'openai') return 'openai';
    if (t === 'start') return 'start';
    return t;
  }

  private isBubbleBlock(normalizedType: string): boolean {
    return ['text', 'image', 'video', 'audio', 'embed'].includes(normalizedType);
  }

  private isInputBlock(normalizedType: string): boolean {
    return ['choice', 'picturechoice', 'textinput', 'email', 'phone', 'number', 'url', 'date', 'file', 'payment', 'rating'].includes(normalizedType);
  }

  private blockToMessage(block: TypebotBlock): ChatMessage | null {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const blockType = this.normalizeBlockType(block.type);
    const content = (block as any).content;

    if (!content) {
      console.warn(`Block ${block.type} has no content, skipping`);
      return null;
    }

    try {
      switch (blockType) {
        case 'text': {
          let text = '';
          const richText = content.richText;

          if (content.html) {
            text = this.replaceVariables(content.html);
          } else if (content.plainText) {
            text = this.replaceVariables(content.plainText);
          } else if (content.richText) {
            text = this.richTextToHtml(content.richText);
          }

          if (!text) return null;
          return { id, type: 'bot', content: text, richText, timestamp };
        }

        case 'image': {
          const url = content.url || content.src || '';
          if (!url) return null;
          return {
            id, type: 'bot', content: '', timestamp,
            mediaType: 'image',
            mediaUrl: this.replaceVariables(url),
            mediaAlt: content.alt || '',
          };
        }

        case 'video': {
          const url = content.url || content.id || '';
          if (!url) return null;
          return {
            id, type: 'bot', content: '', timestamp,
            mediaType: 'video',
            mediaUrl: this.replaceVariables(url),
          };
        }

        case 'audio': {
          const url = content.url || '';
          if (!url) return null;
          return {
            id, type: 'bot', content: '', timestamp,
            mediaType: 'audio',
            mediaUrl: this.replaceVariables(url),
          };
        }

        case 'embed': {
          const url = content.url || '';
          if (!url) return null;
          return {
            id, type: 'bot', content: '', timestamp,
            mediaType: 'embed',
            mediaUrl: this.replaceVariables(url),
            embedHeight: content.height || undefined,
          };
        }

        default:
          return null;
      }
    } catch (e) {
      console.warn(`Error converting block ${block.type} to message:`, e);
      return null;
    }
  }

  private richTextToHtml(richText: RichTextContent[]): string {
    return richText.map(node => {
      const children = node.children.map(child => this.richTextChildToHtml(child)).join('');
      if (node.type === 'p' || !node.type) return `<p>${this.replaceVariables(children)}</p>`;
      return this.replaceVariables(children);
    }).join('');
  }

  private richTextChildToHtml(child: RichTextChild): string {
    if (child.type === 'inline-variable' && child.variableId) {
      return this.getVariableValue(child.variableId);
    }

    if (child.type === 'a' && child.url) {
      const inner = child.children?.map(c => this.richTextChildToHtml(c)).join('') || '';
      return `<a href="${child.url}" target="_blank" rel="noopener" style="text-decoration:underline">${inner}</a>`;
    }

    if (child.children) {
      return child.children.map(c => this.richTextChildToHtml(c)).join('');
    }

    let text = child.text || '';
    if (child.bold) text = `<strong>${text}</strong>`;
    if (child.italic) text = `<em>${text}</em>`;
    if (child.underline) text = `<u>${text}</u>`;
    return text;
  }
}
