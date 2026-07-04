import type { CustomThemeDto, CustomVariant, ThemeConfig } from '../../shared/ramp'
import { contrastRatio, customThemeCss, generateRamp, HEX_COLOR_RE, wcagLevel } from '../../shared/ramp'
import { oklchToHex } from '../../shared/oklch'

/**
 * Draft-Zustand des Studio-Editors: config immer vollständig (die Regler
 * brauchen konkrete Werte), radius null = Theme-Default.
 */
export interface ThemeDraftState {
  id: string | null
  name: string
  primary: string
  config: Required<Omit<ThemeConfig, 'radius'>> & { radius: number | null }
  variants: CustomVariant[]
}

/** Kuratierte Startpunkte für neue Themes */
export const THEME_PRESETS: { name: string, primary: string }[] = [
  { name: 'Lagoon', primary: '#0d9488' },
  { name: 'Royal', primary: '#4f46e5' },
  { name: 'Ember', primary: '#ea580c' },
  { name: 'Orchid', primary: '#c026d3' },
  { name: 'Meadow', primary: '#16a34a' },
  { name: 'Slate', primary: '#52525b' },
]

const DEFAULT_CONFIG: ThemeDraftState['config'] = {
  mode: 'perceived', anchor: 'auto', hueShift: 0, saturation: 1, lightnessMax: 97, lightnessMin: 16, radius: null,
}

export interface ContrastCheck {
  key: 'white500' | 'white600' | 'white400' | 'black200'
  bg: string
  fg: string
  ratio: number
  level: ReturnType<typeof wcagLevel>
}

/**
 * Kapselt den Theme-Entwurf des Studio-Editors: Zustand, generierte Ramp,
 * Live-Vorschau (Draft-CSS auf der ganzen Seite via data-theme='c-draft'),
 * Kontrast-Checks, Dirty-Tracking und Speichern (POST/PATCH).
 * UI-frei: Toasts/Navigation/i18n bleiben in der aufrufenden Komponente.
 */
