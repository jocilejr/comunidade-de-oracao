import { ChatMessage } from '@/lib/typebot-types';
import AudioPlayer from './AudioPlayer';

interface BotBubbleProps {
  message: ChatMessage;
  botAvatar?: string;
  botName?: string;
}

const BotBubble = ({ message, botAvatar, botName }: BotBubbleProps) => {
  const time = new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (message.mediaType === 'image' && message.mediaUrl) {
    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
        <div className="relative rounded-lg overflow-hidden shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          <div className="p-1">
            <img
              src={message.mediaUrl}
              alt={message.mediaAlt || 'Imagem'}
              className="max-w-full h-auto rounded-md max-h-[300px] object-contain"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <TimeStamp time={time} />
        </div>
      </div>
    );
  }

  if (message.mediaType === 'video' && message.mediaUrl) {
    const url = message.mediaUrl;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const embedUrl = isYoutube ? getYoutubeEmbedUrl(url) : url;

    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
        <div className="relative rounded-lg overflow-hidden shadow-sm w-full" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          <div className="p-1">
            {isYoutube ? (
              <iframe
                src={embedUrl}
                className="w-full aspect-video rounded-md"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={url} controls className="w-full rounded-md max-h-[300px]" />
            )}
          </div>
          <TimeStamp time={time} />
        </div>
      </div>
    );
  }

  if (message.mediaType === 'audio' && message.mediaUrl) {
    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
        <div className="relative rounded-lg shadow-sm px-3 py-2" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          <audio src={message.mediaUrl} controls className="w-full min-w-[240px]" />
          <TimeStamp time={time} />
        </div>
      </div>
    );
  }

  if (message.mediaType === 'embed' && message.mediaUrl) {
    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
        <div className="relative rounded-lg overflow-hidden shadow-sm w-full" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
          <div className="p-1">
            <iframe src={message.mediaUrl} className="w-full h-52 rounded-md" />
          </div>
          <TimeStamp time={time} />
        </div>
      </div>
    );
  }

  // Text bubble
  return (
    <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
      <div className="relative rounded-lg rounded-tl-none px-3 py-2 shadow-sm" style={{ backgroundColor: 'hsl(var(--wa-bot-bubble))' }}>
        {/* WhatsApp tail */}
        <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-r-[8px] border-t-transparent" style={{ borderRightColor: 'hsl(var(--wa-bot-bubble))' }} />
        <div
          className="text-sm leading-relaxed [&_a]:underline [&_p]:mb-0.5 [&_p:last-child]:mb-0"
          style={{ color: 'hsl(var(--wa-bot-foreground))' }}
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
        <TimeStamp time={time} />
      </div>
    </div>
  );
};

const TimeStamp = ({ time }: { time: string }) => (
  <div className="flex justify-end mt-0.5">
    <span className="text-[10px] leading-none" style={{ color: 'hsl(var(--wa-time))' }}>{time}</span>
  </div>
);

function getYoutubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default BotBubble;
