import type { H3Event } from 'h3'
import { TARGET_NOT_FOUND_CODE, UNKNOWN_TARGET_CODE } from '../../shared/reportErrors'

/**
 * WOGEGEN DARF GEMELDET WERDEN? (Moderations-Audit Befund 8, 2026-08-01)
 *
 * DER BEFUND: `createReportSchema` lässt targetType/targetId als freie Strings
 * durch, und die Route legte an, was ankam. Jede angemeldete Person konnte also
 * beliebig viele Zeilen mit erfundenen Zielen erzeugen — der Unique-Index
 * (reporter, target) bremst das nicht, weil jedes erfundene Ziel ein neues Paar
 * ist. Die Zeilen landeten in `total` der Queues und in leeren Seiten.
 *
 * SCHLIMMER ALS MÜLL: ein `targetType`, den niemand moderiert, ist ein
 * VERSPRECHEN INS LEERE. Genau das war der Fall bei Events (Befund 4) — der
 * Melde-Knopf sagte „ein Moderator sieht sie sich an", und keine Queue kannte
 * den Typ. Diese Registry macht daraus einen Fehler statt einer stillen Zeile.
 *
 * DIE FORM (A14, dasselbe Muster wie registerReportEscalationHandler und
 * registerUserDataContributor): moderation kennt keine Kommentare, Beiträge
 * oder Kurse. Wer meldbar sein will, meldet sich an — mit einer Funktion, die
 * sagt, ob es das Ziel IM AKTUELLEN MANDANTEN gibt. Die Zugehörigkeit prüft
 * dabei die Datentür des Konsumenten, nicht diese Datei: ein Ziel aus einer
 * fremden Community ist für den Melder schlicht nicht vorhanden.
 *
 * KEIN REGISTRIERTER TYP ⇒ 400 (`unknown_target`). Das ist bewusst hart: ein
 * Produkt-Layer, der Melden anbietet, ist genau die Stelle, die auch die Queue
 * baut — vergisst er die Registrierung, soll es beim ersten Klick auffallen und
 * nicht in einem halben Jahr beim Zählen der Karteileichen.
 */

/** Gibt es dieses Ziel im aktuellen Mandanten? (Fehler = „nein", fail-closed) */
export type ReportTargetProbe = (event: H3Event, targetId: string) => Promise<boolean> | boolean

const targets = new Map<string, ReportTargetProbe>()

/**
 * Einen meldbaren Ziel-Typ registrieren (Nitro-Plugin des Produkt-Layers).
 * Die zuletzt registrierte Prüfung gewinnt — ein Deployment hat je Typ EINEN
 * Besitzer.
 */
export function registerReportTarget(targetType: string, exists: ReportTargetProbe): void {
  targets.set(targetType, exists)
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetReportTargets(): void {
  targets.clear()
}

/** Welche Ziel-Typen sind in diesem Deployment meldbar? (Diagnose/Tests) */
export function registeredReportTargets(): string[] {
  return [...targets.keys()]
}

/**
 * Ziel prüfen, BEVOR eine Meldung entsteht.
 *  - unbekannter Typ → 400 `unknown_target`
 *  - bekannter Typ, aber kein Ziel (gelöscht, erfunden, fremder Mandant)
 *    → 404 `target_not_found`
 *
 * Die Gründe reisen als `data.code` und kommen über den zentralen
 * Fehler-Handler als `reason` beim Client an (core/shared/types/error.ts).
 */
export async function assertReportTarget(event: H3Event, targetType: string, targetId: string): Promise<void> {
  const probe = targets.get(targetType)
  if (!probe) {
    throw createError({
      status: 400,
      statusText: 'Unknown report target type',
      data: { code: UNKNOWN_TARGET_CODE },
    })
  }
  /**
   * Eine geworfene Prüfung heißt „nicht belegt" — nie „schon in Ordnung".
   *
   * `Promise.resolve(probe(...)).catch(…)` reichte dafür NICHT: eine Prüfung,
   * die SYNCHRON wirft (ein Fehler noch vor dem ersten await), fliegt an dem
   * `.catch` vorbei und käme als 500 heraus statt als sauberes „Ziel nicht
   * belegt". Deshalb `.then()` auf ein leeres Promise — damit liegt der Aufruf
   * selbst schon in der Kette.
   */
  const exists = await Promise.resolve().then(() => probe(event, targetId)).catch(() => false)
  if (!exists) {
    throw createError({
      status: 404,
      statusText: 'Report target not found',
      data: { code: TARGET_NOT_FOUND_CODE },
    })
  }
}
