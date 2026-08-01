/**
 * Onboarding-Vertrag („Community in 60 Sekunden", SAAS-ROADMAP #1).
 *
 * EINE Quelle für alles, was der Setup-Flow kennt: die Antwort-Kataloge
 * (Zweck, Größe, Kategorie, Ziel), die sechs Vibes und die reinen Regeln
 * (Testphase, Anzahl Communities, Profil-JSON). Warum HIER und nicht im
 * Wizard-Layer: die Daten gehören dem Control Plane (`tenants`-Row), also
 * gehört ihm auch die Definition. Der Wizard-Layer importiert diesen Vertrag
 * explizit (A14: Cross-Layer nur als benannter Vertrag, kein String-Coupling).
 *
 * PURE — kein node:crypto, kein Appwrite, keine H3-Abhängigkeit: dieselbe
 * Datei trägt Server-Validierung UND Wizard-UI. Alle Beschriftungen sind
 * i18n-Keys im UI; hier stehen ausschließlich stabile Ids.
 */

// ── 1. Antwort-Kataloge ─────────────────────────────────────────────────────

/** Schritt 1 „Warum bist du hier?" */
export const SITE_PURPOSES = ['new', 'migrate', 'looking'] as const
export type SitePurpose = (typeof SITE_PURPOSES)[number]

/** Schritt 2 „Wie viele Mitglieder hast du etwa?" (Spannen, keine Zahlen —
 *  gefragt ist eine Selbsteinschätzung, nicht eine Messung). */
export const SITE_MEMBER_RANGES = ['none', 'to100', 'to500', 'to1000', 'to5000', 'over5000'] as const
export type SiteMemberRange = (typeof SITE_MEMBER_RANGES)[number]

/** Schritt 3 „Welche Kategorie passt am besten?" — deckungsgleich mit den
 *  Zielgruppen-Seiten der Landingpage (/use-cases/*), plus Auffangkategorie. */
export const SITE_CATEGORIES = [
  'coaching', 'education', 'creator', 'club', 'business', 'health', 'craft', 'other',
] as const
export type SiteCategory = (typeof SITE_CATEGORIES)[number]

/**
 * Schritt 5 „Was wäre in 6 Monaten ein echter Erfolg?"
 *
 * `earlyAccess: true` markiert Ziele, deren Baustein NOCH NICHT allgemein
 * verfügbar ist (G0-Entscheidung: Early-Access-Scope = belegter Scope). Das
 * UI kennzeichnet sie sichtbar und verspricht sie nicht — dieselbe
 * Claim-Disziplin wie auf der Landingpage (§2.4 Claim-Gates). Auswählbar
 * bleiben sie: die Antwort ist wertvolles Produkt-Signal.
 */
export const SITE_GOALS = [
  { id: 'relationships', earlyAccess: false },
  { id: 'discussion', earlyAccess: false },
  { id: 'knowledge', earlyAccess: false },
  { id: 'reach', earlyAccess: false },
  { id: 'events', earlyAccess: true },
  { id: 'courses', earlyAccess: true },
  { id: 'revenue', earlyAccess: true },
] as const
export type SiteGoal = (typeof SITE_GOALS)[number]['id']

export const SITE_GOAL_IDS = SITE_GOALS.map(goal => goal.id) as readonly SiteGoal[]

export function isEarlyAccessGoal(id: string): boolean {
  return SITE_GOALS.some(goal => goal.id === id && goal.earlyAccess)
}

// ── 2. Vibes (Schritt 6) ────────────────────────────────────────────────────

/**
 * Sechs Vibes = sechs kuratierte Paare aus dem BESTEHENDEN 26×11-Theme-Katalog
 * (packages/themes/theme.catalog.ts). Bewusst KEINE eigene Farb-Definition und
 * kein `custom_themes`-Row beim Onboarding: die Built-ins liegen als statisches
 * CSS bereit (flash-frei, kein Ramp zur Laufzeit), und derselbe gespeicherte
 * Wert öffnet später den vollen Picker im Customize theme.
 *
 * `variant: ''` = die Basisfarbe der Welt (keine tonale Variante).
 */
export const SITE_VIBES = [
  { id: 'calm', theme: 'lagoon', variant: '' },
  { id: 'warm', theme: 'coral', variant: 'soft' },
  { id: 'fresh', theme: 'spring', variant: 'bright' },
  { id: 'focused', theme: 'denim', variant: 'deep' },
  { id: 'bold', theme: 'crimson', variant: 'vivid' },
  { id: 'elegant', theme: 'graphite', variant: 'ink' },
] as const

export type SiteVibeId = (typeof SITE_VIBES)[number]['id']

export const DEFAULT_SITE_VIBE: SiteVibeId = 'calm'

