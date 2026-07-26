import type { SiteVibeId } from '../../../control/shared/onboarding'

/**
 * Der Entwurf, während der Wizard läuft.
 *
 * Warum sessionStorage und nicht der Server: bis Schritt 7 ist NICHTS
 * entstanden — es gibt keine halbe Community, die man serverseitig
 * fortschreiben müsste (das ist die Zusage „keine verwaiste Row bei Abbruch").
 * Trotzdem darf ein Reload oder ein versehentliches Zurück nicht sieben
 * Antworten vernichten, also überlebt der Entwurf den Reload — und verschwindet
 * mit dem Tab, weil ein liegengebliebener Entwurf in einem geteilten Browser
 * nichts von jemandem verraten soll.
 */
export interface OnboardingDraft {
  inviteCode?: string
  name?: string
  slug?: string
  slugTouched?: boolean
  purpose?: string
  memberRange?: string
  category?: string
  description?: string
  goal?: string
  vibe?: SiteVibeId
}

const STORAGE_KEY = 'maui-onboarding-draft'

export function useOnboardingDraft() {
  const draft = useState<OnboardingDraft>('onboarding-draft', () => ({}))

  // Nur im Browser: SSR hat keinen sessionStorage, und der Entwurf gehört
  // ohnehin nicht in den ausgelieferten HTML-Payload.
  onMounted(() => {
    if (Object.keys(draft.value).length) return
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) draft.value = JSON.parse(stored) as OnboardingDraft
    }
    catch { /* kaputter/blockierter Storage darf den Wizard nicht anhalten */ }
  })

  if (import.meta.client) {
    watch(draft, (value) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      }
      catch { /* s. o. */ }
    }, { deep: true })
  }

  return draft
}

export function clearOnboardingDraft() {
  if (import.meta.client) {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    }
    catch { /* egal */ }
  }
}
