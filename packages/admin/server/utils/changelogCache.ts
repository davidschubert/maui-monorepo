import type { ChangelogListResponse } from '../../shared/types/admin'

/**
 * Microcache der ÖFFENTLICHEN Changelog-Liste (Idee 3): user-agnostisch,
 * gelesen von /changelog + WhatsNew-Popover — jede Anfrage lud sonst per
 * Cursor das volle Set. TTL als Backstop; Admin-Schreibrouten (create/patch/
 * delete) leeren den Cache sofort → Veröffentlichungen sind ohne Wartezeit
 * sichtbar.
 */
export const changelogCache = createMicrocache<ChangelogListResponse>(5 * 60 * 1000)
