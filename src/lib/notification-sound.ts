let audioCtx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    gain.connect(ctx.destination);
    osc1.connect(gain);
    osc2.connect(gain);

    // Two short ascending tones ~WhatsApp style
    osc1.frequency.setValueAtTime(800, now);
    osc1.type = 'sine';
    osc1.start(now);
    osc1.stop(now + 0.12);

    osc2.frequency.setValueAtTime(1200, now + 0.12);
    osc2.type = 'sine';
    osc2.start(now + 0.12);
    osc2.stop(now + 0.25);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
  } catch {
    // Silent fail if AudioContext not available
  }
}
