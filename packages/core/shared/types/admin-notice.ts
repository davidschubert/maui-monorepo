import type { Capability } from './authz'

/**
 * Hinweis-Registry der Dashboard-Übersicht (`pukalani.admin.notices`, M13).
 *
 * Die dritte Registry derselben Bauart — nach `pukalani.admin.modules`
 * (Nav-Einträge) und `pukalani.chrome.utilities` (Header-Utilities). Sie
 * beantwortet die Frage, die keine der beiden beantwortet: „Dieser Layer hat
 * dem Betreiber JETZT etwas zu sagen — wo hängt das?"
 *
 * WARUM ÜBERHAUPT EINE REGISTRY: der erste Fall ist der Ablauf der Testphase,
 * und der gehört dem onboarding-Layer (dort liegt die Service-Naht zum Control
 * Plane, dem `communities.trialEndsAt` gehört). Die Übersichtsseite gehört dem
 * admin-Layer. Ein `<CommunityTrialNotice />` direkt im admin-Markup wäre genau
 * das String-Coupling, das A14 verbietet: in einer Silo-App ohne onboarding
 * (apps/comments) stünde dort ein Komponentenname, den nichts auflöst.
 *
 * Form wie bei chrome.utilities: OBJEKT-MAP, Key = stabile ID. defu merged sie
 * additiv über die Layer, und eine App kann einen einzelnen Eintrag mit `false`
 * abschalten — ein Array ließe sich nur verlängern.
 */
export interface PukalaniAdminNotice {
  /**
   * Komponenten-Name. Die Komponente MUSS global registriert sein
   * (Datei-Suffix `.global.vue` im besitzenden Layer), sonst kann
   * `<component :is>` den String zur Laufzeit nicht auflösen.
   */
  component: string
  /**
   * Wer den Hinweis überhaupt zu sehen bekommt. Ohne Angabe: jeder, der die
   * Übersicht sieht. MIT Angabe wird gegen dieselben zwei Quellen geprüft wie
   * die Nav (Operator-Label ODER Rolle in dieser Community, N1) — ein Hinweis
   * mit einem Knopf, den der Leser nicht drücken darf, ist Lärm.
   */
  requiredCapability?: Capability
  /** Sortierung (aufsteigend, Default 50) */
  order?: number
}

/** `false` = Eintrag von einer App/einem späteren Layer bewusst abgeschaltet. */
export type PukalaniAdminNoticeConfig = Record<string, PukalaniAdminNotice | false>

/** Auflösung der Map → gerenderte Reihenfolge (pure, unit-getestet). */
export function resolveAdminNotices(
  notices: PukalaniAdminNoticeConfig | undefined,
  can: (capability: Capability) => boolean,
): { id: string, component: string }[] {
  return Object.entries(notices ?? {})
    .flatMap(([id, notice]) => (notice ? [{ id, ...notice }] : []))
    .filter(notice => !notice.requiredCapability || can(notice.requiredCapability))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
    .map(({ id, component }) => ({ id, component }))
}
