import type { CustomThemeDto, CustomVariant, ThemeConfig } from '../../shared/ramp'
import { contrastRatio, customThemeCss, generateNeutralRamp, generateRamp, HEX_COLOR_RE, wcagLevel } from '../../shared/ramp'
import { oklchToHex } from '../../shared/oklch'
import { resolveThemeFonts } from '../utils/themeRegistry'

/**
 * Draft-Zustand des Studio-Editors: config immer vollständig (die Regler
 * brauchen konkrete Werte), radius null = Theme-Default.
 */
export interface ThemeDraftState {
  id: string | null
  name: string
  primary: string
  config: Required<Omit<ThemeConfig, 'radius' | 'neutral' | 'font' | 'fontHeading' | 'darkAlias' | 'headingWeight' | 'headingTracking' | 'headingUppercase'>> & {
    radius: number | null
    neutral: 'tinted' | null
    font: string | null
    fontHeading: string | null
    darkAlias: 300 | 400 | 500
    headingWeight: 400 | 500 | 600 | 700 | 800 | null
    headingTracking: number
    headingUppercase: boolean
  }
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
  mode: 'perceived', anchor: 'auto', hueShift: 0, saturation: 1, lightnessMax: 97, lightnessMin: 16, radius: null, neutral: null, font: null, fontHeading: null, darkAlias: 400, headingWeight: null, headingTracking: 0, headingUppercase: false,
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
      config: {
        ...DEFAULT_CONFIG,
        ...(custom.config ?? {}),
        radius: custom.config?.radius ?? null,
        neutral: custom.config?.neutral ?? null,
        // Legacy-Paare (editorial …) beim Öffnen auf die Rollen mappen —
        // gespeichert wird nur noch die neue Form
        font: resolveThemeFonts(custom.config).font ?? null,
        fontHeading: resolveThemeFonts(custom.config).fontHeading ?? null,
        darkAlias: custom.config?.darkAlias ?? 400,
        headingWeight: custom.config?.headingWeight ?? null,
        headingTracking: custom.config?.headingTracking ?? 0,
        headingUppercase: custom.config?.headingUppercase ?? false,
      },
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
    // Name mitwechseln, solange er leer oder noch ein Preset-Name ist —
    // ein selbst getippter Name bleibt unangetastet
    const current = draft.value.name.trim()
    if (!current || THEME_PRESETS.some(p => p.name === current)) draft.value.name = preset.name
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

  /** Draft-Config → ThemeConfig (radius/neutral nur wenn gesetzt) */
  function draftConfig(): ThemeConfig {
    const c = draft.value!.config
    return {
      mode: c.mode,
      anchor: c.anchor,
      hueShift: c.hueShift,
      saturation: c.saturation,
      lightnessMax: c.lightnessMax,
      lightnessMin: c.lightnessMin,
      ...(c.radius !== null ? { radius: c.radius as ThemeConfig['radius'] } : {}),
      ...(c.neutral ? { neutral: c.neutral } : {}),
      ...(c.font ? { font: c.font } : {}),
      ...(c.fontHeading && c.fontHeading !== c.font ? { fontHeading: c.fontHeading } : {}),
      ...(c.darkAlias !== 400 ? { darkAlias: c.darkAlias } : {}),
      ...(c.headingWeight !== null ? { headingWeight: c.headingWeight } : {}),
      ...(c.headingTracking !== 0 ? { headingTracking: c.headingTracking } : {}),
      ...(c.headingUppercase ? { headingUppercase: true } : {}),
    }
  }

  /** Brand-getönte Neutral-Ramp des Entwurfs (für Mini-Streifen im Dock) */
  const neutralRamp = computed(() => {
    if (!draft.value || draft.value.config.neutral !== 'tinted' || !HEX_COLOR_RE.test(draft.value.primary)) return null
    return generateNeutralRamp(draft.value.primary)
  })

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

  // Draft-Live-Vorschau: solange ein (gültiger) Entwurf offen ist, ist ER die
  // volle Wahrheit für alle Theme-Attribute (null = Attribut entfernen, kein
  // Fallback aufs aktive Theme). Beim Schließen/Verlassen wird der AKTUELLE
  // Theme-Zustand aus useTheme() angewendet — NICHT der beim Öffnen gemerkte
  // DOM-Zustand: nach dem Speichern wäre der veraltet (Attribute des alten
  // Config-Stands würden wieder auf die Seite gestempelt).
  const { theme: activeTheme, neutral: activeNeutral, font: activeFont, fontHeading: activeFontHeading } = useTheme()

  function applyActiveThemeAttrs() {
    const html = document.documentElement
    if (activeTheme.value.id !== 'default') html.dataset.theme = activeTheme.value.id
    else delete html.dataset.theme
    html.dataset.neutral = activeNeutral.value
    if (activeFont.value) html.dataset.font = activeFont.value
    else delete html.dataset.font
    if (activeFontHeading.value) html.dataset.fontHeading = activeFontHeading.value
    else delete html.dataset.fontHeading
  }

  let previewActive = false
  watch([draft, ramp], () => {
    if (import.meta.server) return
    const html = document.documentElement
    let styleEl = document.getElementById('maui-draft-theme') as HTMLStyleElement | null
    if (draft.value && ramp.value) {
      previewActive = true
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'maui-draft-theme'
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = customThemeCss({ id: 'draft', name: 'Draft', primary: draft.value.primary, order: 0, config: draftConfig() }, 'c-draft')
      html.dataset.theme = 'c-draft'
      html.dataset.neutral = draft.value.config.neutral === 'tinted' ? 'c-draft' : activeNeutral.value
      if (draft.value.config.font) html.dataset.font = draft.value.config.font
      else delete html.dataset.font
      const draftHeading = draft.value.config.fontHeading && draft.value.config.fontHeading !== draft.value.config.font
        ? draft.value.config.fontHeading
        : null
      if (draftHeading) html.dataset.fontHeading = draftHeading
      else delete html.dataset.fontHeading
    }
    else if (previewActive) {
      previewActive = false
      styleEl?.remove()
      applyActiveThemeAttrs()
    }
  }, { deep: true })
  onScopeDispose(() => {
    if (import.meta.server) return
    document.getElementById('maui-draft-theme')?.remove()
    if (previewActive) applyActiveThemeAttrs()
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

  return { draft, busy, isDirty, openCreate, openEdit, applyPreset, randomizePrimary, addVariant, removeVariant, ramp, neutralRamp, valid, contrastChecks, save, close }
}