export function useThemeDraft() {
  const draft = ref<ThemeDraftState | null>(null)
  const busy = ref(false)
  const savedSnapshot = ref('')

  const snapshot = () => JSON.stringify(draft.value)

  function openCreate() {
    draft.value = { id: null, name: '', primary: '#2f7fee', config: { ...DEFAULT_CONFIG }, variants: [] }
    savedSnapshot.value = snapshot()
  }

  function openEdit(custom: CustomThemeDto) {
    draft.value = {
      id: custom.id,
      name: custom.name,
      primary: custom.primary,
      config: { ...DEFAULT_CONFIG, ...(custom.config ?? {}), radius: custom.config?.radius ?? null },
      variants: [...(custom.variants ?? [])],
    }
    savedSnapshot.value = snapshot()
  }

  const isDirty = computed(() => draft.value !== null && snapshot() !== savedSnapshot.value)

  /**
   * Würfelt eine Basisfarbe: zufälliger Hue bei gesunder Chroma/Lightness
   * (OKLCH), damit jede gewürfelte Farbe eine brauchbare Ramp ergibt.
   */
  function randomizePrimary() {
    if (!draft.value) return
    draft.value.primary = oklchToHex({
      l: 0.55 + Math.random() * 0.17,
      c: 0.11 + Math.random() * 0.06,
      h: Math.random() * 360,
    })
  }

  function applyPreset(preset: { name: string, primary: string }) {
    if (!draft.value) return
    draft.value.primary = preset.primary
    if (!draft.value.name.trim()) draft.value.name = preset.name
  }

  function addVariant() {
    if (!draft.value || draft.value.variants.length >= 6) return
    const used = new Set(draft.value.variants.map(v => v.id))
    let n = 1
    while (used.has(`v${n}`)) n++
    draft.value.variants.push({ id: `v${n}`, color: draft.value.primary })
  }

  function removeVariant(index: number) {
    draft.value?.variants.splice(index, 1)
  }

  /** Draft-Config → ThemeConfig (radius nur wenn gesetzt) */
  function draftConfig(): ThemeConfig {
    const c = draft.value!.config
    return { mode: c.mode, anchor: c.anchor, hueShift: c.hueShift, saturation: c.saturation, lightnessMax: c.lightnessMax, lightnessMin: c.lightnessMin, ...(c.radius !== null ? { radius: c.radius as ThemeConfig['radius'] } : {}) }
  }

  const ramp = computed(() => {
    if (!draft.value || !HEX_COLOR_RE.test(draft.value.primary)) return null
    return generateRamp(draft.value.primary, draftConfig())
  })

  const valid = computed(() =>
    !!draft.value && draft.value.name.trim().length > 0 && HEX_COLOR_RE.test(draft.value.primary),
  )

  // Kontrast-Checks der kritischen Kombinationen (Button-Text auf primary)
  const contrastChecks = computed<ContrastCheck[]>(() => {
    const r = ramp.value
    if (!r) return []
    return ([
      { key: 'white500', bg: r[500], fg: '#ffffff' },
      { key: 'white600', bg: r[600], fg: '#ffffff' },
      { key: 'white400', bg: r[400], fg: '#ffffff' },
      { key: 'black200', bg: r[200], fg: '#000000' },
    ] as const).map((check) => {
      const ratio = contrastRatio(check.bg, check.fg) ?? 0
      return { ...check, ratio, level: wcagLevel(ratio) }
    })
  })

  // Draft-Live-Vorschau: solange ein (gültiger) Entwurf offen ist, wird er auf
  // die GANZE Seite angewendet — beurteilen an echten Components statt am
  // Farbstreifen. Schließen/Verlassen stellt das aktive Theme wieder her.
  let previousDataTheme: string | undefined
  watch([draft, ramp], () => {
    if (import.meta.server) return
    const html = document.documentElement
    let styleEl = document.getElementById('maui-draft-theme') as HTMLStyleElement | null
    if (draft.value && ramp.value) {
      if (previousDataTheme === undefined) previousDataTheme = html.dataset.theme ?? ''
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'maui-draft-theme'
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = customThemeCss({ id: 'draft', name: 'Draft', primary: draft.value.primary, order: 0, config: draftConfig() }, 'c-draft')
      html.dataset.theme = 'c-draft'
    }
    else {
      styleEl?.remove()
      if (previousDataTheme !== undefined) {
        if (previousDataTheme) html.dataset.theme = previousDataTheme
        else delete html.dataset.theme
        previousDataTheme = undefined
      }
    }
  }, { deep: true })
  onScopeDispose(() => {
    if (import.meta.server) return
    document.getElementById('maui-draft-theme')?.remove()
    if (previousDataTheme !== undefined) {
      if (previousDataTheme) document.documentElement.dataset.theme = previousDataTheme
      else delete document.documentElement.dataset.theme
    }
  })

  /**
   * Speichert den Entwurf (POST bei neu, sonst PATCH) und refresht die
   * Theme-States. Wirft bei Fehlern (Caller mappt auf Toasts).
   */
  async function save(): Promise<{ created: CustomThemeDto | null }> {
    if (!draft.value || !valid.value) return { created: null }
    busy.value = true
    try {
      const body = {
        name: draft.value.name.trim(),
        primary: draft.value.primary.toLowerCase(),
        config: draftConfig(),
        variants: draft.value.variants.filter(v => HEX_COLOR_RE.test(v.color)),
      }
      let created: CustomThemeDto | null = null
      if (draft.value.id) {
        await $fetch(`/api/admin/themes/${draft.value.id}`, { method: 'PATCH', body })
      }
      else {
        created = await $fetch<CustomThemeDto>('/api/admin/themes', { method: 'POST', body })
      }
      await refreshCustomThemes()
      savedSnapshot.value = snapshot()
      return { created }
    }
    finally {
      busy.value = false
    }
  }

  function close() {
    draft.value = null
  }

  return { draft, busy, isDirty, openCreate, openEdit, applyPreset, randomizePrimary, addVariant, removeVariant, ramp, valid, contrastChecks, save, close }
}
