/**
 * Sperr-/Missbrauchspfad (M13, Davids Entscheidungen vom 2026-08-02) — die
 * PUREN Regeln. Kein h3, kein Appwrite: hier steht nur, was eine Sperre
 * BEDEUTET.
 *
 * WARUM IN CORE UND NICHT IM CONTROL-LAYER: an dieser einen Frage hängen drei
 * Stellen, die sich einig sein müssen —
 *   1. der Mandanten-Resolver (control) entscheidet, ob ein Host überhaupt
 *      auflöst,
 *   2. die DATENTÜR (core, tenantDb) entscheidet, ob ein Mitglied schreiben
 *      darf,
 *   3. die Oberfläche (onboarding/control) erklärt es dem Menschen.
 * Ein Fundament-Layer darf nicht von einem Produkt-Layer abhängen (A14), also
 * liegt die gemeinsame Wahrheit hier. Drei Kopien der Rechnung wären der
 * sichere Weg in einen Zustand, in dem die Seite „gesperrt" sagt und der
 * Server trotzdem schreiben lässt.
 *
 * ZWEI STUFEN, ZWEI VERSCHIEDENE WIRKUNGEN (bewusst nicht ein Schieberegler):
 *
 *  - `'billing'` — **Zahlungsverzug**. Die Community wird NUR-LESEND: Gäste und
 *    Mitglieder lesen weiter (Inhalte verschwinden nicht, Links bleiben heil,
 *    Suchmaschinen sehen keine Lücke), aber jedes Schreiben eines Mitglieds ist
 *    zu. Der Owner sieht einen Hinweis mit dem Weg zur Zahlung. Das ist eine
 *    MAHNUNG, keine Strafe — wer bezahlt, ist im nächsten Webhook wieder frei.
 *
 *  - `'abuse'` — **geprüfte Missbrauchsmeldung**. Der Host ist sofort und
 *    vollständig offline und antwortet wie eine Adresse, die es nicht gibt
 *    (404, derselbe C12b-Pfad wie ein unbekannter Host). Die Inhalte bleiben
 *    liegen — erreichbar nur noch für den Betreiber. Kein Zwischending: eine
 *    Community, die wegen Missbrauch gesperrt ist, soll nichts mehr in die Welt
 *    senden, auch nicht lesend.
 *
 * WIE WEIT REICHT DIE BILLING-SPERRE? NUR BIS ZU DEN INHALTEN (Davids
 * Entscheidung, festgehalten nach dem Wechselwirkungs-Audit — Befund 4).
 *
 * Sie hängt an der DATENTÜR und dort nur an der Türklinke `member`
 * (`tenantDb()`, core/server/utils/tenantDb.ts). Damit ist zu: jeder eigene
 * Schreibvorgang eines Mandanten-Layers — Kommentare, Beiträge, Umfragen,
 * Zu- und Absagen, Kursfortschritt.
 *
 * OFFEN BLEIBEN — bewusst — alle Einstellungen des Owners, weil sie NICHT durch
 * diese Tür gehen, sondern über die Service-Naht ins Control Plane:
 * Erscheinungsbild (`PATCH /api/community/branding`), Team und Rollen
 * (`/api/community/members/*`), Lese-Publikum und Registrierung
 * (`/dashboard/community`) sowie die Moderation (Türklinke
 * `operator`). Das ist keine Lücke, sondern der Zweck: die Sperre soll zum
 * ZAHLEN bewegen, nicht den Owner aus seiner eigenen Community aussperren. Wer
 * seine Community nicht mehr verwalten, Mitglieder nicht mehr entfernen und
 * Missbrauch nicht mehr moderieren kann, während er auf eine Rechnung schaut,
 * hat kein Zahlungsproblem mehr, sondern ein Vertrauensproblem — und eine
 * gesperrte Community, die nicht moderiert werden kann, wird zum Problem des
 * Betreibers.
 *
 * Wer also eine neue Owner-Einstellung baut: sie gehört NICHT hinter diese
 * Sperre. Und wer eine neue INHALTS-Route baut, muss nichts tun — sie geht
 * ohnehin durch die Tür.
 *
 * WARUM NICHT EINFACH `status: 'disabled'` (das gibt es seit control-010 und
 * 404et den Host auch)? Drei Gründe, jeder für sich ausreichend:
 *   - `status` ist der LÖSCHWEG (C16: „stilllegen" IST das Löschen) und lässt
 *     die Community aus der Kundenübersicht verschwinden. Eine gesperrte
 *     Community muss dort BLEIBEN — sonst kann der Owner nicht mehr bezahlen
 *     und erfährt nie, warum seine Adresse tot ist.
 *   - Eine Sperre braucht einen GRUND, einen Zeitpunkt und die Möglichkeit,
 *     exakt den vorherigen Zustand wiederherzustellen. `status` trägt nichts
 *     davon.
 *   - Zahlungsverzug ist gar keine Abschaltung, sondern ein Lesemodus. Dafür
 *     hat `status` keinen Wert.
 * Deshalb eine EIGENE Achse neben `status`, die beide unabhängig gelten.
 */

