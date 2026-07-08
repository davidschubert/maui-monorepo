/**
 * Live-Provider-Erkennung aus der Join-URL — NUR für Icon + Label
 * (EVENTS-V2 §6). Der Link bleibt provider-agnostisch; self-gehostete
 * Instanzen (Jitsi/OwnCast auf eigener Domain) fallen bewusst auf
 * 'generic' zurück. Pure TS ohne Nuxt-Deps → unit-testbar.
 *
 * Erstklassige Provider (Entscheidung David, 2026-07-07): Google Meet,
 * Twitch, YouTube, Jitsi Meet, OwnCast, LinkedIn Live.
 */
export interface LiveProvider {
  id: string
  /** i18n-Key-Suffix existiert je Provider NICHT — Label ist Klartext (Markenname) */
  label: string
  icon: string
}

const GENERIC: LiveProvider = { id: 'generic', label: '', icon: 'i-ph-video-camera' }

const PROVIDERS: Array<{ hosts: string[], provider: LiveProvider }> = [
  { hosts: ['meet.google.com'], provider: { id: 'meet', label: 'Google Meet', icon: 'i-ph-video-conference' } },
  { hosts: ['twitch.tv'], provider: { id: 'twitch', label: 'Twitch', icon: 'i-ph-twitch-logo' } },
  { hosts: ['youtube.com', 'youtu.be'], provider: { id: 'youtube', label: 'YouTube', icon: 'i-ph-youtube-logo' } },
  { hosts: ['meet.jit.si'], provider: { id: 'jitsi', label: 'Jitsi Meet', icon: 'i-ph-users-four' } },
  { hosts: ['owncast.online'], provider: { id: 'owncast', label: 'OwnCast', icon: 'i-ph-broadcast' } },
  { hosts: ['linkedin.com'], provider: { id: 'linkedin', label: 'LinkedIn Live', icon: 'i-ph-linkedin-logo' } },
  { hosts: ['zoom.us'], provider: { id: 'zoom', label: 'Zoom', icon: 'i-ph-video-conference' } },
  { hosts: ['teams.microsoft.com', 'teams.live.com'], provider: { id: 'teams', label: 'Microsoft Teams', icon: 'i-ph-video-conference' } },
  { hosts: ['whereby.com'], provider: { id: 'whereby', label: 'Whereby', icon: 'i-ph-video-conference' } },
  { hosts: ['discord.gg', 'discord.com'], provider: { id: 'discord', label: 'Discord', icon: 'i-ph-discord-logo' } },
  { hosts: ['vimeo.com'], provider: { id: 'vimeo', label: 'Vimeo', icon: 'i-ph-vimeo-logo' } },
  { hosts: ['kick.com'], provider: { id: 'kick', label: 'Kick', icon: 'i-ph-broadcast' } },
]

/** Provider aus der URL erkennen — unbekannt/ungültig ⇒ generisches Video-Icon */
export function detectLiveProvider(url: string | null | undefined): LiveProvider {
  if (!url) return GENERIC
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  }
  catch {
    return GENERIC
  }
  for (const entry of PROVIDERS) {
    if (entry.hosts.some(h => host === h || host.endsWith(`.${h}`))) return entry.provider
  }
  return GENERIC
}
