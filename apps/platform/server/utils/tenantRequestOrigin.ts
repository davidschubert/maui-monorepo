import type { H3Event } from 'h3'
// core/shared/*.ts wird im server-Verzeichnis NICHT auto-importiert
// (nur shared/utils + shared/types) — deshalb explizit, wie in 00.tenant.ts.
import { resolveSeoOrigin } from '../../../../packages/core/shared/seoOrigin'

/**
 * Die Origin, unter der DIESER Request beantwortet wird — Server-Gegenstück zu
 * `useLocaleSeoHead()` (Gate pukalani.seo.originFromRequest, Audit-Befund B1).
 *
 * Dieselbe Regel wie im Kopf der Seiten, damit robots.txt/sitemap.xml und
 * canonical/hreflang nie auseinanderlaufen: HOST+PORT kommen aus dem Request
 * (diese App bedient viele Mandanten-Hosts), das SCHEMA aus der konfigurierten
 * Basis-URL (NUXT_PUBLIC_I18N_BASE_URL) — hinter nginx spricht der Node-Prozess
 * http, und ob der Proxy `X-Forwarded-Proto` setzt, ist eine Server-Einstellung,
 * auf die sich SEO nicht verlassen darf.
 *
 * `getRequestURL` liefert immer einen Host (Nitro fällt auf 'localhost'
 * zurück); der Rückfall auf die konfigurierte Basis ist nur das Netz darunter.
 */
export function tenantRequestOrigin(event: H3Event): string {
  const publicConfig = useRuntimeConfig(event).public as { i18n?: { baseUrl?: unknown } }
  const configured = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl : ''
  return resolveSeoOrigin(getRequestURL(event).origin, configured)
    || configured.replace(/\/+$/, '')
}
