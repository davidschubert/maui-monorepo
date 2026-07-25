/**
 * Die öffentliche Basis-URL dieser Site, ohne trailing slash.
 *
 * Quelle ist DIESELBE wie für Canonical/hreflang: `NUXT_PUBLIC_I18N_BASE_URL`,
 * das nuxt-i18n unter `runtimeConfig.public.i18n.baseUrl` bereitstellt (NICHT
 * unter `public.i18nBaseUrl` — dieser Griff war der Grund, warum og:image-URLs
 * lokal auf die Prod-Domain zeigten).
 *
 * Ist die Env nicht gesetzt (lokal), fällt es auf den Origin des laufenden
 * Requests zurück — dann stimmen Vorschaubild und Canonical immer mit dem Host
 * überein, unter dem die Seite tatsächlich erreicht wurde.
 */
export function useSiteBaseUrl(): string {
  const config = useRuntimeConfig()
  const i18n = (config.public as { i18n?: { baseUrl?: string } }).i18n
  const configured = (i18n?.baseUrl || '').trim()
  const fallback = useRequestURL().origin
  return (configured || fallback).replace(/\/+$/, '')
}
