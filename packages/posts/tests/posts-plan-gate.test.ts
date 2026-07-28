import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { planAllowsProduct } from '../../core/server/utils/tenantPlanProducts'

/**
 * S10a — nach einem Downgrade muss der Posting-Feed GANZ zu sein.
 *
 * `requirePlanProduct(event, 'posts')` stand nur an drei der neun
 * posts-Routen (index.get, index.post, [id]/score, [id]/vote). Anlegen war
 * damit gesperrt, Bearbeiten, Löschen, die geplanten Posts und die ganze
 * Moderations-Sicht blieben nach einem Downgrade unter `personal` offen.
 * Ein halb geschlossenes Produkt ist kein geschlossenes Produkt.
 *
 * Zwei Ebenen:
 *  1. die ENTSCHEIDUNG (pure): `basic` darf posts nicht, `personal`/`pro` schon.
 *  2. die VOLLSTÄNDIGKEIT (strukturell): JEDE Route unter server/api/posts
 *     trägt den Gate. Eine neue Route ohne ihn bricht diesen Test — das ist
 *     der eigentliche Zweck, denn genau so ist der Befund entstanden.
 */

// Plan-Ordnung und Katalog wie in apps/platform/app/app.config.ts.
const PLAN_ORDER = ['basic', 'personal', 'pro'] as const
const PRODUCTS = { posts: 'personal', ai: 'pro', events: 'pro', courses: 'pro' }

const allows = (plan: string, product: string) =>
  planAllowsProduct(PLAN_ORDER, PRODUCTS, plan, product)

describe('Plan-Entscheidung für das Produkt „posts"', () => {
  it('sperrt basic — auch NACH einem Downgrade, nicht nur beim Anlegen', () => {
    expect(allows('basic', 'posts')).toBe(false)
  })

  it('lässt personal und pro durch', () => {
    expect(allows('personal', 'posts')).toBe(true)
    expect(allows('pro', 'posts')).toBe(true)
  })

  it('behandelt einen unbekannten/fehlenden Plan wie den untersten Rang', () => {
    expect(allows('', 'posts')).toBe(false)
    expect(allows('gibtsnicht', 'posts')).toBe(false)
  })
})

// --- Vollständigkeit: alle Routen unter server/api/posts ----------------------

const apiDir = fileURLToPath(new URL('../server/api/posts', import.meta.url))

function routeFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routeFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)
    return entry.name.endsWith('.ts') ? [`${prefix}${entry.name}`] : []
  })
}

const source = (file: string) => readFileSync(`${apiDir}/${file}`, 'utf8')

describe('Jede posts-Route trägt den Produkt-Gate', () => {
  const files = routeFiles(apiDir)

  it('findet überhaupt Routen (sonst prüft der Test nichts)', () => {
    expect(files.length).toBeGreaterThanOrEqual(9)
  })

  it.each(files)('%s ruft requirePlanProduct(event, \'posts\')', (file) => {
    expect(source(file)).toContain('requirePlanProduct(event, \'posts\')')
  })
})
