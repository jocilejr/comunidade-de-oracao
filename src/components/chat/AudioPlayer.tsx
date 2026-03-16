import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  avatarUrl?: string;
  avatarFallback?: string;
}

const BARS = [4, 7, 5, 9, 3, 8, 6, 10, 4, 7, 11, 5, 8, 3, 9, 6, 10, 4, 7, 5, 8, 11, 6, 3, 9, 7, 5, 10];

const AudioPlayer = ({ src, avatarUrl, avatarFallback = '?' }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration);
    const onTime = () => setCurrent(audio.currentTime);
    const onEnd = () => setPlaying(false);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
    setPlaying(!playing);
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-2 min-w-[260px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'hsl(var(--wa-send))', color: 'hsl(var(--wa-header-foreground))' }}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-end gap-[2px] h-6">
          {BARS.map((h, i) => {
            const barProgress = i / BARS.length;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className={`waveform-bar ${playing ? 'playing' : ''}`}
                style={{
                  height: `${h * 10}%`,
                  backgroundColor: isActive ? 'hsl(var(--wa-send))' : 'hsl(var(--wa-time))',
                  animationDelay: playing ? `${i * 0.05}s` : undefined,
                }}
              />
            );
          })}
        </div>
        <span className="text-[10px]" style={{ color: 'hsl(var(--wa-time))' }}>
          {playing ? fmt(currentTime) : fmt(duration)}
        </span>
      </div>

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2" style={{ borderColor: 'hsl(var(--wa-send))' }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'hsl(var(--wa-time))', color: 'hsl(var(--wa-bot-foreground))' }}>
            {avatarFallback}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioPlayer;
