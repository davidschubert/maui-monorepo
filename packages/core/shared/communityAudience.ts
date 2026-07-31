import type { CommunityAudience, TenantContext } from './types/tenant'

/**
 * C18 — „Wer darf diese Community lesen?" als EINE pure Regel.
 *
 * Davids Entscheidung vom 2026-07-30: die Sichtbarkeit ist je Community
 * WÄHLBAR, und NEUE Communities entstehen ÖFFENTLICH. Das ist die bewusste
 * Kehrtwende zur G0-Entscheidung 7 („privat als Default", 2026-07-24) — der
 * Grund steht am Anlegeort (onboardingProvision.ts) und in
 * docs/DECISION-LOG.md.
 *
 * DER SCHALTER IST NICHT NUR EIN FELD. An dieser einen Regel hängen drei
 * Dinge, die zusammen wahr sein müssen, sonst steht der Inhalt in Googles
 * Index und nicht auf der Seite:
 *   1. die Row-Permissions des BESTANDS (`read(any)` ⇄ `read(label:<id>)`,
 *      server/utils/audienceRepermission.ts),
 *   2. die SEO-Ansage (noindex, leere sitemap, gesperrtes og:image),
 *   3. die Ansage im Dashboard (was der Schalter bewirkt).
 *
 * Warum PURE und hier in core/shared: dieselbe Antwort brauchen Server-Routen
 * (Nitro), SSR-Composables und Unit-Tests. Ein Fundament-Layer darf dafür nicht
 * auf den control-Layer zugreifen (A14) — `resolveTenantAudience()` dort ist
 * der fail-closed LESER der DB-Spalte und speist genau diesen Kontext-Wert.
 */

/** Die zwei gültigen Werte — für Zod-Enums und UI-Listen. Spiegel von
 *  `TENANT_AUDIENCES` (control), das die DB-Spalte beschreibt; hier steht die
 *  Liste, damit Fundament-Layer nicht auf den control-Layer zugreifen müssen
 *  (A14). Ein Test nagelt beide aneinander. */
export const COMMUNITY_AUDIENCES = ['members', 'public'] as const

/**
 * Das Publikum dieses Requests.
 *
 * `undefined` (kein Mandanten-Kontext oder Kontext ohne das Feld) → 'public'.
 * BEWUSST fail-OPEN, und das ist kein Widerspruch zum fail-CLOSED-Lesen der
 * Spalte in `resolveTenantAudience()`: dort geht es um „die Community hat
 * nichts entschieden" (dann ist zu = der sichere Zustand), hier um „es gibt
 * gar keine Community" — Silo-Apps (comments), Kontroll-Hosts, Playground,
 * Single-Tenant. Die haben keine Community-Grenze; sie zuzumachen hieße, eine
 * öffentliche Bestands-App über Nacht auf noindex zu stellen.
 */
export function communityAudienceFor(tenant: TenantContext | null | undefined): CommunityAudience {
  return tenant?.audience === 'members' ? 'members' : 'public'
}

/**
 * Darf ein GAST die Inhalte dieser Community sehen? Das ist die Frage, die
 * Row-Permissions, Suchmaschinen-Ansage, sitemap und og:image gemeinsam
 * beantworten müssen.
 */
export function communityContentIsPublic(tenant: TenantContext | null | undefined): boolean {
  return communityAudienceFor(tenant) === 'public'
}

/**
 * Die SEO-Ansage für einen Request. Eine Struktur statt dreier Aufrufe, damit
 * die drei Konsumenten (Kopf-Einträge, sitemap.xml, /og/<key>.png) nachweislich
 * DIESELBE Antwort benutzen — genau daran hängt der Befund aus C18: eine
 * geschlossene Community, deren sitemap weiter Links ausliefert, ist nicht
 * geschlossen.
 *
 * `robots.txt` steht bewusst NICHT hier: sie ist host-, nicht request-genau und
 * wird aus demselben Flag gebaut (siehe den robots-Handler).
 */
export interface CommunitySeoVisibility {
  /** Suchmaschinen dürfen indexieren (sonst `noindex, nofollow`). */
  indexable: boolean
  /** sitemap.xml darf URLs listen (sonst leeres <urlset>). */
  sitemapListsUrls: boolean
  /** Das Vorschaubild (og:image) darf ausgeliefert werden. */
  ogImagePublic: boolean
}

export function communitySeoVisibilityFor(tenant: TenantContext | null | undefined): CommunitySeoVisibility {
  const isPublic = communityContentIsPublic(tenant)
  return { indexable: isPublic, sitemapListsUrls: isPublic, ogImagePublic: isPublic }
}

/** Der Wert für `<meta name="robots">` bzw. den `X-Robots-Tag`. */
export const ROBOTS_NOINDEX = 'noindex, nofollow'

/**
 * PURE Kern des BESTANDS-Umzugs (C18): das Permission-Array EINER Zeile auf das
 * neue Publikum bringen. `null` = diese Zeile geht das nichts an.
 *
 * DIE ENTSCHEIDENDE EIGENSCHAFT: „veröffentlicht" wird nicht neu berechnet,
 * sondern am BESTEHENDEN Array ABGELESEN. Trägt die Zeile heute die eine oder
 * die andere Veröffentlichungs-Permission, bekommt sie die des Ziels; trägt sie
 * keine (Entwurf, ausgeblendeter Kommentar, geplanter Beitrag, Stimmzettel),
 * bleibt sie unangetastet. Damit
 *   - ist der Vorgang idempotent (zweiter Lauf ändert nichts),
 *   - ist er in BEIDE Richtungen symmetrisch,
 *   - öffnet er niemals etwas, das vorher zu war — der Fehler, den ein
 *     „published-Status neu auswerten" gemacht hätte (ein ausgeblendeter
 *     Kommentar mit status 'active'-Historie wäre wieder sichtbar geworden).
 *
 * Die Reihenfolge der übrigen Einträge bleibt erhalten; die neue Permission
 * steht an der Stelle der alten. Ein Array, das beide Schreibweisen trägt
 * (Rest aus einem abgebrochenen Lauf), wird auf genau eine reduziert.
 */
export function repermissionRow(
  permissions: readonly string[],
  options: { publicRead: string, membersRead: string, target: CommunityAudience },
): string[] | null {
  const { publicRead, membersRead, target } = options
  const wanted = target === 'public' ? publicRead : membersRead
  // Fail-closed: ohne gültige Ziel-Permission (Pool-Zeile ohne communityId)
  // wird NICHT geraten — lieber gar nichts anfassen als falsch öffnen.
  if (!wanted) return null

  const isPublication = (permission: string) => (
    (!!publicRead && permission === publicRead) || (!!membersRead && permission === membersRead)
  )
  if (!permissions.some(isPublication)) return null

  const next: string[] = []
  let placed = false
  for (const permission of permissions) {
    if (!isPublication(permission)) { next.push(permission); continue }
    if (placed) continue
    next.push(wanted)
    placed = true
  }
  // Schon richtig? Dann meldet die Funktion „nichts zu tun" — der Aufrufer
  // spart den Schreibvorgang, und ein zweiter Lauf ist nachweislich gratis.
  if (next.length === permissions.length && next.every((value, i) => value === permissions[i])) return null
  return next
}
