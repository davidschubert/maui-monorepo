/**
 * Theme-Katalog-Generator (Vollausbau-Plan Schritt 3): theme.catalog.ts →
 * public/themes/<id>.css + app/utils/themeRegistry.gen.ts. Reine I/O-Hülle —
 * die Logik (Ramps, Kontrast-Gate, CSS-Format) lebt testbar in
 * shared/themeGen.ts. Deterministisch: gleicher Spec = byte-gleicher Output.
 *
 *   pnpm --filter @maui/themes generate            # Vorschau nach .generated/
 *   pnpm --filter @maui/themes generate -- --write # nach public/themes/ + app/utils/
 *
 * Solange der Katalog PLATZHALTER ist (E1–E7 offen), bleibt --write bewusst
 * ungenutzt — die kuratierten Bestands-CSS werden nicht überschrieben, bis
 * David die Regeneration visuell abgenommen hat (Plan Schritt 3, Abnahme).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateTheme, buildRegistryModule, type GeneratedTheme } from '../shared/themeGen'
import { THEME_CATALOG } from '../theme.catalog'

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const write = process.argv.includes('--write')
const outDir = write ? resolve(PKG_DIR, 'public/themes') : resolve(PKG_DIR, '.generated/themes')
const registryOut = write
  ? resolve(PKG_DIR, 'app/utils/themeRegistry.gen.ts')
  : resolve(PKG_DIR, '.generated/themeRegistry.gen.ts')

const ids = new Set<string>()
for (const spec of THEME_CATALOG) {
  if (ids.has(spec.id)) {
    console.error(`✗ Doppelte Theme-Id '${spec.id}' im Katalog`)
    process.exit(1)
  }
  ids.add(spec.id)
}

mkdirSync(outDir, { recursive: true })
const generated: GeneratedTheme[] = []
for (const spec of THEME_CATALOG) {
  try {
    const theme = generateTheme(spec)
    writeFileSync(resolve(outDir, `${spec.id}.css`), theme.css)
    generated.push(theme)
    const note = theme.adjustments.length ? ` (Kontrast-Gate: ${theme.adjustments.join(', ')})` : ''
    console.log(`✔ ${spec.id}.css — ${1 + spec.variants.length} Ramps${note}`)
  }
  catch (error) {
    console.error(`✗ ${(error as Error).message}`)
    process.exit(1)
  }
}

writeFileSync(registryOut, buildRegistryModule(generated, THEME_CATALOG))
console.log(`✔ themeRegistry.gen.ts (${generated.length} Themes) → ${registryOut}`)
console.log(write ? '\n⚠️  --write: public/themes wurde überschrieben — visuell abnehmen!' : '\nVorschau unter .generated/ — Abnahme, dann mit --write übernehmen.')
