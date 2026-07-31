/**
 * „Gesperrte Namen": die Entscheidungsregel fürs Anlegen eines
 * Betreiber-Eintrags — PURE (unit-getestet, ohne h3/Appwrite), nach demselben
 * Muster wie siteTeam.ts: die Schutzregeln stehen an EINER Stelle, die
 * Oberfläche darf sie kennen (Knopf ausgrauen, Fehlertext wählen), das Control
 * Plane SETZT SIE DURCH. Wären sie nur in der Route, wären sie beim nächsten
 * Endpunkt vergessen.
 *
 * Zwei Quellen, eine Wirkung (s. Migration control-027):
 *  - RESERVED_SUBDOMAINS (Code) = System-Namen. Teil der Architektur, gehören
 *    versioniert in den Code, wirken synchron im Zod-Schema, UNLÖSCHBAR.
 *  - Tabelle `reserved_names` = Betreiber-Namen. Alltag, kein Deploy nötig.
 *
 * Warum ein System-Name hier ABGELEHNT wird statt einfach durchzugehen: er ist
 * schon gesperrt. Eine zweite Zeile für dieselbe Tatsache wäre Doppelpflege —
 * und die gefährliche Sorte, denn sie sähe löschbar aus, ohne es zu sein.
 */

/** DNS-Label: a-z, 0-9, Bindestrich (nicht am Anfang/Ende) — wie `slugRe` in
 *  schemas/tenant.ts. Umlaute/Sonderzeichen nur als Punycode (xn--…). */
export const RESERVED_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/**
 * Obergrenze 36 statt SLUG_MAX (40) — und das ist keine Schludrigkeit, sondern
 * die Row-Id: der Name IST die Appwrite-Row-Id (daher die Eindeutigkeit gratis),
 * und eine Row-Id fasst 36 Zeichen. Bei 40 nähme die Oberfläche einen Namen an,
 * den die Datenbank nicht speichern kann.
 * Bewusste Rest-Lücke: Subdomains mit 37–40 Zeichen kann der Betreiber hier
 * nicht sperren. Sie bleiben über die Code-Basisliste erreichbar.
 */
export const RESERVED_NAME_MAX = 36

export type ReservedNameDecision =
  | { ok: true, name: string }
  | { ok: false, reason: 'invalid' | 'system' }

/**
 * Darf dieser Name als Betreiber-Eintrag angelegt werden?
 *
 * Normalisiert (trim + lowercase) — ein Host ist per Definition kleingeschrieben,
 * und „Presse" mit großem P wäre sonst ein zweiter, wirkungsloser Eintrag neben
 * „presse". Der normalisierte Name kommt bei `ok: true` zurück und ist der
 * Wert, der gespeichert wird.
 */
export function decideReservedNameCreate(
  rawName: string,
  systemNames: ReadonlySet<string>,
): ReservedNameDecision {
  const name = rawName.trim().toLowerCase()
  if (name.length < 1 || name.length > RESERVED_NAME_MAX) return { ok: false, reason: 'invalid' }
  if (!RESERVED_NAME_RE.test(name)) return { ok: false, reason: 'invalid' }
  if (systemNames.has(name)) return { ok: false, reason: 'system' }
  return { ok: true, name }
}
