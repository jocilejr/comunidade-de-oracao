let audio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  try {
    if (!audio) {
      audio = new Audio('/sounds/whatsapp-notification.mp3');
      audio.volume = 0.5;
    }
    // Reset and play — clone trick for overlapping plays
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = audio.volume;
    clone.play().catch(() => {});
  } catch {
    // Silent fail if audio not available
  }
}
