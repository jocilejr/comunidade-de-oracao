import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  time?: string;
  autoPlay?: boolean;
  avatar?: string;
  avatarFallback?: string;
}

// Generate random waveform data that looks like real WhatsApp
const generateWaveform = (count: number): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Natural looking variation
    const base = 0.15 + Math.random() * 0.7;
    bars.push(base);
  }
  return bars;
};

const BARS = generateWaveform(46);

const AudioPlayer = ({ src, time, autoPlay = false, avatar, avatarFallback }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => {
      setDuration(audio.duration);
      if (autoPlay) {
        audio.play().then(() => setPlaying(true)).catch(() => {});
      }
    };
    const onTime = () => { if (!seeking) setCurrent(audio.currentTime); };
    const onEnd = () => setPlaying(false);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, [seeking, autoPlay]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
    setPlaying(!playing);
  };

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const container = waveformRef.current;
    if (!audio || !container || !duration) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    audio.currentTime = pct * duration;
    setCurrent(audio.currentTime);
  }, [duration]);

  const handleSeekStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setSeeking(true);
    seek(e);
  };

  const handleSeekEnd = () => {
    setSeeking(false);
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-[6px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 transition-colors"
        style={{ backgroundColor: 'hsl(var(--wa-send))', color: '#fff' }}
      >
        {playing ? <Pause className="w-[15px] h-[15px]" /> : <Play className="w-[15px] h-[15px] ml-[2px]" />}
      </button>

      {/* Waveform + duration row */}
      <div className="flex-1 flex flex-col gap-[2px] min-w-0">
        <div
          ref={waveformRef}
          className="flex items-center gap-[1.5px] h-[26px] cursor-pointer select-none"
          onClick={handleSeekStart}
          onMouseUp={handleSeekEnd}
        >
          {BARS.map((h, i) => {
            const barProgress = i / BARS.length;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className="rounded-full shrink-0"
                style={{
                  width: '2.5px',
                  height: `${Math.max(12, h * 100)}%`,
                  backgroundColor: isActive
                    ? 'hsl(var(--wa-send))'
                    : 'hsl(var(--wa-time) / 0.5)',
                  transition: 'background-color 0.1s',
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] leading-[15px]" style={{ color: 'hsl(var(--wa-time))' }}>
            {playing ? fmt(currentTime) : fmt(duration)}
          </span>
          {time && (
            <span className="text-[11px] leading-[15px]" style={{ color: 'hsl(var(--wa-time))' }}>
              {time}
            </span>
          )}
        </div>
      </div>

    </div>
  );
};

export default AudioPlayer;
