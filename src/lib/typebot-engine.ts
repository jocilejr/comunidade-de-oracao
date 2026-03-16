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

  constructor(flow: TypebotFlow) {
    this.flow = flow;
    this.variables = new Map();

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

  private getStartGroup(): TypebotGroup | undefined {
    // First group is typically the start
    return this.flow.groups[0];
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

  async* start(): AsyncGenerator<EngineEvent> {
    const group = this.getStartGroup();
    if (!group) {
      yield { type: 'end' };
      return;
    }
    yield* this.processGroup(group, 0);
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

  async* continueAfterInput(block: TypebotBlock, value: string): AsyncGenerator<EngineEvent> {
    // Store value in variable if configured
    const options = (block as any).options;
    if (options?.variableId) {
      this.setVariable(options.variableId, value);
    }

    this.processedBlocks++;

    // Follow outgoing edge
    const edgeId = block.outgoingEdgeId;
    if (edgeId) {
      yield* this.processFromEdge(edgeId);
    } else {
      const edge = this.findEdgeFromBlock(block.id);
      if (edge) {
        yield* this.processFromEdge(edge.id);
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

    this.processedBlocks++;

    // Find the chosen item's edge
    const item = block.items.find(i => i.id === itemId);
    if (item?.outgoingEdgeId) {
      yield* this.processFromEdge(item.outgoingEdgeId);
      return;
    }

    // Fallback to block's outgoing edge
    if (block.outgoingEdgeId) {
      yield* this.processFromEdge(block.outgoingEdgeId);
    } else {
      const edge = this.findEdgeFromBlock(block.id);
      if (edge) {
        yield* this.processFromEdge(edge.id);
      } else {
        yield { type: 'end' };
      }
    }
  }

  private async* processGroup(group: TypebotGroup, startIndex: number): AsyncGenerator<EngineEvent> {
    const messages: ChatMessage[] = [];

    for (let i = startIndex; i < group.blocks.length; i++) {
      const block = group.blocks[i];
      const blockType = this.normalizeBlockType(block.type);

      // Bubble blocks — collect messages
      if (this.isBubbleBlock(blockType)) {
        const msg = this.blockToMessage(block);
        if (msg) messages.push(msg);
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
        if (blockType === 'choice' || blockType === 'picturechoice') {
          yield { type: 'choices', block: block as ChoiceInputBlock };
        } else {
          yield { type: 'input', block };
        }
        return; // Pause — will resume via continueAfterInput
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
          if (rdBlock.content?.url) {
            const url = this.replaceVariables(rdBlock.content.url);
            yield { type: 'redirect', url, isNewTab: rdBlock.content.isNewTab ?? false };
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
          const raw = waitBlock.content?.secondsToWaitFor ?? (waitBlock.content as any)?.seconds ?? (waitBlock.content as any)?.delay;
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

  private compare(a: string, op: ComparisonOperator, b: string): boolean {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    switch (op) {
      case 'Equal to': return aLower === bLower;
      case 'Not equal': return aLower !== bLower;
      case 'Contains': return aLower.includes(bLower);
      case 'Does not contain': return !aLower.includes(bLower);
      case 'Greater than': return Number(a) > Number(b);
      case 'Less than': return Number(a) < Number(b);
      case 'Is set': return a !== '' && a !== undefined && a !== null;
      case 'Is empty': return a === '' || a === undefined || a === null;
      case 'Starts with': return aLower.startsWith(bLower);
      case 'Ends with': return aLower.endsWith(bLower);
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
