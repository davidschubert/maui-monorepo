import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { paidAccessChoosable } from '../shared/types/event'

/**
 * F13 — „Bezahlt" steht nur dort im Dashboard-Formular, wo auch verkauft
 * werden kann.
 *
 * Der Kauf-CTA (EventDetail) und das Formular hängen am GLEICHEN Wert
 * `pukalani.events.ticketCheckoutPath`; ein zweites Flag gäbe es nicht
 * umsonst, es könnte auseinanderlaufen. Diese Suite nagelt beides fest: die
 * Regel selbst UND die zwei Config-Stellen, aus denen sie ihre Wahrheit zieht
 * (Layer-Default leer ⇒ Pool gesperrt, apps/comments gesetzt ⇒ Silo
 * unverändert). Ohne den zweiten Teil wäre die Regel grün und die Wirkung
 * trotzdem falsch, sobald jemand die Config anfasst.
 */
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const read = (path: string) => readFileSync(`${repoRoot}${path}`, 'utf8')

describe('paidAccessChoosable (F13)', () => {
  it('Pool (kein Checkout-Pfad): beim Anlegen nicht wählbar', () => {
    expect(paidAccessChoosable('')).toBe(false)
    expect(paidAccessChoosable(undefined)).toBe(false)
    expect(paidAccessChoosable(null)).toBe(false)
  })

  it('Pool: ein bestehendes FREE-Event bleibt gesperrt', () => {
    expect(paidAccessChoosable('', 'free')).toBe(false)
    // Bestandsrow ohne access-Spalte (null) zählt wie 'free'
    expect(paidAccessChoosable('', null)).toBe(false)
  })

  it('Pool: ein bestehendes PAID-Event behält die Option (Bestand wird nicht überschrieben)', () => {
    expect(paidAccessChoosable('', 'paid')).toBe(true)
  })

  it('Silo (Checkout-Pfad gesetzt): immer wählbar — anlegen wie bearbeiten', () => {
    expect(paidAccessChoosable('/api/events/{id}/checkout')).toBe(true)
    expect(paidAccessChoosable('/api/events/{id}/checkout', 'free')).toBe(true)
    expect(paidAccessChoosable('/api/events/{id}/checkout', 'paid')).toBe(true)
  })
})

describe('Herkunft der Wahrheit (F13)', () => {
  it('Layer-Default ist LEER — der Pool erbt „kein Verkauf"', () => {
    const layer = read('packages/events/app/app.config.ts')
    expect(layer).toMatch(/ticketCheckoutPath:\s*''/)
  })

  it('apps/comments (Silo) setzt den Pfad — die Option bleibt dort sichtbar', () => {
    const silo = read('apps/comments/app/app.config.ts')
    expect(silo).toMatch(/ticketCheckoutPath:\s*'\/api\/events\/\{id\}\/checkout'/)
  })

  it('apps/platform (Pool) setzt ihn NICHT — sonst wäre die Sperre wirkungslos', () => {
    const pool = read('apps/platform/app/app.config.ts')
    expect(pool).not.toMatch(/ticketCheckoutPath/)
  })
})
