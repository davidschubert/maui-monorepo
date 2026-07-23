import { z } from 'zod'
import { TENANT_MODES, TENANT_WAVES } from '../shared/types/tenantRecord'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

// Kanonischer Hostname (klein, ohne Port/Protokoll/Pfad, DNS-konform ≤253).
// Die Middleware normalisiert Request-Hosts genauso (normalizeHost, core).
// Nur a-z, 0-9 und Bindestrich (nicht am Label-Anfang/-Ende) — keine
// Sonderzeichen/Umlaute; internationale Namen nur als Punycode (xn--…).
const hostRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
// Appwrite-Projekt-/Row-Ids
const idRe = /^[a-z0-9][a-z0-9-]{0,35}$/i

/** DNS: jedes Label (Teil zwischen Punkten) max. 63 Zeichen. */
function labelsValid(host: string): boolean {
  return host.split('.').every(label => label.length >= 1 && label.length <= 63)
}

/**
 * Reservierte Subdomains der Betreiber-Domain: eigene Sites + Infrastruktur.
 * Ein Tenant darf sie NIE belegen — nginx würde die exakten server_names zwar
 * bevorzugen, aber ein Register-Eintrag wäre eine Zeitbombe (z. B. wenn eine
 * Site einmal umzieht) und verwirrt das Onboarding. Geprüft wird nur unterhalb
 * der Betreiber-Domain — fremde Kundendomains (www.kunde.de) sind frei.
 */
export const OPERATOR_APEX = 'pukalani.app'
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'mail', 'smtp', 'admin', 'console', 'status',
  'comments', 'portfolio', 'studio', 'platform', 'changelog', 'functions', 'send',
])

export function isReservedHost(host: string): boolean {
  if (host === OPERATOR_APEX) return true
  if (!host.endsWith(`.${OPERATOR_APEX}`)) return false
  const sub = host.slice(0, -(OPERATOR_APEX.length + 1))
  // erste Label-Ebene entscheidet (auch foo.functions.… bleibt reserviert)
  const first = sub.split('.').at(-1) ?? sub
  return RESERVED_SUBDOMAINS.has(first)
}

/**
 * Kundenname → Subdomain-Vorschlag (UX: der Betreiber tippt „Bäckerei Müller",
 * das Host-Feld füllt sich mit baeckerei-mueller.<apex>). Pure + getestet:
 * Umlaute transliteriert, alles außer a-z0-9 wird zu Bindestrich, DNS-konform
 * gekappt (Label ≤63). Leerer Rest → '' (kein Vorschlag).
 */
export function nameToSubdomain(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '')
  return slug
}

/** Neuen Tenant anlegen (Betreiber, sites.manage). tenantId ist optional
 *  (Server vergibt für pool eine frische Id); projectId ist optional — im
 *  Pool-Modus greift der konfigurierte Default (maui.studio.defaultPoolProject),
 *  nur Silo MUSS ein eigenes Projekt nennen (Route erzwingt das). */
export function createTenantCreateSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string().trim().min(1, t('studio.tenants.validation.nameRequired')).max(120),
    host: z.string().trim().toLowerCase()
      .regex(hostRe, t('studio.tenants.validation.hostInvalid'))
      .max(253)
      .refine(labelsValid, t('studio.tenants.validation.hostInvalid'))
      .refine(host => !isReservedHost(host), t('studio.tenants.validation.hostReserved')),
    mode: z.enum(TENANT_MODES, t('studio.tenants.validation.modeInvalid')),
    projectId: z.string().trim().regex(idRe, t('studio.tenants.validation.projectInvalid')).optional(),
    tenantId: z.string().trim().regex(idRe, t('studio.tenants.validation.tenantIdInvalid')).optional(),
    wave: z.enum(TENANT_WAVES).optional(),
  }).strict()
}

export const tenantCreateSchema = createTenantCreateSchema()

/** PATCH-Body: Status-Umschalter (active ⇄ disabled) und/oder Wellen-Wechsel —
 *  mindestens ein Feld. (Name historisch, deckt seit H3-4.2 auch `wave`.) */
export const tenantStatusSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  wave: z.enum(TENANT_WAVES).optional(),
}).strict().refine(body => body.status !== undefined || body.wave !== undefined, 'empty patch')
