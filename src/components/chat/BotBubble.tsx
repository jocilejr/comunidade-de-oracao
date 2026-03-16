import { ChatMessage } from '@/lib/typebot-types';

interface BotBubbleProps {
  message: ChatMessage;
}

const BotBubble = ({ message }: BotBubbleProps) => {
  if (message.mediaType === 'image' && message.mediaUrl) {
    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="rounded-2xl rounded-bl-sm bg-card border border-border overflow-hidden shadow-sm max-w-[85%]">
          <img
            src={message.mediaUrl}
            alt={message.mediaAlt || 'Imagem'}
            className="max-w-full h-auto rounded-lg"
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  if (message.mediaType === 'video' && message.mediaUrl) {
    const url = message.mediaUrl;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const embedUrl = isYoutube ? getYoutubeEmbedUrl(url) : url;

    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="rounded-2xl rounded-bl-sm bg-card border border-border overflow-hidden shadow-sm max-w-[85%] w-full">
          {isYoutube ? (
            <iframe
              src={embedUrl}
              className="w-full aspect-video rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video src={url} controls className="w-full rounded-lg" />
          )}
        </div>
      </div>
    );
  }

  if (message.mediaType === 'audio' && message.mediaUrl) {
    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm max-w-[85%]">
          <audio src={message.mediaUrl} controls className="w-full" />
        </div>
      </div>
    );
  }

  if (message.mediaType === 'embed' && message.mediaUrl) {
    return (
      <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="rounded-2xl rounded-bl-sm bg-card border border-border overflow-hidden shadow-sm max-w-[85%] w-full">
          <iframe src={message.mediaUrl} className="w-full h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm max-w-[85%]">
        <div
          className="text-card-foreground text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_p]:mb-1 [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
      </div>
    </div>
  );
};

function getYoutubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export default BotBubble;
