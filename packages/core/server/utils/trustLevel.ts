import type { H3Event } from 'h3'
import { normalizeTrustLevel, type TrustLevel } from '../../shared/trustLevel'

/**
 * „WELCHE VERTRAUENSSTUFE HAT DIESER MENSCH HIER?" — als Registry-Vertrag
 * (F1 Teilpaket 3, achter Cross-Layer-Vertrag).
 *
 * ── WARUM EIN VERTRAG UND KEIN DIREKTER ZUGRIFF (A14) ─────────────────────
 * Die Antwort steht in `member_counters`, und diese Tabelle gehört dem
 * posts-Layer. Core besitzt keine Tabellen und darf kein Produkt kennen — es
 * beschreibt hier also nur die FRAGE. Die ANTWORT registriert der Layer, dem
 * die Zeilen gehören (`packages/posts/server/plugins/trust-level.ts`), genau wie
 * beim Zähl-Recorder und beim Beitrittsdatum.
 *
 * Ohne registrierte Autorität (Silo ohne Discussions, Playground, CI-Build) ist
 * die Antwort 0. Das ist die gutmütige Richtung und ausdrücklich KEIN Fehler:
 * die Stufe VERGIBT Rechte, sie nimmt keine. Eine App ohne posts-Layer verhält
 * sich damit exakt so wie vor diesem Teilpaket.
 *
 * ── DIE FRAGE WIRD SELTEN GESTELLT, UND DAS IST BEABSICHTIGT ──────────────
 * `requireCommunityPermission` fragt NUR, wenn die geprüfte Capability
 * überhaupt aus einer Stufe folgen kann (`trustLevelGrantsCapability` —
 * heute drei von 31). An allen übrigen Routen kostet dieses Teilpaket nichts.
 * Der Rest ist Sache der Implementierung: sie cacht kurz je (Community,
 * Mensch), damit auch die betroffenen Routen und das Seiten-SSR nicht bei
 * jedem Aufruf lesen.
 *
 * ── WIRFT NIE ─────────────────────────────────────────────────────────────
 * Eine Stufe ist eine Zusatz-Auskunft. Ein Lesefehler darf keine Seite und
 * keinen Schreibvorgang kosten — er kostet höchstens ein Recht, das der
 * nächste Aufruf zurückgibt.
 */

export interface TrustLevelLookup {
  /** Der Mandant, in dem gefragt wird ('' = kein Mandanten-Kontext/Silo). */
  communityId: string
  /** Der Appwrite-User im Runtime-Projekt. */
  userId: string
}

export type TrustLevelResolver = (
  event: H3Event,
  lookup: TrustLevelLookup,
) => Promise<number> | number

let trustLevelResolver: TrustLevelResolver | null = null

/** Von dem Layer registriert, dem die Zähler-Zeilen gehören (Nitro-Plugin). */
export function registerTrustLevelResolver(fn: TrustLevelResolver): void {
  if (trustLevelResolver) {
    console.warn('[core] registerTrustLevelResolver: bestehende Autorität wird ersetzt — pro Deployment ist EINE vorgesehen')
  }
  trustLevelResolver = fn
}

export function getTrustLevelResolver(): TrustLevelResolver | null {
  return trustLevelResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetTrustLevelResolver(): void {
  trustLevelResolver = null
}

/**
 * Die Stufe des aktuellen Requests — 0, wenn niemand angemeldet ist, keine
 * Autorität registriert wurde oder das Lesen scheitert.
 */
export async function resolveTrustLevel(event: H3Event): Promise<TrustLevel> {
  const user = event.context.user
  if (!user?.$id) return 0

  const resolver = getTrustLevelResolver()
  if (!resolver) return 0

  try {
    const level = await resolver(event, {
      communityId: event.context.tenant?.communityId ?? '',
      userId: user.$id,
    })
    return normalizeTrustLevel(level)
  }
  catch {
    return 0
  }
}
