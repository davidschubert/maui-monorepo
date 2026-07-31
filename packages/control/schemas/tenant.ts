import { z } from 'zod'
import { TENANT_MODES, TENANT_PLANS, TENANT_WAVES } from '../shared/types/tenantRecord'

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
  // Umbenennung 2026-07-25: die neuen Plattform-Hosts. `control` ist der
  // Maschinenraum, `my` der Kundenbereich, `start` der Kurz-Link in den
  // Wizard — dieselbe Phishing-Logik wie unten: in fremder Hand wären das
  // Anmeldedaten-Fallen mit unserem Namen und gültigem Zertifikat.
  // Merke: `app` (oben) und `studio` sind ABGESCHALTETE Altnamen, bleiben
  // aber gesperrt — ein zurückgegebener Plattform-Name ist der beste
  // Phishing-Köder, den es gibt.
  'control', 'my', 'start', 'manage', 'new', 'photos',
  // Phishing-Schutz (Self-Service-Onboarding, SAAS-ROADMAP #1): Hosts, die wie
  // die Plattform selbst klingen, dürfen nie einem Kunden gehören —
  // `login.pukalani.app` in fremder Hand ist eine Anmeldedaten-Falle mit
  // unserem Namen und gültigem Zertifikat.
  'login', 'signin', 'signup', 'register', 'account', 'accounts', 'auth',
  'security', 'support', 'help', 'billing', 'pay', 'payment', 'payments',
  'verify', 'password', 'reset', 'invoice', 'pukalani', 'docs', 'blog',
  'static', 'assets', 'cdn', 'ns1', 'ns2', 'mx', 'dev', 'staging', 'test',
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
 * Self-Service-Onboarding: der Kunde wählt NUR das erste Label, den Host baut
 * der Server. Das ist die schärfere Grenze — ein Selbstbedienungs-Nutzer kann
 * damit strukturell keinen fremden oder infrastrukturellen Hostnamen
 * beantragen (kein `api.pukalani.app`, kein `mail.fremde-domain.de`), während
 * der Betreiber-Weg im Control weiterhin volle Hosts registrieren darf
 * (Custom Domains).
 *
 * Mindestens 3 Zeichen: Ein-/Zwei-Zeichen-Labels sind knappes, begehrtes Gut
 * und sollen nicht per Skript wegschnappbar sein.
 */
export const SLUG_MIN = 3
export const SLUG_MAX = 40
const slugRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug)
}

export function slugToHost(slug: string, apex: string = OPERATOR_APEX): string {
  return `${slug}.${apex}`
}

export function createSlugSchema(t: TranslateFn = identity) {
  return z.string().trim().toLowerCase()
    .min(SLUG_MIN, t('onboarding.validation.slugShort'))
    .max(SLUG_MAX, t('onboarding.validation.slugLong'))
    .regex(slugRe, t('onboarding.validation.slugInvalid'))
    .refine(slug => !isReservedSlug(slug), t('onboarding.validation.slugReserved'))
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
 *  Pool-Modus greift der konfigurierte Default (pukalani.studio.defaultPoolProject),
 *  nur Silo MUSS ein eigenes Projekt nennen (Route erzwingt das). */
export function createTenantCreateSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string().trim().min(1, t('control.tenants.validation.nameRequired')).max(120),
    host: z.string().trim().toLowerCase()
      .regex(hostRe, t('control.tenants.validation.hostInvalid'))
      .max(253)
      .refine(labelsValid, t('control.tenants.validation.hostInvalid'))
      .refine(host => !isReservedHost(host), t('control.tenants.validation.hostReserved')),
    mode: z.enum(TENANT_MODES, t('control.tenants.validation.modeInvalid')),
    projectId: z.string().trim().regex(idRe, t('control.tenants.validation.projectInvalid')).optional(),
    tenantId: z.string().trim().regex(idRe, t('control.tenants.validation.tenantIdInvalid')).optional(),
    wave: z.enum(TENANT_WAVES).optional(),
    plan: z.enum(TENANT_PLANS).optional(),
  }).strict()
}

export const tenantCreateSchema = createTenantCreateSchema()

/** PATCH-Body: Status-Umschalter (active ⇄ disabled) und/oder Wellen-Wechsel —
 *  mindestens ein Feld. (Name historisch, deckt seit H3-4.2 auch `wave`.) */
export const tenantStatusSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  wave: z.enum(TENANT_WAVES).optional(),
  plan: z.enum(TENANT_PLANS).optional(),
  /** S1: Mitglieder-Registrierung der Community. Gehört fachlich der Kundin
   *  (Dashboard-Schalter), steht hier aber ebenfalls — sonst hätte der
   *  Betreiber im Support-Fall keinen Weg an einen zugemachten Mandanten. */
  openRegistration: z.boolean().optional(),
}).strict().refine(
  body => body.status !== undefined || body.wave !== undefined || body.plan !== undefined || body.openRegistration !== undefined,
  'empty patch',
)
