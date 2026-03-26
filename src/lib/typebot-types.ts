// Core Typebot JSON types

export interface TypebotFlow {
  id: string;
  name: string;
  version?: string;
  groups: TypebotGroup[];
  edges: TypebotEdge[];
  variables: TypebotVariable[];
  theme?: TypebotTheme;
  settings?: TypebotSettings;
}

export interface TypebotGroup {
  id: string;
  title: string;
  graphCoordinates: { x: number; y: number };
  blocks: TypebotBlock[];
}

export interface TypebotEdge {
  id: string;
  from: { blockId: string; groupId?: string; itemId?: string };
  to: { blockId?: string; groupId: string };
}

export interface TypebotVariable {
  id: string;
  name: string;
  value?: string;
  isSessionVariable?: boolean;
}

export interface TypebotTheme {
  chat?: {
    hostBubbles?: { backgroundColor?: string; color?: string };
    guestBubbles?: { backgroundColor?: string; color?: string };
    buttons?: { backgroundColor?: string; color?: string };
  };
}

export interface TypebotSettings {
  general?: {
    isBrandingEnabled?: boolean;
    isInputPrefillEnabled?: boolean;
  };
  typingEmulation?: {
    enabled?: boolean;
    speed?: number;
    maxDelay?: number;
  };
}

// Block types
export type TypebotBlock =
  | TextBubbleBlock
  | ImageBubbleBlock
  | VideoBubbleBlock
  | AudioBubbleBlock
  | EmbedBubbleBlock
  | ChoiceInputBlock
  | TextInputBlock
  | EmailInputBlock
  | PhoneInputBlock
  | NumberInputBlock
  | UrlInputBlock
  | DateInputBlock
  | FileInputBlock
  | PaymentInputBlock
  | RatingInputBlock
  | PictureChoiceBlock
  | ConditionBlock
  | SetVariableBlock
  | RedirectBlock
  | WebhookBlock
  | ScriptBlock
  | TypebotLinkBlock
  | WaitBlock
  | AbTestBlock
  | JumpBlock
  | OpenAIBlock
  | GenericBlock;

interface BaseBlock {
  id: string;
  groupId: string;
  outgoingEdgeId?: string;
}

// Bubbles
export interface TextBubbleBlock extends BaseBlock {
  type: 'text' | 'Bubble text';
  content: { richText?: RichTextContent[]; html?: string; plainText?: string };
}

export interface RichTextContent {
  type: string;
  children: RichTextChild[];
}

export interface RichTextChild {
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  url?: string;
  type?: string;
  children?: RichTextChild[];
  variableId?: string;
}

export interface ImageBubbleBlock extends BaseBlock {
  type: 'image' | 'Bubble image';
  content: { url: string; clickLink?: { url: string }; alt?: string };
}

export interface VideoBubbleBlock extends BaseBlock {
  type: 'video' | 'Bubble video';
  content: { url: string; type?: string; id?: string };
}

export interface AudioBubbleBlock extends BaseBlock {
  type: 'audio' | 'Bubble audio';
  content: { url: string };
}

export interface EmbedBubbleBlock extends BaseBlock {
  type: 'embed' | 'Bubble embed';
  content: { url: string; height?: number };
}

// Inputs
export interface ChoiceInputBlock extends BaseBlock {
  type: 'choice input' | 'Buttons input';
  content?: { isMultipleChoice?: boolean; buttonLabel?: string };
  items: ChoiceItem[];
}

export interface ChoiceItem {
  id: string;
  content: string;
  outgoingEdgeId?: string;
  displayCondition?: {
    isEnabled?: boolean;
    condition?: TypebotCondition;
  };
}

export interface TextInputBlock extends BaseBlock {
  type: 'text input' | 'Text input';
  content?: { placeholder?: string; isLong?: boolean };
  options?: { variableId?: string; labels?: { placeholder?: string; button?: string } };
}

export interface EmailInputBlock extends BaseBlock {
  type: 'email input' | 'Email input';
  content?: { placeholder?: string };
  options?: { variableId?: string; labels?: { placeholder?: string; button?: string }; retryMessageContent?: string };
}

export interface PhoneInputBlock extends BaseBlock {
  type: 'phone input' | 'Phone input';
  content?: { placeholder?: string };
  options?: { variableId?: string; labels?: { placeholder?: string; button?: string }; retryMessageContent?: string; defaultCountryCode?: string };
}

export interface NumberInputBlock extends BaseBlock {
  type: 'number input' | 'Number input';
  content?: { placeholder?: string; min?: number; max?: number; step?: number };
  options?: { variableId?: string; labels?: { placeholder?: string; button?: string } };
}

export interface UrlInputBlock extends BaseBlock {
  type: 'url input' | 'Url input';
  content?: { placeholder?: string };
  options?: { variableId?: string; labels?: { placeholder?: string; button?: string }; retryMessageContent?: string };
}

export interface DateInputBlock extends BaseBlock {
  type: 'date input' | 'Date input';
  content?: { labels?: { button?: string; from?: string; to?: string }; isRange?: boolean };
  options?: { variableId?: string; labels?: { button?: string } };
}

export interface FileInputBlock extends BaseBlock {
  type: 'file input' | 'File input';
  content?: { labels?: { placeholder?: string; button?: string }; isMultipleAllowed?: boolean; isRequired?: boolean };
  options?: { variableId?: string };
}

