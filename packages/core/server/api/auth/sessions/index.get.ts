import { createSessionClient } from '../../../lib/appwrite'
import type { UserSessionListResponse } from '../../../../shared/types/session'

/** Eigene aktive Sessions des Users (SessionClient — nur seine eigenen). */
export default defineEventHandler(async (event): Promise<UserSessionListResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { account } = createSessionClient(event)
  const list = await account.listSessions()

  return {
    sessions: list.sessions.map(s => ({
      $id: s.$id,
      $createdAt: s.$createdAt,
      provider: s.provider,
      ip: s.ip,
      osName: s.osName,
      osVersion: s.osVersion,
      clientName: s.clientName,
      clientVersion: s.clientVersion,
      deviceName: s.deviceName,
      countryName: s.countryName,
      current: s.current,
    })),
  }
})
