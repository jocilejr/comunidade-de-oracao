import { ChatMessage } from '@/lib/typebot-types';
import AudioPlayer from './AudioPlayer';

interface BotBubbleProps {
  message: ChatMessage;
  botAvatar?: string;
  botName?: string;
  isFirst?: boolean;
  isLast?: boolean;
}

const AVATAR_SIZE = 28;
const AVATAR_GAP = 6;
const AVATAR_SPACE = AVATAR_SIZE + AVATAR_GAP; // 34px indent for non-first messages

const BotBubble = ({ message, botAvatar, botName, isFirst = true, isLast = true }: BotBubbleProps) => {
  const time = new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const bubbleRadius = isFirst ? 'rounded-[7.5px] rounded-tl-none' : 'rounded-[7.5px]';

  const avatar = isFirst ? (
    <div
      className="shrink-0 rounded-full overflow-hidden self-end"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, marginRight: AVATAR_GAP }}
    >
      {botAvatar ? (
        <img src={botAvatar} alt={botName || 'Bot'} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-[11px] font-bold"
          style={{ backgroundColor: 'hsl(var(--wa-time) / 0.3)', color: 'hsl(var(--wa-bot-foreground))' }}
        >
          {(botName || 'B').charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  ) : null;

  const indent = !isFirst ? { marginLeft: `${AVATAR_SPACE}px` } : undefined;

  if (message.mediaType === 'image' && message.mediaUrl) {
    return (
      <div className="flex items-end animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]" style={indent}>
        {avatar}
        <div className={`relative ${bubbleRadius} overflow-hidden shadow-sm`} style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          {isFirst && <BotTail />}
          <div className="p-[3px]">
            <img
              src={message.mediaUrl}
              alt={message.mediaAlt || 'Imagem'}
              className="max-w-full h-auto rounded-[4.5px] max-h-[300px] object-contain"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          {isLast && <TimeStamp time={time} />}
        </div>
      </div>
    );
  }

  if (message.mediaType === 'video' && message.mediaUrl) {
    const url = message.mediaUrl;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const embedUrl = isYoutube ? getYoutubeEmbedUrl(url) : url;

    return (
      <div className="flex items-end animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]" style={indent}>
        {avatar}
        <div className={`relative ${bubbleRadius} overflow-hidden shadow-sm w-full`} style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          {isFirst && <BotTail />}
          <div className="p-[3px]">
            {isYoutube ? (
              <iframe
                src={embedUrl}
                className="w-full aspect-video rounded-[4.5px]"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={url} controls className="w-full rounded-[4.5px] max-h-[300px]" />
            )}
          </div>
          {isLast && <TimeStamp time={time} />}
        </div>
      </div>
    );
  }

  if (message.mediaType === 'audio' && message.mediaUrl) {
    return (
      <div className="flex items-end animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[75%]" style={indent}>
        {avatar}
        <div className={`relative ${bubbleRadius} shadow-sm px-[8px] py-[8px]`} style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          {isFirst && <BotTail />}
          <AudioPlayer
            src={message.mediaUrl}
            avatarUrl={botAvatar}
            avatarFallback={(botName || 'B').charAt(0).toUpperCase()}
            time={time}
          />
        </div>
      </div>
    );
  }

  if (message.mediaType === 'embed' && message.mediaUrl) {
    return (
      <div className="flex items-end animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]" style={indent}>
        {avatar}
        <div className={`relative ${bubbleRadius} overflow-hidden shadow-sm w-full`} style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          {isFirst && <BotTail />}
          <div className="p-[3px]">
            <iframe src={message.mediaUrl} className="w-full h-52 rounded-[4.5px]" />
          </div>
          {isLast && <TimeStamp time={time} />}
        </div>
      </div>
    );
  }

  // Text bubble
  return (
    <div className="flex items-end animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]" style={indent}>
      {avatar}
      <div className={`relative ${bubbleRadius} px-[9px] pt-[6px] pb-[8px] shadow-sm`} style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
        {isFirst && <BotTail />}
        {isFirst && botName && (
          <p className="text-[12.5px] font-medium mb-[2px]" style={{ color: 'hsl(var(--wa-send))' }}>
            {botName}
          </p>
        )}
        <div
          className="text-[14.2px] leading-[19px] [&_a]:underline [&_p]:mb-0.5 [&_p:last-child]:mb-0"
          style={{ color: 'hsl(var(--wa-bot-foreground))' }}
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
        {isLast && <TimeStamp time={time} />}
      </div>
    </div>
  );
};

/** WhatsApp incoming message tail (left side) */
const BotTail = () => (
  <svg
    viewBox="0 0 8 13"
    height="13"
    width="8"
    className="absolute -left-[8px] top-0"
    style={{ color: 'hsl(var(--wa-bot-bubble))' }}
  >
    <path
      d="M5 0h3v1H4c-.2 0-.4.1-.6.2L1 3.3C.2 4.1 0 5 0 6v7L3 7c.5-1.3 1.2-3 1.5-4 .2-.8.5-1.5.5-2V0z"
      fill="currentColor"
    />
  </svg>
);

const TimeStamp = ({ time }: { time: string }) => (
  <div className="flex justify-end mt-[2px]">
    <span className="text-[11px] leading-[15px]" style={{ color: 'hsl(var(--wa-time))' }}>{time}</span>
  </div>
);

function getYoutubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default BotBubble;
