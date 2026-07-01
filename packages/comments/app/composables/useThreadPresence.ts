import type { InjectionKey } from 'vue'

/** Composer meldet Tippen an die Thread-Presence (von CommentSection bereitgestellt) */
export const commentTypingKey: InjectionKey<(active: boolean) => void> = Symbol('comment-typing')

/**
 * Thread-Presence (#10): wer schaut einen Kommentar-Thread gerade an / tippt.
 * Baut auf der Core-Presence-Primitive (Appwrite Presences API, seit 1.9.5
 * self-hostbar) mit scope '<type>:<id>' — ersetzt die frühere presence-Table +
 * manuelles Stale-Cleanup + Poll-Endpoints.
 */
export function useThreadPresence(targetType: string, targetId: string) {
  return usePresence(`${targetType}:${targetId}`)
}
