/**
 * Sprachoptionen für die Sprachauswahl — datengetrieben aus der i18n-locales-Config.
 *
 * Label-Format wie ein klassischer Language-Picker: Eigenname (Autonym) plus der
 * Name in der AKTUELLEN UI-Sprache in Klammern — z.B. unter Deutsch
 * „English (Englisch)“, „Deutsch“ (ohne Klammer, weil Eigenname == übersetzter
 * Name). Beide Switcher (Header + Dashboard) teilen sich diese Quelle.
 */
import type { ComputedRef } from 'vue'

export interface LocaleOption {
  code: string
  label: string
  flag: string
}

// Flaggen-Icon je Sprachcode (circle-flags-Collection). Fallback: Globus.
const FLAGS: Record<string, string> = {
  en: 'i-circle-flags-us',
  de: 'i-circle-flags-de',
}

export function useLocaleOptions(): ComputedRef<LocaleOption[]> {
  const { locale, locales } = useI18n()
  const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

  function label(code: string): string {
    try {
      const autonym = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
      const localized = new Intl.DisplayNames([locale.value], { type: 'language' }).of(code) ?? code
      // Klammer weglassen, wenn Eigenname == übersetzter Name (z.B. „Deutsch“ unter de)
      return autonym.toLowerCase() === localized.toLowerCase()
        ? cap(autonym)
        : `${cap(autonym)} (${cap(localized)})`
    }
    catch {
      return code
    }
  }

  return computed(() => locales.value.map(l => ({
    code: l.code,
    label: label(l.code),
    flag: FLAGS[l.code] ?? 'i-ph-globe',
  })))
}
