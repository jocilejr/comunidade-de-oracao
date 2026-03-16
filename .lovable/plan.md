

## Plan

### 1. Preview in mobile mode
Wrap the `ChatRenderer` inside the Admin preview with a mobile phone frame (max-width ~375px, centered, with device border/rounded corners) so it looks like a phone simulator.

### 2. WhatsApp-style audio bubble with avatar + waveform
Replace the native `<audio>` element in `BotBubble.tsx` with a custom WhatsApp-style audio player: play/pause button on the left, a CSS waveform visualization in the middle, duration on the right, and a circular avatar on the far right. Reference: uploaded image-2.png.

### 3. Bot profile settings in Admin
Add a section in the Admin page (above the funnel list or in a collapsible card) with:
- Image URL input (or file upload for avatar)
- Bot name input
- Save to localStorage, pass `botName` and `botAvatar` to `ChatRenderer`

### 4. Header icons (already present)
The Video, Phone, and MoreVertical icons are already in `ChatRenderer` header. No changes needed — they're already there.

### 5. WhatsApp dark wallpaper background
Copy `user-uploads://image-3.png` to `public/images/wa-wallpaper-dark.png`. Update the `.wa-wallpaper` CSS to use this image in dark mode instead of the SVG pattern, and keep the light SVG pattern for light mode.

### Files to modify
- **`src/pages/Admin.tsx`** — Add bot profile settings (name + avatar inputs with localStorage persistence), wrap preview in a mobile phone frame
- **`src/components/chat/BotBubble.tsx`** — Replace audio section with WhatsApp-style waveform player + avatar
- **`src/index.css`** — Add `.dark .wa-wallpaper` rule using the uploaded wallpaper image; add waveform animation keyframes
- **`src/components/chat/ChatRenderer.tsx`** — Minor: ensure botName/botAvatar props flow through
- **`public/images/wa-wallpaper-dark.png`** — Copy from uploaded image

### Technical details
- Bot profile stored in localStorage key `bot-profile` as `{ name: string, avatarUrl: string }`
- Mobile frame: a `div` with `w-[375px] h-[667px]` border rounded-[2rem] overflow-hidden centered
- Audio waveform: CSS bars with varying heights, animated when playing; use `HTMLAudioElement` API for play/pause and duration tracking
- Dark wallpaper: `background-image: url('/images/wa-wallpaper-dark.png'); background-size: cover;`

