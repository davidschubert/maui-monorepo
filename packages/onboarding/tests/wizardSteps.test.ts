import { describe, expect, it } from 'vitest'
import {
  WIZARD_STEPS,
  isStepComplete,
  nextStep,
  normalizeStep,
  previousStep,
  stepIndex,
} from '../shared/wizardSteps'

const FULL = {
  name: 'Jungle Zipline',
  slug: 'jungle-zipline',
  purpose: 'new',
  memberRange: 'to100',
  category: 'creator',
  goal: 'relationships',
  vibe: 'calm',
}

describe('Schrittfolge', () => {
  it('hat sieben Schritte und beginnt bei den Basics', () => {
    expect(WIZARD_STEPS).toHaveLength(7)
    expect(WIZARD_STEPS[0]).toBe('basics')
    expect(WIZARD_STEPS.at(-1)).toBe('summary')
  })

  it('normalisiert Müll aus der URL auf den ersten Schritt', () => {
    for (const value of ['', 'gibt-es-nicht', undefined, null, 42, {}]) {
      expect(normalizeStep(value)).toBe('basics')
    }
    expect(normalizeStep('vibe')).toBe('vibe')
  })

  it('läuft vorwärts und rückwärts bis an die Ränder', () => {
    expect(nextStep('basics')).toBe('size')
    expect(nextStep('summary')).toBeNull()
    expect(previousStep('basics')).toBeNull()
    expect(previousStep('summary')).toBe('vibe')
    expect(stepIndex('goal')).toBe(4)
  })
})

describe('Wann „Weiter" erlaubt ist', () => {
  it('verlangt Name, Adresse und Zweck im ersten Schritt', () => {
    expect(isStepComplete('basics', FULL, 'free')).toBe(true)
    expect(isStepComplete('basics', { ...FULL, name: ' A ' }, 'free')).toBe(false)
    expect(isStepComplete('basics', { ...FULL, slug: 'ab' }, 'free')).toBe(false)
    expect(isStepComplete('basics', { ...FULL, purpose: undefined }, 'free')).toBe(false)
  })

  it('blockiert eine belegte Adresse und eine laufende Prüfung', () => {
    expect(isStepComplete('basics', FULL, 'taken')).toBe(false)
    expect(isStepComplete('basics', FULL, 'checking')).toBe(false)
  })

  it('lässt bei einem PRÜFFEHLER weiterarbeiten', () => {
    // Fällt unsere Prüfung aus, darf das nicht wie „Name vergeben" wirken —
    // sonst sucht jemand einen neuen Namen, obwohl der alte frei ist.
    expect(isStepComplete('basics', FULL, 'error')).toBe(true)
    expect(isStepComplete('basics', FULL, 'idle')).toBe(true)
  })

  it('macht die Beschreibung überspringbar', () => {
    expect(isStepComplete('description', {}, 'idle')).toBe(true)
  })

  it('verlangt eine Auswahl in den Katalog-Schritten', () => {
    expect(isStepComplete('size', {})).toBe(false)
    expect(isStepComplete('category', {})).toBe(false)
    expect(isStepComplete('goal', {})).toBe(false)
    expect(isStepComplete('vibe', {})).toBe(false)
    expect(isStepComplete('size', { memberRange: 'to100' })).toBe(true)
  })

  it('lässt die Zusammenfassung immer abschicken', () => {
    expect(isStepComplete('summary', {})).toBe(true)
  })
})
