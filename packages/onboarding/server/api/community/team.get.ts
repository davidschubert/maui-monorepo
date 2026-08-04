import { Query } from 'node-appwrite'
import { communityContentIsPublic } from '../../../../core/shared/communityAudience'
import type { PublicTeamMember, PublicTeamResponse } from '../../../../control/shared/communityTeam'
import { callControlPlane } from '../../utils/controlPlane'

/**
 * „WER IST HIER ANSPRECHBAR?" — Leitung und Moderation dieser Community
 * (F1 Stufe 3, Davids Entscheidung 2026-08-04). Liest die About-Seite der
 * Discussions.
 *
 * ── OHNE ANMELDUNG, UND WARUM DAS TROTZDEM KEINE AUFWEICHUNG IST ───────────
 * Jede andere Route in diesem Ordner verlangt eine Session, die meisten
 * zusätzlich `team.manage`. Diese nicht — sie liefert aber auch etwas
 * grundlegend anderes: drei Rollen, Name und Bild. Keine Adresse, kein
 * Beitrittsdatum, keine Vollständigkeit der Mitgliederliste. Die Auswahl trifft
 * eine PURE, getestete Regel im Control Plane (`publicTeamFrom`), nicht diese
 * Route — sie könnte also gar nicht mehr herausgeben, wenn sie wollte.
 *
 * Der Weg dorthin ist ein SERVER-ZU-SERVER-Aufruf mit dem vorhandenen
 * Service-Secret (`/api/control/community/team`), KEIN aufgeweichtes
 * JWT-Erfordernis an der bestehenden Mitglieder-Naht. Die Begründung steht
 * ausführlich im Kopf der Control-Route; kurz: ein Gast kann kein JWT haben,
 * und ein optionales JWT an einer Route, die Mitglieder-Adressen herausgibt,
 * wäre die schlechtere Hälfte des Tauschs.
 *
 * ── DIE COMMUNITY-BINDUNG ──────────────────────────────────────────────────
 * `communityId` und `projectId` kommen aus `useTenant(event)`, also aus der
 * HOST-Auflösung — nie aus Query oder Body. Ein Aufrufer kann damit nur das
 * Team der Community erfragen, auf deren Host er gerade steht. Ohne
 * Mandanten-Kontext (Silo, Kontroll-Host, Playground) gibt es nichts zu
 * beantworten: 404.
 *
 * ── GESCHLOSSENE COMMUNITIES ───────────────────────────────────────────────
 * Ist das Publikum 'members' (C18), sieht ein GAST hier nichts — dort ist
 * bereits jeder Beitrag für ihn unsichtbar, und ausgerechnet die Namen der
 * Leitung wären dann die einzige Auskunft, die aus dem geschlossenen Raum
 * dringt. Angemeldete Besucher bekommen die Liste; ob sie Mitglied sind, prüft
 * diese Route bewusst NICHT nach: die Namen stehen für jedes Mitglied ohnehin
 * an jedem Beitrag, und eine zweite Mitgliedschaftsprüfung hier wäre eine
 * Grenze, die es an der Datentür schon gibt.
 */
export default defineEventHandler(async (event): Promise<PublicTeamResponse> => {
  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  if (!communityContentIsPublic(tenant) && !event.context.user) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const team = await callControlPlane<PublicTeamResponse>(event, '/api/control/community/team', {
    communityId: tenant.communityId,
    runtimeProjectId: tenant.projectId,
  })

  const ids = [...new Set(team.members.map(member => member.runtimeUserId).filter(Boolean))]
  if (ids.length === 0) return { members: [] }

  /**
   * Namen UND Bilder in EINEM Durchgang. `resolveAvatars` holt zwar genau das
   * Richtige, kann aber nur Bilder — für die Namen liefe daneben eine zweite
   * `users.list` über dieselben Ids. Beides aus einer Abfrage zu nehmen ist
   * hier billiger und liest sich ehrlicher; das Muster (Hunderter-Bündel, kein
   * Aufruf je Zeile) ist dasselbe wie dort und wie in members/index.get.ts.
   *
   * FAIL-SOFT: Namen und Bilder sind Komfort. Fällt die Auflösung aus, steht
   * die Rolle immer noch da — ein 500 wegen eines fehlenden Avatars wäre die
   * schlechtere Antwort. (Der Gegen-Fall zu D5, wo fail-soft eine echte Falle
   * ist: dort ginge eine Mail an die falsche Adresse, hier fehlt ein Bild.)
   */
  const names = new Map<string, string>()
  const avatars = new Map<string, string>()
  try {
    const admin = createAdminClient(event)
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const res = await admin.users.list({ queries: [Query.equal('$id', batch), Query.limit(batch.length)] })
      for (const user of res.users) {
        if (user.name) names.set(user.$id, user.name)
        const url = (user.prefs as { avatarUrl?: string })?.avatarUrl
        if (typeof url === 'string' && url.length > 0) avatars.set(user.$id, url)
      }
    }
  }
  catch { /* Komfort, kein Inhalt — die Rollen stehen auch ohne Namen. */ }

  const members: PublicTeamMember[] = team.members.map(member => ({
    ...member,
    name: names.get(member.runtimeUserId) ?? '',
    avatarUrl: avatars.get(member.runtimeUserId) ?? '',
  }))

  /**
   * WER KEINEN NAMEN HAT, ERSCHEINT NICHT. Anders als die
   * Mitglieder-VERWALTUNG, die auf die E-Mail-Adresse zurückfällt — die gibt es
   * hier bewusst nicht, und eine Zeile mit leerem Namen wäre für einen Besucher
   * kein Ansprechpartner, sondern ein Rätsel. Passieren kann das nur, wenn ein
   * Konto im Runtime-Projekt gelöscht wurde, während die Mitgliedschaft im
   * Control Plane noch steht.
   */
  return { members: members.filter(member => member.name !== '') }
})
