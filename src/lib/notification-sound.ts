let audio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  try {
    if (!audio) {
      audio = new Audio('/sounds/whatsapp-notification.mp3');
      audio.volume = 0.5;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Silent fail if audio not available
  }
}