export interface PaymentInputBlock extends BaseBlock {
  type: 'payment input' | 'Payment input';
  content?: { amount?: string; currency?: string; button?: string };
  options?: { variableId?: string };
}

export interface RatingInputBlock extends BaseBlock {
  type: 'rating input' | 'Rating input';
  content?: { length?: number; buttonLabel?: string; isOneClickSubmitEnabled?: boolean };
  options?: { variableId?: string; labels?: { button?: string } };
}

export interface PictureChoiceBlock extends BaseBlock {
  type: 'picture choice input' | 'Picture choice input';
  content?: { isMultipleChoice?: boolean; buttonLabel?: string };
  items: PictureChoiceItem[];
}

export interface PictureChoiceItem {
  id: string;
  content?: string;
  title?: string;
  description?: string;
  pictureSrc?: string;
  outgoingEdgeId?: string;
}

// Logic
export interface ConditionBlock extends BaseBlock {
  type: 'Condition';
  items: ConditionItem[];
}

export interface ConditionItem {
  id: string;
  content: {
    comparisons: TypebotComparison[];
    logicalOperator: 'AND' | 'OR';
  };
  outgoingEdgeId?: string;
}

export interface TypebotComparison {
  id: string;
  variableId: string;
  comparisonOperator: ComparisonOperator;
  value: string;
}

export type ComparisonOperator =
  | 'Equal to'
  | 'Not equal'
  | 'Contains'
  | 'Does not contain'
  | 'Greater than'
  | 'Less than'
  | 'Is set'
  | 'Is empty'
  | 'Starts with'
  | 'Ends with'
  | 'Matches regex'
  | 'Does not match regex';

export interface TypebotCondition {
  comparisons: TypebotComparison[];
  logicalOperator: 'AND' | 'OR';
}

export interface SetVariableBlock extends BaseBlock {
  type: 'Set variable';
  content: {
    variableId: string;
    expressionToEvaluate?: string;
    type?: 'Custom' | 'Empty' | 'Moment of the day' | 'Random ID' | 'Today' | 'Tomorrow' | 'Yesterday' | 'Map item with same index' | 'Environment name' | 'Transcript' | 'Contact name' | 'Phone number' | 'Now';
    isCode?: boolean;
  };
}

export interface RedirectBlock extends BaseBlock {
  type: 'Redirect';
  content: { url: string; isNewTab?: boolean };
}

export interface WebhookBlock extends BaseBlock {
  type: 'Webhook' | 'webhook';
  content: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    queryParams?: Array<{ id: string; key: string; value: string }>;
    responseVariableMapping?: Array<{ id: string; bodyPath: string; variableId: string }>;
  };
  webhookId?: string;
  options?: {
    variablesForTest?: Array<{ variableId: string; value: string }>;
    responseVariableMapping?: Array<{ id: string; bodyPath: string; variableId: string }>;
    webhook?: {
      url: string;
      method: string;
      headers?: Array<{ key: string; value: string }>;
      body?: string;
      queryParams?: Array<{ id: string; key: string; value: string }>;
    };
  };
}

export interface ScriptBlock extends BaseBlock {
  type: 'Script';
  content: { code: string; shouldExecuteInParentContext?: boolean };
}

export interface TypebotLinkBlock extends BaseBlock {
  type: 'Typebot link';
  content: { typebotId: string; groupId?: string };
}

export interface WaitBlock extends BaseBlock {
  type: 'Wait';
  content: { secondsToWaitFor: string | number; shouldPause?: boolean };
}

export interface AbTestBlock extends BaseBlock {
  type: 'AB test';
  items: Array<{ id: string; path: 'A' | 'B'; percent: number; outgoingEdgeId?: string }>;
}

export interface JumpBlock extends BaseBlock {
  type: 'Jump';
  content: { groupId: string; blockId?: string };
}

export interface OpenAIBlock extends BaseBlock {
  type: 'openai' | 'OpenAI';
  options?: {
    action?: string;
    model?: string;
    messages?: Array<{ role: string; content?: string; name?: string }>;
    responseMapping?: Array<{ id: string; valueToExtract: string; variableId: string }>;
    tools?: Array<{
      type: string;
      function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
      };
    }>;
  };
  content?: Record<string, unknown>;
}

export interface GenericBlock extends BaseBlock {
  type: string;
  content?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  webhookId?: string;
}

// Stored funnel
export interface StoredFunnel {
  id: string;
  slug: string;
  name: string;
  uploadedAt: string;
  flow: TypebotFlow;
  botName?: string;
  botAvatar?: string;
  previewImage?: string;
  pageTitle?: string;
  pageDescription?: string;
  userId?: string;
  metaPixelId?: string;
  metaCapiToken?: string;
}

// User Pixel (global)
export interface UserPixel {
  id: string;
  pixelId: string;
  capiToken?: string;
}

// Chat message for rendering
export interface ChatMessage {
  id: string;
  type: 'bot' | 'user';
  content: string;
  richText?: RichTextContent[];
  mediaType?: 'image' | 'video' | 'audio' | 'embed';
  mediaUrl?: string;
  mediaAlt?: string;
  embedHeight?: number;
  timestamp: number;
}
