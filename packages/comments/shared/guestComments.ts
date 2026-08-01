/**
 * F4 — darf hier OHNE Konto kommentiert werden?
 *
 * DER BEFUND (C18-Kante): eine Gast-Row bekommt beim Anlegen
 * `withPublishedRead()`, und in einer Community mit Publikum 'members' ist das
 * `read(label:<communityId>)`. Ein Gast trägt kein Label — er sieht seinen
 * eigenen Kommentar nicht wieder, und er sieht auch keinen anderen. Der
 * Gast-Composer stand damit in einer geschlossenen Community vor einer LEEREN
 * Liste und schrieb in ein Loch: nach dem nächsten Seitenaufbau war der eigene
 * Beitrag verschwunden.
 *
 * WAS NICHT GEHT: die Row `read(any)` stempeln (dann wäre die geschlossene
 * Community an genau der Stelle offen, an der jeder Fremde schreiben darf), und
 * auch kein „kurzes Sichtbarkeitsfenster" — eine Permission, die später wieder
 * verschwindet, ist eine zweite Wahrheit über dieselbe Zeile.
 *
 * DIE EHRLICHE LÖSUNG ist die kleinste: Gäste schreiben genau dort, wo Gäste
 * auch LESEN dürfen. Der Kommentar im Anlegepfad sagte das schon („Gast-
 * Kommentare und ‚nur für Mitglieder' widersprechen sich"), verwies aber auf
 * einen Schalter, der das gar nicht kann: `pukalani.comments.embed.guests` gilt
 * für die INSTANZ, `audience` je COMMUNITY. Im Pool hätte ein Betreiber die
 * Gast-Kommentare also nur für ALLE Communities abschalten können — genau die
 * Sorte Rat, die in der Situation nicht befolgbar ist. Deshalb entscheidet die
 * Community mit.
 *
 * PURE und an EINER Stelle, weil zwei Seiten dieselbe Antwort brauchen: die
 * Route (`/api/comments/guest` → 404) und die Ansicht (kein Composer). Liefen
 * sie auseinander, stünde ein Formular da, dessen Absenden garantiert scheitert.
 */
export interface GuestCommentGate {
  /** Läuft das im iframe-Embed? (`pukalani.comments.embed.enabled`) */
  embedEnabled: boolean
  /** Hat der Betreiber Gast-Kommentare freigegeben? (`…embed.guests`) */
  guestsEnabled: boolean
  /**
   * Sind die Inhalte dieser Community für Gäste lesbar? (C18,
   * `communityContentIsPublic`). Silo-Apps, Kontroll-Hosts und Playground haben
   * keine Community-Grenze — dort ist das `true`.
   */
  communityIsPublic: boolean
}

export function guestCommentsAllowed(gate: GuestCommentGate): boolean {
  return gate.embedEnabled && gate.guestsEnabled && gate.communityIsPublic
}
