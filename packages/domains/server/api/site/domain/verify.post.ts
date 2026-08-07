import { verifySiteDomain } from '../../../utils/siteDomain'

/**
 * „Prüfen" aus dem Silo-Dashboard heraus (control-036).
 *
 * Re-entrant und ohne eigenen Rumpf: der ganze Ablauf steht in
 * `verifySiteDomain()` — Naht rufen, bei Bedarf die Appwrite-Web-Platform
 * anlegen (F45), quittieren. Zwei Hände, eine Bewegung; die Begründung dazu
 * steht dort.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')
  return await verifySiteDomain(event)
})
