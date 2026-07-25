/**
 * Die Schrittfolge des Setup-Flows und die Frage, wann „Weiter" erlaubt ist.
 *
 * PURE und ohne Nuxt: das ist die Regel, die entscheidet, ob jemand
 * weiterkommt — sie gehört getestet, nicht in ein Template. Die Seite
 * (pages/start/community.vue) liest sie, hält sie aber nicht.
 */

export const WIZARD_STEPS = ['basics', 'size', 'category', 'description', 'goal', 'vibe', 'summary'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

/** Unbekannte/fehlende Werte → erster Schritt (eine manipulierte URL darf den
 *  Flow nicht in einen Zustand ohne Antworten schieben). */
export function normalizeStep(value: unknown): WizardStep {
  return typeof value === 'string' && (WIZARD_STEPS as readonly string[]).includes(value)
    ? value as WizardStep
    : WIZARD_STEPS[0]
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step)
}

export function nextStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) + 1] ?? null
}

export function previousStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[stepIndex(step) - 1] ?? null
}

/** Zustand der Adress-Prüfung — 'error' heißt „konnte nicht geprüft werden". */
export type SlugCheck = 'idle' | 'checking' | 'free' | 'taken' | 'error'

export interface WizardAnswers {
  name?: string
  slug?: string
  purpose?: string
  memberRange?: string
  category?: string
  description?: string
  goal?: string
  vibe?: string
}

/**
 * Darf dieser Schritt verlassen werden?
 *
 * Zwei bewusste Entscheidungen:
 *  - `description` ist IMMER erfüllt (überspringbar) — der Text ist ein
 *    Angebot, keine Hürde.
 *  - Ein Adress-Prüffehler ('error') blockiert NICHT: wenn unsere Prüfung
 *    ausfällt, darf das nicht wie ein besetzter Name aussehen. Belegt
 *    ('taken') und „läuft noch" ('checking') blockieren dagegen.
 */
export function isStepComplete(step: WizardStep, answers: WizardAnswers, slug: SlugCheck = 'idle'): boolean {
  switch (step) {
    case 'basics':
      return (answers.name ?? '').trim().length >= 2
        && (answers.slug ?? '').length >= 3
        && slug !== 'taken'
        && slug !== 'checking'
        && Boolean(answers.purpose)
    case 'size': return Boolean(answers.memberRange)
    case 'category': return Boolean(answers.category)
    case 'description': return true
    case 'goal': return Boolean(answers.goal)
    case 'vibe': return Boolean(answers.vibe)
    case 'summary': return true
    // Ein künftiger Schritt ohne eigene Bedingung ist „noch nicht fertig“.
    default: return false
  }
}
