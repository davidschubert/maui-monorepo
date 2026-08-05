import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * STRUKTURELLER Test (C17): jeder Notification-TYP, den irgendein Layer
 * verschickt, braucht in der Glocke einen eigenen Text — und den in beiden
 * Sprachen.
 *
 * Warum strukturell und nicht ein Fall pro Typ: der Fehler, der das ausgelöst
 * hat, war kein falscher Text, sondern ein FEHLENDER. `notify()` verschickt seit
 * control-017 den Typ `invite.request`; `messageKey()` in der Glocke kannte ihn
 * nicht und fiel auf 'replied' zurück — die Betreiber-Glocke behauptete „hat auf
 * deinen Kommentar geantwortet". Der Rückfall ist gewollt (alt gespeicherte und
 * künftige Zeilen dürfen die Glocke nicht brechen), er macht das Loch aber
 * unsichtbar. Deshalb prüft dieser Test die MENGE der Absender gegen die Menge
 * der Lesetexte: ein neuer Typ ohne Text lässt hier eine Naht reißen, statt in
 * der Glocke einen falschen Satz zu erzeugen.
 */
const REPO = resolve(import.meta.dirname, '../../..')
const BELL = resolve(REPO, 'packages/core/app/components/NotificationBell.global.vue')
const LOCALES = ['de', 'en'] as const

/** Alle .ts-Dateien unter packages/ (server-Code der Layer). */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.nuxt' || entry === '.output' || entry === 'dist') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, acc)
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) acc.push(path)
  }
  return acc
}

/**
 * Die Typen der echten Absender: ein `notify(`-Aufruf und im selben
 * Argument-Objekt ein `type: '…'`. Absichtlich per Textsuche und nicht über
 * einen Katalog-Export — ein Katalog wäre eine zweite Wahrheit, die genauso
 * veralten kann wie der Lesetext.
 */
function notifiedTypes(): string[] {
  const types = new Set<string>()
  for (const file of sourceFiles(resolve(REPO, 'packages'))) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('notify(')) continue
    // Von jedem notify( bis zur schließenden Klammer des Aufrufs ist zu viel
    // Parser-Arbeit — es genügt das nächste `type: '…'` innerhalb der nächsten
    // 400 Zeichen (die Aufrufe sind alle kompakt).
    for (const match of source.matchAll(/notify\(/g)) {
      const window = source.slice(match.index, match.index + 400)
      const type = /\n\s*type:\s*'([^']+)'/.exec(window)?.[1]
      if (type) types.add(type)
    }
  }
  return [...types].sort()
}

const bellSource = readFileSync(BELL, 'utf8')

/** Der i18n-Key, den die Glocke für diesen Typ setzt (ohne Rückfall). */
function mappedKey(type: string): string | null {
  const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`type === '${escaped}'\\) return '([^']+)'`).exec(bellSource)?.[1] ?? null
}

function messages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(REPO, `packages/core/i18n/locales/${locale}.json`), 'utf8'))
}

function hasKey(messages: Record<string, unknown>, key: string): boolean {
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return false
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string'
}

describe('Glocken-Texte deckt jeden Absender (C17)', () => {
  const types = notifiedTypes()

  it('findet überhaupt Absender (sonst wäre der Test wertlos)', () => {
    // Der Fund-Mechanismus selbst wird geprüft: ginge die Textsuche ins Leere,
    // wäre die Suite grün, ohne etwas zu beweisen.
    expect(types.length).toBeGreaterThanOrEqual(5)
    expect(types).toContain('invite.request')
    expect(types).toContain('billing')
    // F1 Teilpaket 2: die Abzeichen-Verleihung benachrichtigt seit dem
    // 2026-08-04 — der neueste Absender und damit der nächste Kandidat für
    // genau das Loch, das dieser Test zumacht.
    expect(types).toContain('badge.awarded')
  })

  it.each(['reply', 'mention', 'post.mention', 'reminder', 'ticket', 'billing', 'siteInvite', 'invite.request', 'badge.awarded'])(
    "'%s' hat einen eigenen Lesetext in de UND en",
    (type) => {
      // 'reply' ist der Default-Zweig der Glocke ('notifications.replied') —
      // er darf als EINZIGER ohne eigene Abfrage auskommen.
      const key = type === 'reply' ? 'notifications.replied' : mappedKey(type)
      expect(key, `kein messageKey-Zweig für '${type}'`).toBeTruthy()
      for (const locale of LOCALES) {
        expect(hasKey(messages(locale), key!), `${locale}: ${key} fehlt`).toBe(true)
      }
    },
  )

  it('kein Absender-Typ läuft still in den Rückfall', () => {
    const withoutText = types.filter(type => type !== 'reply' && !mappedKey(type))
    expect(withoutText, `Typen ohne Lesetext: ${withoutText.join(', ')}`).toEqual([])
  })
})
