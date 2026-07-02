import { createSessionClient } from '../../../lib/appwrite'
import type { UserSessionListResponse } from '../../../../shared/types/session'

/** Eigene aktive Sessions des Users (SessionClient — nur seine eigenen). */
export default defineEventHandler(async (event): Promise<UserSessionListResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { account } = createSessionClient(event)
  const list = await account.listSessions()

  // mapSafeSession (server/utils): vollständige, aber Secret-freie Sicht
  return { sessions: list.sessions.map(s => mapSafeSession(s, s.current)) }
})
