import type { TenantRow } from './types/tenantRecord'

/**
 * ZAHLUNGSWARNUNG EINES COMMUNITY-ABOS — die PURE Hälfte (Davids Entscheidung
 * vom 2026-08-03: die Warnung gehört in die COMMUNITY-Glocke).
 *
 * Hier steht nur, WELCHE Community eine Warnung verdient und WIE sie heißt. Wer
 * sie liest (der Owner), wo sie erscheint (seine Glocke auf dem Mandanten-Host)
 * und wann sie geschrieben wird (der Sweep der Platform-App), steht anderswo —
 * absichtlich, damit diese Regel ohne Appwrite und ohne Nuxt prüfbar bleibt.
 *
 * ZWEI IDs, BEIDE „communityId" — die Falle dieses Pfades:
 *  - `communityId` = `communities.$id`, der Anker der Mitgliedschaften
 *    (`community_members.communityId`). Damit findet man den Owner.
 *  - `tenantId`    = `communities.tenantId` (`t-kunde-a`), der Zeilen-Stempel im
 *    Pool. Damit findet die Meldung IHRE Glocke (`notifications.communityId`,
 *    siehe Kopf von core/server/utils/communityHost.ts).
 * Wer sie verwechselt, schreibt eine Meldung, die niemand sieht, und merkt es
 * nicht — beide Wege sind fail-soft.
 */

/** Was der Sweep über eine überfällige Community wissen muss. */
export interface PastDueCommunityNotice {
  /** `communities.$id` — Anker der Mitgliedschaften. */
  communityId: string
  /** `communities.tenantId` — Ablage-Stempel im Pool (Glocke + Mail-Link). */
  tenantId: string
  /** Kanonischer Host (Anzeige-Rückfall, wenn die Community keinen Namen hat). */
  host: string
  /** Anzeigename der Community; '' = Bestand ohne Namen. */
  name: string
  /** Der Plan, dessen Zahlung offen ist (Anzeige). */
  plan: string
  /** Seit wann der Verzug besteht (ISO) — Teil des Idempotenz-Schlüssels. */
  pastDueSince: string
  /** Runtime-User-Ids der Owner IM Pool-Projekt (leer = niemand erreichbar). */
  ownerUserIds: string[]
}

/** Was die Anzeige im Titel trägt: der Name, sonst der Host. Nie eine Row-Id —
 *  die sagt keinem Kunden etwas. */
export function pastDueNoticeTitle(community: Pick<PastDueCommunityNotice, 'name' | 'host'>): string {
  return community.name || community.host
}

/**
 * PURE (unit-getestet): verdient diese Community-Zeile eine Zahlungswarnung IN
 * DIESEM Runtime-Projekt?
 *
 * Fünf Bedingungen, jede aus einem eigenen Grund:
 *  - `billingStatus === 'past_due'` — der Webhook normalisiert Stripes
 *    `past_due` UND `unpaid` auf genau diesen Wert; wer bezahlt oder gekündigt
 *    hat, steht hier nicht mehr.
 *  - `pastDueSince` lesbar — ohne den Beginn gibt es keinen Idempotenz-
 *    Schlüssel, und ohne den würde stündlich neu gemeldet. Lieber keine
 *    Warnung als eine stündliche.
 *  - `status === 'active'` — eine stillgelegte Community hat keinen Leser.
 *  - `suspension !== 'abuse'` — dort ist der Host komplett offline (der
 *    Resolver liefert `null`), eine Glocken-Zeile wäre unerreichbar und die
 *    Zahlungsfrage neben einer Missbrauchssperre die kleinere. Eine
 *    BILLING-Sperre schließt NICHT aus — im Gegenteil, dann ist der Hinweis
 *    die Erklärung für den nur-lesenden Zustand.
 *  - `mode === 'pool'` UND `projectId === runtimeProjectId` — die Meldung
 *    entsteht im Projekt, das den Owner als Nutzer kennt. Eine Silo-Community
 *    wird von IHRER App bedient, nicht von dieser (dort läuft der Weg über die
 *    Konto-Glocke weiter, wie bisher).
 */
export function communityNeedsPastDueNotice(
  community: Pick<TenantRow, 'billingStatus' | 'pastDueSince' | 'status' | 'suspension' | 'mode' | 'projectId' | 'tenantId'>,
  runtimeProjectId: string,
): boolean {
  if (community.billingStatus !== 'past_due') return false
  if (!community.pastDueSince || !Number.isFinite(Date.parse(community.pastDueSince))) return false
  if (community.status !== 'active') return false
  if (community.suspension === 'abuse') return false
  if (community.mode !== 'pool' || !community.tenantId) return false
  return !!runtimeProjectId && community.projectId === runtimeProjectId
}
