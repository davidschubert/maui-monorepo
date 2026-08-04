import { Query } from 'node-appwrite'
import { REPORTS_TABLE } from '../../shared/types/report'

/**
 * Die moderation-Seite des Zähl-Vertrags (F1 Stufe 4): „wie viele Meldungen
 * hat dieser Mensch abgesetzt?".
 *
 * EINE Abfrage, kein Schwellen-Kram — eine Meldung bekommt keine Stimmen.
 *
 * MITGLIEDER-KLINKE, und dass das geht, ist kein Zufall: eine Meldung ist
 * ausdrücklich kein Mitglieder-Inhalt (Publikum `moderators`), aber der MELDER
 * trägt eine eigene Lese-Rolle auf seiner Zeile (shared/reportPermissions.ts,
 * Moderations-Audit Befund 2 — das Zurückziehen ist seine Sache). Gezählt wird
 * damit genau das, was der Handelnde ohnehin sehen darf; die Operator-Klinke
 * wäre hier eine Aufweichung ohne Not.
 *
 * JEDE Meldung zählt, auch die verworfene. Das Abzeichen belohnt das HINSEHEN
 * und Melden — ob die Moderation am Ende zustimmt, ist ihre Entscheidung und
 * nicht das Verdienst des Melders. (Eine Belohnung nur für „bestätigte"
 * Meldungen wäre außerdem eine Einladung, gegen Menschen zu sammeln.)
 *
 * MODERATION IST FUNDAMENT (A14) und hängt von keinem Produkt-Layer ab: der
 * Vertrag, in den hier hineingemeldet wird, gehört core.
 */
export default defineNitroPlugin(() => {
  registerUserCounterProvider('moderation', async (event): Promise<Record<string, number>> => {
    const userId = event.context.user?.$id
    if (!userId) return {}

    return {
      [COUNTER_FLAGS_RAISED]: await tenantDb(event).count(REPORTS_TABLE, [
        Query.equal('reporterId', userId),
      ]),
    }
  })
})
