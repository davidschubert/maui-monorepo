import type { InjectionKey } from 'vue'

export interface ThreadCollapse {
  /** Sind die Antworten dieses Kommentars eingeklappt? */
  isCollapsed: (id: string) => boolean
  /** Auf-/Zuklappen umschalten (persistiert pro Target im Cookie) */
  toggle: (id: string) => void
}

export const threadCollapseKey: InjectionKey<ThreadCollapse> = Symbol('thread-collapse')

const COOKIE_NAME = 'maui-comments-collapsed'
// Wie viele Threads wir merken — begrenzt die Cookie-Größe (älteste fliegen raus).
const MAX_TARGETS = 10
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180 // 180 Tage

type CollapseMap = Record<string, string[]>

/**
 * Hält den Auf-/Zuklapp-Zustand des Kommentar-Trees und persistiert ihn pro
 * Target (targetType:targetId) in EINEM Cookie — überlebt Reload und nächsten
 * Besuch. Cookie statt localStorage, damit der Server den Zustand schon beim
 * SSR kennt und den Tree direkt korrekt (ein-/aufgeklappt) rendert: kein Flash,
 * kein Hydration-Mismatch. In CommentSection synchron im Setup aufrufen;
 * Kind-Komponenten lesen via useThreadCollapse()/inject.
 *
 * Gespeichert werden nur die EINGEKLAPPTEN IDs je Target (Default = aufgeklappt);
 * die Map ist auf MAX_TARGETS (jüngste) begrenzt.
 */
export function provideThreadCollapse(targetType: string, targetId: string): ThreadCollapse {
  const targetKey = `${targetType}:${targetId}`
  const store = useCookie<CollapseMap>(COOKIE_NAME, {
    default: () => ({}),
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
  })

  const collapsed = computed(() => new Set(store.value?.[targetKey] ?? []))

  function toggle(id: string) {
    const set = new Set(collapsed.value)
    if (set.has(id)) set.delete(id)
    else set.add(id)

    // Bestehende Einträge ohne das aktuelle Target (Reihenfolge bleibt erhalten),
    // dann das Target ans Ende setzen (Recency) — leere Sets fallen ganz raus.
    const entries = Object.entries(store.value ?? {}).filter(([k]) => k !== targetKey)
    if (set.size) entries.push([targetKey, [...set]])

    // Auf die jüngsten MAX_TARGETS begrenzen (älteste vorne abschneiden).
    store.value = Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_TARGETS)))
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
