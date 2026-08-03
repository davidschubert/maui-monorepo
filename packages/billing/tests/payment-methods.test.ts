import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHECKOUT_PAYMENT_METHOD_TYPES, DEFERRED_PAYMENT_METHODS } from '../shared/paymentMethods'

/**
 * F20 (Davids Entscheidung 2026-08-03): nur Karte, SEPA und Rechnung aus.
 *
 * Der Wert allein genügt nicht — die Zusage gilt nur, wenn ihn JEDE
 * Checkout-Erzeugung mitgibt. Es sind heute vier, verteilt über zwei Pakete
 * und eine App, und eine fünfte wird irgendwann dazukommen. Deshalb prüft
 * dieser Test die QUELLE: wer eine Session anlegt und das Feld vergisst,
 * bekommt wieder die Dashboard-Voreinstellung — und das sieht man ihm an der
 * Stelle nicht an, weil der Checkout dann einfach mehr Knöpfe zeigt.
 */
const REPO = resolve(import.meta.dirname, '../../..')
const SKIP = new Set(['node_modules', '.nuxt', '.output', 'dist', '.git', 'releases', '.claude'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Der Aufruf-Block ab `checkout.sessions.create(` bis zur schließenden `})`. */
function checkoutCalls(source: string): string[] {
  const blocks: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf('checkout.sessions.create(', from)
    if (start === -1) return blocks
    const end = source.indexOf('\n  })', start)
    blocks.push(source.slice(start, end === -1 ? source.length : end))
    from = start + 1
  }
}

describe('F20 — Zahlungsarten', () => {
  it('bietet genau Karte an', () => {
    expect([...CHECKOUT_PAYMENT_METHOD_TYPES]).toEqual(['card'])
  })

  it('nennt SEPA und Rechnung als das, was ausgeschlossen ist', () => {
    // Gegenprobe zur Zeile darüber: sonst wäre der Test auch bei einer leeren
    // Liste grün und die Dokumentation könnte still verschwinden.
    expect(DEFERRED_PAYMENT_METHODS).toContain('sepa_debit')
    expect(DEFERRED_PAYMENT_METHODS).toContain('customer_balance')
    expect(DEFERRED_PAYMENT_METHODS).not.toContain('card')
  })

  it('JEDE Checkout-Erzeugung im Repo setzt payment_method_types', () => {
    const files = [
      ...walk(resolve(REPO, 'packages')),
      ...walk(resolve(REPO, 'apps')),
    ]
    // Testdateien raus — diese hier nennt den Aufruf selbst und fände sonst
    // sich selbst als Verstoß.
    const withCheckout = files.filter(f => !f.includes('/tests/')
      && readFileSync(f, 'utf8').includes('checkout.sessions.create('))

    const missing: string[] = []
    let calls = 0
    for (const file of withCheckout) {
      for (const block of checkoutCalls(readFileSync(file, 'utf8'))) {
        calls++
        if (!block.includes('payment_method_types')) missing.push(file.slice(REPO.length + 1))
      }
    }
    // Ohne diese Zeile wäre der Test auch dann grün, wenn der Scan nichts
    // findet — ein umbenannter Ordner hätte ihn stillgelegt.
    expect(calls).toBeGreaterThanOrEqual(4)
    expect(missing).toEqual([])
  })
})