/** Die drei Zustände der Spalte `communities.suspension`. */
export const COMMUNITY_SUSPENSIONS = ['billing', 'abuse'] as const
export type CommunitySuspensionKind = (typeof COMMUNITY_SUSPENSIONS)[number]
/** `''` = nicht gesperrt (Normalfall und Spalten-Default). */
export type CommunitySuspension = '' | CommunitySuspensionKind

/**
 * Fachlicher Grund im Fehler-Envelope (`error.data.reason`, core/server/error.ts)
 * für ein abgewiesenes Schreiben. Der Client liest ihn und zeigt den richtigen
 * Satz statt „etwas ist schiefgelaufen".
 */
export const COMMUNITY_SUSPENDED_CODE = 'community_suspended'

/**
 * PURE (unit-getestet): den Spaltenwert auflösen — FAIL-OPEN, und das ist hier
 * Absicht.
 *
 * Nur die exakten Werte `'billing'` und `'abuse'` sperren. `null` (Rows von VOR
 * control-034 — Appwrite backfillt Spalten-Defaults nicht), `''`, ein
 * Tippfehler oder ein fremder Wert bedeuten „nicht gesperrt".
 *
 * Bewusster Gegensatz zu `resolveTenantAudience()`, das fail-CLOSED liest: dort
 * hängt eine Datenschutzgrenze an der Spalte, hier eine Betreiber-Maßnahme. Ein
 * unlesbarer Wert darf niemals eine zahlende Community vom Netz nehmen — der
 * Schaden läge dann bei dem, der nichts falsch gemacht hat. Dass nur diese zwei
 * Werte je in der Spalte landen, sichert die SCHREIB-Seite (Zod-Enum auf der
 * Betreiber-Route), nicht das Lesen.
 */
export function resolveCommunitySuspension(value: string | null | undefined): CommunitySuspension {
  return (COMMUNITY_SUSPENSIONS as readonly string[]).includes(value ?? '')
    ? value as CommunitySuspensionKind
    : ''
}

/**
 * Ist der Host komplett offline? PURE. Nur `'abuse'`.
 *
 * Der EINZIGE Leser ist der Mandanten-Resolver: er liefert für so eine Row
 * `null`, und ab da ist der Host für die gesamte App ein unbekannter Host —
 * Seite wie API, ohne dass irgendeine Route davon wissen muss.
 */
export function communityIsOffline(suspension: CommunitySuspension): boolean {
  return suspension === 'abuse'
}

/**
 * Ist die Community nur-lesend? PURE.
 *
 * `'billing'` ist der gemeinte Fall. `'abuse'` steht bewusst MIT drin, obwohl
 * so ein Mandant den Resolver gar nicht verlässt: sollte der Kontext auf einem
 * Weg, den heute niemand kennt, doch einmal eine abuse-Sperre tragen, wäre
 * „darf schreiben" die falsche Antwort. Zwei Gürtel kosten hier eine Zeile.
 */
export function communityIsReadOnly(suspension: CommunitySuspension): boolean {
  return suspension !== ''
}

/**
 * Darf ein MITGLIED in diesem Mandanten schreiben? PURE — die Frage, die die
 * Datentür stellt.
 *
 * `null` (Silo-App, Kontroll-Host, Playground, Einzelbetrieb) → ja. Diese
 * Deployments haben keine Community-Grenze und keinen Vertrag; sie
 * stillschweigend zuzumachen wäre der Schaden. Gleiche Bauart wie
 * `registrationOpenFor()`.
 */
export function memberWritesAllowedFor(tenant: { suspension?: CommunitySuspension } | null): boolean {
  return !communityIsReadOnly(tenant?.suspension ?? '')
}
