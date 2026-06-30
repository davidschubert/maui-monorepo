import type { InjectionKey } from 'vue'

export interface ThreadCollapse {
  /** Sind die Antworten dieses Kommentars eingeklappt? */
  isCollapsed: (id: string) => boolean
  /** Auf-/Zuklappen umschalten (persistiert pro Target in localStorage) */
  toggle: (id: string) => void
}

export const threadCollapseKey: InjectionKey<ThreadCollapse> = Symbol('thread-collapse')

const STORAGE_PREFIX = 'maui:comments:collapsed:'

/**
 * Hält den Auf-/Zuklapp-Zustand des Kommentar-Trees und persistiert ihn pro
 * Target (targetType:targetId) in localStorage — überlebt Reload und nächsten
 * Besuch. In CommentSection synchron im Setup aufrufen; Kind-Komponenten lesen
 * via useThreadCollapse()/inject.
 *
 * Gespeichert werden nur die EINGEKLAPPTEN IDs (Default = aufgeklappt). SSR
 * rendert aufgeklappt; der gespeicherte Zustand wird erst nach Mount angewandt
 * (kein Hydration-Mismatch).
 */
export function provideThreadCollapse(targetType: string, targetId: string): ThreadCollapse {
  const key = `${STORAGE_PREFIX}${targetType}:${targetId}`
  const collapsed = ref<Set<string>>(new Set())

  onMounted(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) collapsed.value = new Set(JSON.parse(raw) as string[])
    }
    catch {
      // korrupter Eintrag oder blockierter Storage → aufgeklappt starten
    }
  })

  function persist() {
    try {
      if (collapsed.value.size) localStorage.setItem(key, JSON.stringify([...collapsed.value]))
      else localStorage.removeItem(key)
    }
    catch {
      // Storage nicht verfügbar (Private Mode etc.) → still ignorieren
    }
  }

  function toggle(id: string) {
    const next = new Set(collapsed.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    collapsed.value = next
    persist()
  }

  const api: ThreadCollapse = {
    isCollapsed: (id: string) => collapsed.value.has(id),
    toggle,
  }
  provide(threadCollapseKey, api)
  return api
}

/**
 * Collapse-API aus dem Provider; Fallback = lokaler, NICHT persistierter Zustand
 * (Standalone-Nutzung der CommentThread-Komponente ohne CommentSection).
 */
export function useThreadCollapse(): ThreadCollapse {
  return inject(threadCollapseKey, () => {
    const collapsed = ref<Set<string>>(new Set())
    return {
      isCollapsed: (id: string) => collapsed.value.has(id),
      toggle: (id: string) => {
        const next = new Set(collapsed.value)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        collapsed.value = next
      },
    }
  }, true)
}