export interface ResolvedVibe {
  theme: string
  variant: string
}

/** Vibe-Id → gespeichertes Theme-Paar. Unbekannte Id → Default (fail-safe:
 *  eine Community ohne gültiges Theme wäre unbrauchbar, ein Default nicht). */
export function resolveVibe(id: string): ResolvedVibe {
  const vibe = SITE_VIBES.find(entry => entry.id === id)
    ?? SITE_VIBES.find(entry => entry.id === DEFAULT_SITE_VIBE)!
  return { theme: vibe.theme, variant: vibe.variant }
}

/**
 * Format-Wächter für die gespeicherten Theme-Werte. Der Onboarding-Pfad
 * schreibt nur aufgelöste Vibes, aber das Customize theme darf die Spalte später
 * frei setzen — und `data-theme`/`data-variant` landen als Attribute im
 * <html>. Alles außer [a-z0-9-] wird deshalb hier abgewiesen (der themes-Layer
 * hat mit SAFE_ATTR einen zweiten, unabhängigen Wächter am Ausgang).
 */
export function isSafeThemeToken(value: string): boolean {
  return /^[a-z0-9-]{1,32}$/.test(value)
}

// ── 3. Testphase ────────────────────────────────────────────────────────────

/** Entscheidung David (2026-07-24): 14 Tage Pro, ohne Zahlungsdaten. */
export const TRIAL_DAYS = 14
export const TRIAL_PLAN = 'pro' as const
/** Nach Ablauf: Downgrade auf Basic (P4-Rename; vorher 'free'). NIE sperren, NIE löschen (F3-Grundsatz). */
export const TRIAL_FALLBACK_PLAN = 'basic' as const

/** Ende der Testphase als ISO-String (Appwrite-Datetime-Spalte). */
export function trialEndsAt(now: number, days: number = TRIAL_DAYS): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
}

/** Läuft die Testphase noch? Leerer/kaputter Wert = keine Testphase (nicht
 *  „unendlich"): ein unlesbares Datum darf niemandem Pro-Limits schenken. */
export function isTrialActive(trialEnd: string | null | undefined, now: number): boolean {
  if (!trialEnd) return false
  const end = Date.parse(trialEnd)
  return Number.isFinite(end) && end > now
}

/** Verbleibende volle Tage (fürs Countdown-Banner); 0 sobald abgelaufen. */
export function trialDaysLeft(trialEnd: string | null | undefined, now: number): number {
  if (!trialEnd) return 0
  const end = Date.parse(trialEnd)
  if (!Number.isFinite(end) || end <= now) return 0
  return Math.ceil((end - now) / (24 * 60 * 60 * 1000))
}

// ── 3b. Wann sagt das Dashboard etwas dazu? (M13) ───────────────────────────

/** Vorlauf: so viele Tage VOR dem Ende erscheint der Hinweis im Dashboard. */
export const TRIAL_NOTICE_LEAD_DAYS = 7
/**
 * Nachlauf: so lange NACH dem Ende erinnert er noch — danach schweigt er.
 *
 * Ohne diese Grenze wäre der Hinweis ewig: `trialEndsAt` wird beim Ablauf NICHT
 * geräumt (der Sweep senkt nur `plan` auf basic, trialSweep.ts), geleert wird es
 * erst durch einen Kauf. Ein Banner, das jede Community ohne Abo bis in alle
 * Zeit zum Kaufen drängt, ist Werbung und keine Auskunft — und genau die Sorte
 * Dauer-Nörgelei, die das Versprechen aus dem Wizard („nichts wird gesperrt")
 * unglaubwürdig macht. Länge = die Testphase selbst: wer 14 Tage nach dem Ende
 * nichts unternommen hat, hat sich für Basic entschieden.
 */
export const TRIAL_NOTICE_GRACE_DAYS = TRIAL_DAYS

export interface TrialNotice {
  /** 'ending' = läuft in ≤ TRIAL_NOTICE_LEAD_DAYS ab · 'ended' = vorbei (Nachlauf) */
  kind: 'ending' | 'ended'
  /** Verbleibende volle Tage — bei 'ended' immer 0. */
  daysLeft: number
}

/**
 * PURE: Soll das Dashboard etwas zur Testphase sagen — und was?
 *
 * `null` heißt „schweigen", und das ist der häufigste Fall: keine Testphase
 * (Wert leer, weil gekauft oder vom Betreiber angelegt), noch reichlich Zeit,
 * oder der Nachlauf ist vorbei. Ein unlesbares Datum schweigt ebenfalls —
 * dieselbe Haltung wie isTrialActive(): raten wäre schlimmer als nichts sagen.
 */
