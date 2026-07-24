/**
 * Theme-Katalog-Generator (Vollausbau-Plan Schritt 3): theme.catalog.ts →
 * public/themes/<id>.css + app/utils/themeRegistry.gen.ts. Reine I/O-Hülle —
 * die Logik (Ramps, Kontrast-Gate, CSS-Format) lebt testbar in
 * shared/themeGen.ts. Deterministisch: gleicher Spec = byte-gleicher Output.
 *
 *   pnpm --filter @maui/themes generate            # Vorschau nach .generated/
 *   pnpm --filter @maui/themes generate -- --write # nach public/themes/ + app/utils/
 *   pnpm --filter @maui/themes check:themes        # CI: Output aktuell? (E6a)
 *
 * --check vergleicht den frisch generierten Output byte-genau mit den
 * committeten Dateien — Katalog-Änderung ohne Regeneration bricht CI/lint,
 * statt still zu divergieren.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateTheme, buildRegistryModule, type GeneratedTheme } from '../shared/themeGen'
import { THEME_CATALOG } from '../theme.catalog'

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const write = process.argv.includes('--write')
const check = process.argv.includes('--check')
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

/** --check: erwarteten Inhalt gegen die committete Datei halten (byte-genau) */
let drift = 0
function checkFile(path: string, expected: string, label: string) {
  if (!existsSync(path) || readFileSync(path, 'utf8') !== expected) {
    console.error(`✗ ${label} ist nicht aktuell — \`pnpm --filter @maui/themes generate -- --write\` ausführen und committen.`)
    drift++
  }
}

if (!check) mkdirSync(outDir, { recursive: true })
const generated: GeneratedTheme[] = []
for (const spec of THEME_CATALOG) {
  try {
    const theme = generateTheme(spec)
    generated.push(theme)
    if (check) {
      checkFile(resolve(PKG_DIR, 'public/themes', `${spec.id}.css`), theme.css, `public/themes/${spec.id}.css`)
      continue
    }
    writeFileSync(resolve(outDir, `${spec.id}.css`), theme.css)
    const note = theme.adjustments.length ? ` (Kontrast-Gate: ${theme.adjustments.join(', ')})` : ''
    console.log(`✔ ${spec.id}.css — ${1 + spec.variants.length} Ramps${note}`)
  }
  catch (error) {
    console.error(`✗ ${(error as Error).message}`)
    process.exit(1)
  }
}

const registryModule = buildRegistryModule(generated, THEME_CATALOG)
if (check) {
  checkFile(resolve(PKG_DIR, 'app/utils/themeRegistry.gen.ts'), registryModule, 'app/utils/themeRegistry.gen.ts')
  if (drift > 0) process.exit(1)
  console.log(`✔ Generator-Output aktuell (${generated.length} Themes, Registry byte-gleich)`)
}
else {
  writeFileSync(registryOut, registryModule)
  console.log(`✔ themeRegistry.gen.ts (${generated.length} Themes) → ${registryOut}`)
  console.log(write ? '\n⚠️  --write: public/themes wurde überschrieben — visuell abnehmen!' : '\nVorschau unter .generated/ — Abnahme, dann mit --write übernehmen.')
}
