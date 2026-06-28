/**
 * Melde-Primitive — die wiederverwendbare Client-Logik des Moderation-Layers.
 * Domänen-agnostisch: targetType/targetId kommen vom Aufrufer. Keine Konsequenz,
 * nur Erfassung/Rückzug (Layer-Grenze A14).
 */
export function useReport() {
  const pending = ref(false)

  async function submit(input: { targetType: string, targetId: string, reason: string, note?: string }) {
    pending.value = true
    try {
      return await $fetch('/api/reports', { method: 'POST', body: input })
    }
    finally {
      pending.value = false
    }
  }

  async function retract(targetType: string, targetId: string) {
    pending.value = true
    try {
      return await $fetch('/api/reports', { method: 'DELETE', query: { targetType, targetId } })
    }
    finally {
      pending.value = false
    }
  }

  return { pending, submit, retract }
}