export function trialNotice(trialEnd: string | null | undefined, now: number): TrialNotice | null {
  if (!trialEnd) return null
  const end = Date.parse(trialEnd)
  if (!Number.isFinite(end)) return null

  if (end > now) {
    const daysLeft = trialDaysLeft(trialEnd, now)
    return daysLeft <= TRIAL_NOTICE_LEAD_DAYS ? { kind: 'ending', daysLeft } : null
  }

  const graceMs = TRIAL_NOTICE_GRACE_DAYS * 24 * 60 * 60 * 1000
  return now - end <= graceMs ? { kind: 'ended', daysLeft: 0 } : null
}

// ── 4. Anzahl Communities pro Konto ─────────────────────────────────────────

/**
 * Entscheidung David (2026-07-24): 1 während der Testphase, danach bis 3.
 *
 * Warum diese Staffelung die Missbrauchs-Bremse ist: ein frisches Konto kann
 * genau EINE Subdomain belegen. Erst wer eine Testphase durchlaufen hat (also
 * 14 Tage alt ist), darf weitere anlegen — ein Skript kann damit nicht in
 * Minuten hunderte Hosts greifen, ohne dass ein Abuse-Pfad existiert.
 */
export const SITE_LIMIT_IN_TRIAL = 1
export const SITE_LIMIT_AFTER_TRIAL = 3

export interface ExistingSite {
  /** Nur aktive Sites zählen — eine deaktivierte blockiert kein Kontingent. */
  status: string
  trialEndsAt?: string | null
}

export interface SiteQuotaVerdict {
  allowed: boolean
  limit: number
  used: number
  /** Maschinen-lesbarer Grund für die Ablehnung (i18n-Key im UI). */
  reason?: 'trial_single_site' | 'limit_reached'
}

export function evaluateSiteQuota(existing: readonly ExistingSite[], now: number): SiteQuotaVerdict {
  const active = existing.filter(site => site.status === 'active')
  const inTrial = active.some(site => isTrialActive(site.trialEndsAt, now))
  const limit = inTrial ? SITE_LIMIT_IN_TRIAL : SITE_LIMIT_AFTER_TRIAL
  const used = active.length
  if (used < limit) return { allowed: true, limit, used }
  return { allowed: false, limit, used, reason: inTrial ? 'trial_single_site' : 'limit_reached' }
}

// ── 5. Profil-JSON (die Onboarding-Antworten) ───────────────────────────────

/** Obergrenzen — die Spalte ist ein 2000-Zeichen-Varchar (MariaDB-Zeilenbudget,
 *  s. Memory „mariadb-utf8mb4-zeilenbudget"), deshalb wird hart gekappt. */
export const SITE_DESCRIPTION_MAX = 600

/**
 * Die Antworten aus dem Wizard, wie sie am Tenant hängen.
 *
 * `description` ist die ANTWORT aus dem Onboarding, nicht der Live-Inhalt: die
 * daraus erzeugte Startseite (pages-Layer) ist ab dem ersten Speichern die
 * Wahrheit. Wir behalten die Antwort trotzdem — sie erklärt später, was der
 * Betreiber ursprünglich vorhatte, und trägt die Zusammenfassung (Schritt 7),
 * auch wenn die Seitenerstellung fehlschlägt.
 */
export interface SiteProfile {
  purpose?: SitePurpose
  memberRange?: SiteMemberRange
  category?: SiteCategory
  goal?: SiteGoal
  description?: string
}

/** PURE: Profil-JSON defensiv lesen — fremde/kaputte Werte fallen weg statt
 *  die Anzeige zu sprengen (gleiches Muster wie parseTenantPlanLimits). */
export function parseSiteProfile(raw: string | undefined): SiteProfile {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const value = parsed as Record<string, unknown>
    const profile: SiteProfile = {}
    const pick = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
      const candidate = value[key]
      return typeof candidate === 'string' && (allowed as readonly string[]).includes(candidate)
        ? candidate as T
        : undefined
    }
    const purpose = pick('purpose', SITE_PURPOSES)
    if (purpose) profile.purpose = purpose
    const memberRange = pick('memberRange', SITE_MEMBER_RANGES)
    if (memberRange) profile.memberRange = memberRange
    const category = pick('category', SITE_CATEGORIES)
    if (category) profile.category = category
    const goal = pick('goal', SITE_GOAL_IDS)
    if (goal) profile.goal = goal
    if (typeof value.description === 'string' && value.description.trim()) {
      profile.description = value.description.slice(0, SITE_DESCRIPTION_MAX)
    }
    return profile
  }
  catch {
    return {}
  }
}

export function serializeSiteProfile(profile: SiteProfile): string {
  return JSON.stringify(profile)
}
