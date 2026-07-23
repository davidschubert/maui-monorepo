import { checkEmbedHost } from '../../../shared/embedOrigins'
import { listEmbedSites } from '../../utils/embedSites'

/**
 * E3: Best-effort-Registry-Check für die /embed-Seite (SSR-intern aufgerufen).
 * Die HARTE Grenze ist die frame-ancestors-CSP — hier geht es um die
 * freundliche Fehlermeldung im iframe (statt eines vom Browser geblockten,
 * leeren Rahmens beim Direktaufruf) und die targetType-Begrenzung je Site.
 * Öffentlich unkritisch: die CSP legt die Allowlist ohnehin offen.
 */
export default defineEventHandler(async (event): Promise<{ verdict: string }> => {
  const appConfig = useAppConfig() as {
    maui?: { comments?: { embed?: { enabled?: boolean, allowedOrigins?: string[] } } }
  }
  const embed = appConfig.maui?.comments?.embed
  if (!embed?.enabled) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }
  const query = getQuery(event)
  const url = typeof query.url === 'string' ? query.url : undefined
  const targetType = String(query.targetType ?? '')
  const sites = await listEmbedSites(event).catch(() => [])
  return { verdict: checkEmbedHost(embed.allowedOrigins ?? [], sites, url, targetType) }
})
