import { z } from 'zod'
import { publicTeamFrom, type PublicTeamResponse } from '../../../../shared/communityTeam'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { listCommunityMembers } from '../../../utils/communityTeam'

/**
 * DIE ÖFFENTLICHE TEAM-SICHT einer Community (F1 Stufe 3, Davids Entscheidung
 * 2026-08-04): Leitung und Moderation, nur Rolle und Runtime-Id.
 *
 * ── WARUM EINE EIGENE ROUTE UND KEIN `view`-PARAMETER AN `members/list` ─────
 * Der Auftrag nannte einen redigierenden Parameter an der bestehenden Naht. Bei
 * der Umsetzung ist das an einer harten Tatsache gescheitert, und die Tatsache
 * ist die bessere Begründung als jede Vorliebe:
 *
 *   `members/list` verlangt ein **JWT** (`jwt: z.string().min(1)`, `.strict()`)
 *   und leitet daraus über `requireCommunityTeamContext` die Identität, die
 *   Mitgliedschaft UND die Capability `team.manage` ab.
 *
 * Ein GAST hat kein JWT — die Pool-Seite kann ihm keines ausstellen
 * (`mintServiceJwt` wirft ohne Session 401). Ein `view`-Parameter hätte das
 * JWT also optional machen müssen, und damit wäre aus dem Pflichtfeld einer
 * Route, die Mitglieder-Adressen herausgibt, ein optionales geworden. Genau
 * diese Sorte Aufweichung („nur für den harmlosen Fall") ist die, die man ein
 * halbes Jahr später als Befund wiederfindet. Die Auth wird deshalb NICHT
 * aufgeweicht; stattdessen steht hier eine zweite Route, die nie mehr
 * herausgeben KANN, weil sie die Felder gar nicht erst zusammenbaut
 * (`publicTeamFrom`, pur und getestet).
 *
 * ── WAS SIE STATTDESSEN SCHÜTZT ────────────────────────────────────────────
 * Zwei Gates, dasselbe Muster wie bei `members/user-data` und `user-erase` —
 * den beiden anderen JWT-freien Routen dieser Naht:
 *  1. `requireOnboardingCaller` — das Service-Secret. Ohne konfiguriertes
 *     Secret antwortet die Route 404 (standardmäßig aus).
 *  2. `assertOnboardingRuntimeProject` — das genannte Runtime-Projekt wird
 *     gegen das EINE gehalten, das diese Naht bedient. Ein Aufrufer kann sich
 *     also nicht das Team einer Community in einem fremden Projekt geben
 *     lassen (F33: dieselbe Lücke gab es einmal in Leserichtung).
 * Dazu die Bindung AN DIE COMMUNITY: die `communityId` wird gegen
 * `tenants.projectId` geprüft — sie muss zu genau diesem Runtime-Projekt
 * gehören. Die Pool-Seite nimmt sie ohnehin nicht vom Aufrufer entgegen,
 * sondern aus der Host-Auflösung.
 *
 * Was ein Aufrufer mit dem Secret damit erreichen kann: die Namen der
 * Leitung einer Community seines eigenen Projekts — dieselben Namen, die unter
 * jedem öffentlichen Beitrag stehen. Wer das Secret hat, hat ohnehin Zugriff
 * auf ungleich mehr.
 */
const bodySchema = z.object({
  communityId: z.string().min(1).max(36),
  runtimeProjectId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<PublicTeamResponse> => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const runtimeProjectId = assertOnboardingRuntimeProject(event, body.runtimeProjectId)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  /**
   * Gehört diese Community zu diesem Runtime-Projekt? Dieselbe Prüfung, die
   * `requireCommunityTeamContext` macht — nur ohne den Identitäts-Teil, den es
   * hier nicht gibt. Ohne sie könnte eine erfundene communityId das Team einer
   * beliebigen fremden Community ziehen.
   *
   * 404 statt 403: ob es eine Community mit dieser Id anderswo gibt, ist keine
   * Auskunft, die diese Route schuldet.
   */
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: body.communityId,
  }).catch(() => null)

  if (!tenant || tenant.projectId !== runtimeProjectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  const members = await listCommunityMembers(event, body.communityId, runtimeProjectId)
  return { members: publicTeamFrom(members) }
})
