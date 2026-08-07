import { z } from 'zod'
import { setSiteDomain } from '../../../utils/siteDomain'

/**
 * Eine eigene Domain für diese Silo-Site eintragen (control-036).
 *
 * ── HIER WIRD BEWUSST NICHTS GEPRÜFT AUSSER DER LÄNGE ────────────────────
 * Die Pool-Fassung macht an dieser Stelle eine schnelle Vorprüfung mit
 * `validateCustomDomain`, um dem Kunden bei einem Tippfehler den Weg über die
 * Naht zu sparen. Dieser Layer tut das NICHT, und zwar aus einem Grund, der
 * schwerer wiegt als die eingesparte Zehntelsekunde: `validateCustomDomain`
 * lebt im `control`-Layer, und den liefert eine Silo-App nicht mit (A14). Ihn
 * hierher zu kopieren hieße, eine zweite Wahrheit darüber zu haben, was eine
 * gültige Kundendomain ist — und die beiden würden auseinanderlaufen, sobald
 * jemand eine davon anfasst (etwa die Sperre gegen `*.pukalani.app`).
 *
 * Die AUTORITÄT war ohnehin immer das Control Plane; es prüft dieselbe pure
 * Regel selbst und antwortet mit demselben `reason`-Schlüssel
 * (`domain_invalid`, `domain_operator_domain`, …), den die Seite übersetzt.
 * Der Unterschied ist ein Netzaufruf, nicht eine Zusage weniger.
 *
 * PUT und nicht POST: die Domain ist EINE Eigenschaft der Site, kein Vorgang,
 * den man mehrfach anlegt. Ein zweiter Aufruf ersetzt den ersten.
 */
const bodySchema = z.object({ domain: z.string().min(1).max(300) }).strict()

export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')
  const body = await readValidatedBody(event, bodySchema.parse)
  return await setSiteDomain(event, body.domain)
})
