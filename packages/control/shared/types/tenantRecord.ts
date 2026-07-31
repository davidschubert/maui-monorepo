import type { Models } from 'node-appwrite'

/**
 * Horizont-3 tenants-Register (Blueprint Naht 1): das Control Plane (control)
 * BESITZT die Zuordnung Host → Mandant. Gelesen wird sie von Platform-Apps
 * über createTenantsTableResolver (server/utils/tenantsResolver.ts) — mit
 * expliziten Verbindungsdaten, weil der Leser in einem ANDEREN Projekt läuft
 * (Cross-Projekt-Read auf das Control Plane, read-only).
 */

export const TENANT_MODES = ['pool', 'silo'] as const
export type TenantMode = (typeof TENANT_MODES)[number]

export const TENANT_STATUSES = ['active', 'disabled'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

/** H3-4.2: Silo-Schema-Updates rollen in DREI Wellen aus (Blueprint L5).
 *  Pool-Tenants teilen EIN Projekt — ihre Welle ist ohne Wirkung. */
export const TENANT_WAVES = ['internal', 'canary', 'stable'] as const
export type TenantWave = (typeof TENANT_WAVES)[number]

/**
 * Plan des Pool-Tenants (control-013); staffelt Quota-Limits UND Produkt-
 * Zugriff (pukalani.tenancy.quota.plans / pukalani.tenancy.products).
 *
 * Rename 2026-07-26 (Davids Pricing-Entscheid „Basic/Personal/Pro"):
 * free→basic · pro→personal · business→pro. Bestandsdaten wurden im selben
 * Zug migriert (t-demo, tenant_plans-Rows); für Alt-Werte, die noch in
 * Spalten-Defaults ('' bzw. 'free') stecken, gibt es normalizeTenantPlan().
 * Enterprise ist bewusst KEIN Key: das ist das Silo-/Studio-Angebot, kein
 * Self-Service-Plan.
 */
export const TENANT_PLANS = ['basic', 'personal', 'pro'] as const
export type TenantPlan = (typeof TENANT_PLANS)[number]
export const DEFAULT_TENANT_PLAN: TenantPlan = 'basic'

/** Alt-Werte auf die neuen Keys mappen. 'pro' (alt = Mitte) ist absichtlich
 *  NICHT gemappt — die Daten wurden vollständig migriert, es gab keinen
 *  Alt-'pro'-Tenant; ein heutiges 'pro' ist immer der neue Top-Plan. */
export function normalizeTenantPlan(value: string | null | undefined): TenantPlan {
  if (value === 'business') return 'pro'
  if (!value || value === 'free') return DEFAULT_TENANT_PLAN
  return (TENANT_PLANS as readonly string[]).includes(value) ? value as TenantPlan : DEFAULT_TENANT_PLAN
}

/**
 * Lese-Publikum der Site (control-016). G0-Entscheidung 7 (David, 2026-07-24):
 * **privat als Default, öffentlich opt-in**. 'members' = Rows tragen
 * `read(Role.label(communityId))` (harte Appwrite-Grenze, H3-Naht 4); 'public' =
 * `read(Role.any())` als bewusster Schalter pro Site.
 */
export const TENANT_AUDIENCES = ['members', 'public'] as const
export type TenantAudience = (typeof TENANT_AUDIENCES)[number]

/**
 * PURE (unit-getestet): darf sich jeder auf dieser Community-Site ein Konto
 * anlegen? (control-018) — FAIL-OPEN, und das ist hier Absicht.
 *
 * Nur der exakte Wert `false` schließt die Registrierung. `null` (Rows von vor
 * control-018 — Appwrite backfillt Spalten-Defaults nicht) und `undefined`
 * bedeuten „nie etwas entschieden" und behalten das bisherige Verhalten:
 * offen. Default AN ist Davids Entscheidung 4 (2026-07-27, Audit-Befund S1).
 *
 * Bewusster Gegensatz zu resolveTenantAudience(), das fail-CLOSED liest: dort
 * hängt eine Datenschutzgrenze an der Spalte, hier eine Produktentscheidung.
 * Eine Bestands-Community stillschweigend zuzumachen wäre der Schaden — nicht
 * eine offene Community offen zu lassen.
 */
export function resolveTenantOpenRegistration(value: boolean | null | undefined): boolean {
  return value !== false
}

/**
 * PURE (unit-getestet): das Lese-Publikum einer Row auflösen — FAIL-CLOSED.
 *
 * Nur der exakte Wert `'public'` öffnet eine Site. Alles andere (`null` bei
 * Rows von vor control-016, `''`, ein Tippfehler, ein fremder Wert) ist
 * `'members'`. Warum das eine eigene Funktion ist und kein `|| 'members'`:
 * hier hängt eine Datenschutz-Grenze dran, und ein direkter Vergleich
 * (`audience !== 'members'` → öffentlich) hätte JEDE Bestands-Row öffentlich
 * gemacht — Appwrite backfillt Spalten-Defaults nicht (auf Dev + Prod
 * verifiziert: `audience` liest sich dort als `null`).
 */
export function resolveTenantAudience(value: string | null | undefined): TenantAudience {
  return value === 'public' ? 'public' : 'members'
}

/** Row-Typ zur `tenants`-Table (Schema: Migrationen control-010/011). */
export interface TenantRow extends Models.Row {
  /** Anzeigename des Kunden (control-011); '' = Bestand vor der Migration. */
  name: string
  /** Kanonischer Host (klein, ohne Port) — Unique-Index uq_host. */
  host: string
  mode: TenantMode
  /** Appwrite-Projekt, das den Host bedient (Pool: das geteilte Projekt). */
  projectId: string
  /** Zeilen-Scope im Pool (Migrationen wie comments-011); '' bei silo. */
  tenantId: string
  /** disabled = Host bewusst offline (Resolver liefert null → 404). */
  status: TenantStatus
  /** Update-Welle des BACKING-Projekts (control-012); '' = Bestand → stable. */
  wave: TenantWave | ''
  /** Quota-Plan (control-013); '' = Bestand → free. */
  plan: TenantPlan | ''
  /** G1 (control-015): Billing-/Owner-Anker. Der Tenant IST die kanonische
   *  Kunden-Site → `$id` = communityId; hier hängt das abrechnende Workspace.
   *  '' = noch keinem Workspace zugeordnet (Billing-Verdrahtung folgt G2/G3). */
  workspaceId: string
  /** Onboarding (control-016): Built-in-Theme-Id des gewählten Vibes;
   *  '' = Instanz-Default aus app_config.themeSettings. */
  theme: string
  /** Tonale Variante des Themes; '' = Basisfarbe der Welt. */
  variant: string
  /** Neutral-Palette der Community (control-020, `NEUTRAL_REGISTRY`-Id);
   *  '' = keine eigene Wahl → Voreinstellung der Instanz. `null`/fehlend bei
   *  Rows von VOR der Migration (Appwrite backfillt Defaults nicht) — bedeutet
   *  dasselbe wie ''. */
  neutral: string | null
  /** Lese-Publikum. `null` bei Rows, die VOR control-016 entstanden sind:
   *  Appwrite backfillt Spalten-Defaults nicht (verifiziert auf Dev + Prod,
   *  gleiches Verhalten wie bei `plan` aus control-013). IMMER über
   *  resolveTenantAudience() lesen — nie direkt vergleichen. */
  audience: TenantAudience | '' | null
  /** Ende der 14-Tage-Pro-Testphase (Appwrite-Datetime → ISO-String, `null`
   *  wenn nie gesetzt). Nach Ablauf setzt der Sweep `plan` auf free —
   *  nie sperren, nie löschen (F3-Grundsatz). Echte Datetime-Spalte, damit
   *  der Sweep sie mit einem Range-Query findet statt alle Rows zu lesen. */
  trialEndsAt: string | null
  /** Onboarding-Antworten als JSON (parseSiteProfile); '' = ohne Wizard angelegt. */
  profile: string
  /** Einladungs-Code, mit dem diese Community entstanden ist (Abuse-Spur);
   *  '' = ohne Code angelegt (Betreiber-Weg im Control). */
  inviteCodeId: string
  /** Mitglieder-Registrierung offen? (control-018, S1/Entscheidung 4). `null`
   *  bei Rows von VOR der Migration — IMMER über
   *  resolveTenantOpenRegistration() lesen, nie direkt vergleichen. */
  openRegistration: boolean | null
  /** A6 (control-028): das Abo hängt an der COMMUNITY — Stripe-Kunde dieses
   *  Vertrags (Geldfluss 1: Community zahlt an Pukalani). '' / `null` (Rows
   *  von vor der Migration) = nie ein Abo gehabt. */
  stripeCustomerId: string | null
  /** Aktuell maßgebliche Stripe-Subscription (Cross-Sub-Guard #6);
   *  '' / `null` = keine. */
  stripeSubscriptionId: string | null
  /** '' / `null` = nie ein Abo; sonst Stripe-Statusraum
   *  (active/past_due/canceled). Bewusst billingStatus, nicht paymentStatus —
   *  Geldfluss 2 (F7) kommt später DANEBEN, nie hinein. */
  billingStatus: string | null
}

export const COMMUNITIES_TABLE = 'communities'

/** Quota-Limits eines Plans je Schreib-Art (Spiegel von core TenantQuotaLimits). */
export interface TenantPlanLimits {
  perDay?: number
  total?: number
}

/** Row-Typ zur `tenant_plans`-Table (control-014): der im Control EDITIERBARE
 *  Quota-Katalog. `limits` = JSON { [kind]: { perDay, total } } (z. B.
 *  kind 'comments'); 0/fehlend = unbegrenzt. rowId = key. */
export interface TenantPlanRow extends Models.Row {
  key: TenantPlan
  /** JSON-String — parseTenantPlanLimits() macht daraus das Objekt. */
  limits: string
}

export const COMMUNITY_PLANS_TABLE = 'community_plans'

/** PURE (unit-getestet): limits-JSON defensiv parsen — kaputte/fremde Werte
 *  fallen auf {} zurück (Quota greift dann via app.config-Fallback). */
export function parseTenantPlanLimits(raw: string): Record<string, TenantPlanLimits> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<string, TenantPlanLimits> = {}
    for (const [kind, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const { perDay, total } = value as { perDay?: unknown, total?: unknown }
      const limits: TenantPlanLimits = {}
      if (typeof perDay === 'number' && Number.isFinite(perDay) && perDay >= 0) limits.perDay = perDay
      if (typeof total === 'number' && Number.isFinite(total) && total >= 0) limits.total = total
      result[kind] = limits
    }
    return result
  }
  catch {
    return {}
  }
}
