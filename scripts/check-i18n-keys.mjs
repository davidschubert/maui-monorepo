#!/usr/bin/env node
/**
 * WÄCHTER: NENNT DIE CONFIG EINEN i18n-SCHLÜSSEL, DEN DIE APP NICHT HAT?
 * (2026-08-06, Davids Auftrag)
 *
 *   pnpm check:i18n-keys
 *
 * WARUM ES IHN GIBT — zwei echte Vorfälle, beide live, beide unsichtbar für
 * jedes bestehende Tor:
 *
 *  1. 2026-08-01: rohe `home.features.*`-Schlüssel auf der /visual-Seite —
 *     in die visuellen Baselines eingebacken und damit sogar „bestätigt".
 *  2. 2026-08-02 bis 2026-08-06: `apps/comments` registrierte in `app.config`
 *     einen Rechtslink mit `labelKey: 'legal.imprint'`, die Übersetzung gab es
 *     in dieser App aber nicht (der Silo zieht den `pages`-Layer nicht, der sie
 *     gehabt hätte). Vier Tage lang stand im Fuß der Live-Seite wörtlich
 *     `legal.imprint` — am rechtlich wichtigsten Link des Hosts.
 *
 * vue-i18n gibt bei fehlender Übersetzung den SCHLÜSSEL zurück. Es gibt keinen
 * Fehler, keine Warnung, keinen roten Build: Typecheck, Lint und Unit-Tests
 * sehen davon nichts, weil ein `labelKey` für sie nur ein `string` ist. Genau
 * diese Lücke schließt dieses Skript — rein lesend, ohne Appwrite, ohne
 * Server, ohne Env.
 *
 * ── WAS GEPRÜFT WIRD ──────────────────────────────────────────────────────
 *
 * NUR CONFIG-DEKLARIERTE Schlüssel, keine beliebigen `t()`-Aufrufe. Das ist
 * eine bewusste Verengung, kein Versehen: ein `t()` im Markup steht neben
 * seinem Layer und wandert mit ihm; ein Schlüssel in `app.config.ts` dagegen
 * wird von einem FREMDEN Layer gerendert (das Fuß-Layout gehört blueprint, der
 * Text gehört der App) — dort reißt die Verbindung, und genau dort riss sie
 * zweimal. Dynamische Aufrufe wie t(`badges.${x}`) mit LAUFZEIT-Daten bleiben
 * bewusst draußen; sie ließen sich nur raten, und ein Wächter, der rät, wird
 * abgeschaltet.
 *
 * Die Feld-Liste (FIELDS, unten) ist nicht geraten, sondern zweifach belegt:
 * jedes Feld hat eine nachgewiesene `t(...)`-Aufrufstelle (in der Tabelle
 * notiert), und ein Gegen-Lauf über ALLE `pukalani.*`-Strings, die wie ein
 * i18n-Schlüssel aussehen, hat am 2026-08-06 exakt dieselbe Menge ergeben —
 * alles Übrige waren Capabilities, Hostnamen, Config-Pfade und Stripe-Keys.
 * NEUES FELD MIT SCHLÜSSEL ⇒ HIER EINTRAGEN, sonst ist es ungedeckt.
 *
 * DREI ABGELEITETE FORMEN sind mit drin, weil ihr Template-Literal an genau
 * EINER Aufrufstelle steht und rundherum KONSTANT ist (`billing.products.` +
 * Config-Wert). Der Schlüssel ist damit vollständig aus der Config bestimmt —
 * das ist kein Raten, sondern dieselbe Rechnung, die die Komponente macht.
 *
 * ── WIE DIE EFFEKTIVE SCHLÜSSELMENGE ENTSTEHT ─────────────────────────────
 *
 * Für jede App: die Vereinigung der Locale-Dateien der App UND aller Layer aus
 * ihrem `extends` (`i18n/locales/<code>.json`, verschachtelt → Pfade wie
 * `legal.imprint`). Die `extends`-Kette wird aus der `nuxt.config.ts` gelesen;
 * `pnpm check:manifests` hält sie bereits deckungsgleich mit dem Site-Manifest,
 * hier wird also die tatsächliche Kette benutzt statt einer zweiten Wahrheit.
 *
 * Die effektive `app.config` entsteht genauso: App ÜBER Layern in
 * extends-Reihenfolge, mit defu-Semantik (Objekte tief gemergt, Arrays
 * KONKATENIERT, erster Wert gewinnt). Arrays konkatenieren ist kein Detail,
 * sondern das Laufzeitverhalten: `pukalani.admin.modules` sammelt so die
 * Einträge aller Layer ein. Bei den Objekt-Maps (`chrome.nav`) gewinnt der
 * frühere Layer, und der Wert `false` schaltet einen Eintrag ab — ein
 * abgeschalteter Eintrag wird nie gerendert und braucht deshalb kein Label.
 *
 * Beide Sprachen zählen: ein Schlüssel, den nur `de` oder nur `en` hat, ist ein
 * Befund. Genau so sah der Impressum-Fall aus, nur eben in beiden.
 *
 * Ausgabe: eine Zeile je Befund (App · Feld · Schlüssel · fehlende Sprachen),
 * Exit 1 bei Befund, sonst Exit 0.
 *
 * ── WAS ER NICHT FÄNGT, UND WARUM DAS SO BLEIBT ───────────────────────────
 *
 * Vorfall 1 (die rohen `home.features.*` im Baseline-Bild) fällt NICHT in
 * diese Klasse und wird hier auch nicht gefangen: er entstand in
 * `app/pages/visual.vue` an t(`home.products.${key}.text`) und an zwei festen
 * t()-Aufrufen im Markup — keine Zeile davon steht in einer `app.config`.
 * Nachgemessen am 2026-08-06: die benachbarte Klasse „statisches t('…')-
 * Literal in .vue/.ts, das die App nicht kennt" hätte HEUTE null Befunde
 * (der einzige Treffer eines rohen Greps stand in einem Kommentar). Sie wäre
 * ein EIGENER Wächter mit eigener Textanalyse — nicht ein Feld mehr in der
 * Tabelle unten. Diese Trennung ist Absicht: dieser hier prüft, was die
 * Config VERSPRICHT, und das kann er falsch-positiv-frei.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCALES = ['de', 'en']

/**
 * `defineAppConfig` ist ein Nuxt-Auto-Import und existiert hier nicht — als
 * Identität nachgereicht, damit die Dateien unverändert importierbar sind.
 * Das ist der Grund, warum dieses Skript die echten Werte sieht (inkl.
 * `as const`, Spreads, Kommentaren) statt sie aus dem Quelltext zu raten.
 */
globalThis.defineAppConfig = config => config

// ── Feld-Liste: wo in `app.config` stehen i18n-Schlüssel? ─────────────────
// `pfad`   — Anzeige-Name in der Ausgabe (so steht es in der Config)
// `quelle` — die t()-Aufrufstelle, die diesen Schlüssel rendert (Beleg!)
// `keys`   — liefert die deklarierten Schlüssel aus der EFFEKTIVEN Config
const str = v => (typeof v === 'string' && v.length > 0 ? [v] : [])
const arr = v => (Array.isArray(v) ? v : [])

const FIELDS = [
  {
    pfad: 'pukalani.legalLinks[].labelKey',
    quelle: 'packages/blueprint/app/layouts/default.vue · packages/core/app/layouts/default.vue',
    keys: p => arr(p.legalLinks).flatMap(l => str(l?.labelKey)),
  },
  {
    pfad: 'pukalani.chrome.nav.<id>.labelKey',
    quelle: 'packages/blueprint/app/layouts/default.vue',
    // `false` = Eintrag von App/Layer abgeschaltet → wird nie gerendert
    keys: p => Object.values(p.chrome?.nav ?? {}).flatMap(e => (e ? str(e.labelKey) : [])),
  },
  {
    pfad: 'pukalani.admin.modules[].labelKey',
    quelle: 'packages/admin/app/layouts/dashboard.vue · packages/admin/app/components/DashboardUserMenu.vue',
    keys: p => arr(p.admin?.modules).flatMap(m => str(m?.labelKey)),
  },
  {
    pfad: 'pukalani.admin.modules[].children[].labelKey',
    quelle: 'packages/admin/app/layouts/dashboard.vue',
    keys: p => arr(p.admin?.modules).flatMap(m => arr(m?.children).flatMap(c => str(c?.labelKey))),
  },
  {
    // ABGELEITET: `t(\`admin.nav.groups.${group}\`)` — konstantes Präfix,
    // Gruppen-Name kommt aus der Config (Typ-Union in shared/types/admin-module.ts)
    pfad: 'pukalani.admin.modules[].group → admin.nav.groups.<group>',
    quelle: 'packages/admin/app/layouts/dashboard.vue',
    keys: p => arr(p.admin?.modules).flatMap(m => str(m?.group).map(g => `admin.nav.groups.${g}`)),
  },
  {
    pfad: 'pukalani.admin.settingsTabs[].labelKey',
    quelle: 'packages/admin/app/pages/dashboard/settings.vue',
    keys: p => arr(p.admin?.settingsTabs).flatMap(t => str(t?.labelKey)),
  },
  {
    pfad: 'pukalani.billing.plans[].labelKey',
    quelle: 'packages/billing/app/components/BillingPricingTable.vue · BillingCompareTable.vue · pages/dashboard/billing.vue',
    keys: p => arr(p.billing?.plans).flatMap(pl => str(pl?.labelKey)),
  },
  {
    // ABGELEITET: `t(\`${plan.labelKey}Description\`)` — konstantes Suffix
    pfad: 'pukalani.billing.plans[].labelKey + "Description"',
    quelle: 'packages/billing/app/components/BillingPricingTable.vue',
    keys: p => arr(p.billing?.plans).flatMap(pl => str(pl?.labelKey).map(k => `${k}Description`)),
  },
  {
    // ABGELEITET: `t(\`billing.products.${product}\`)` über
    // `plan.highlights ?? plan.products` — exakt die Rechnung der Komponente
    pfad: 'pukalani.billing.plans[].highlights/products → billing.products.<key>',
    quelle: 'packages/billing/app/components/BillingPricingTable.vue',
    keys: p => arr(p.billing?.plans).flatMap((pl) => {
      const list = pl?.highlights ?? pl?.products
      return arr(list).flatMap(x => str(x).map(k => `billing.products.${k}`))
    }),
  },
  {
    pfad: 'pukalani.billing.compare.sections[].labelKey',
    quelle: 'packages/billing/app/components/BillingCompareTable.vue',
    keys: p => arr(p.billing?.compare?.sections).flatMap(s => str(s?.labelKey)),
  },
  {
    pfad: 'pukalani.billing.compare.sections[].rows[].labelKey',
    quelle: 'packages/billing/app/components/BillingCompareTable.vue',
    keys: p => arr(p.billing?.compare?.sections).flatMap(s => arr(s?.rows).flatMap(r => str(r?.labelKey))),
  },
  {
    // Zellwert: true/false = Haken/leer, STRING = i18n-Key für einen Textzustand
    // (shared/types/billing.ts: BillingCompareValue)
    pfad: 'pukalani.billing.compare.sections[].rows[].plans.<planId> (String-Zustand)',
    quelle: 'packages/billing/app/components/BillingCompareTable.vue',
    keys: p => arr(p.billing?.compare?.sections)
      .flatMap(s => arr(s?.rows).flatMap(r => Object.values(r?.plans ?? {}).flatMap(v => str(v)))),
  },
]

// ── defu-Semantik: Objekte tief, Arrays konkateniert, erster Wert gewinnt ──
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v)

function defu(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) return [...target, ...source]
  if (!isPlain(target) || !isPlain(source)) return target === undefined ? source : target
  const out = { ...target }
  for (const [k, v] of Object.entries(source)) {
    out[k] = k in out ? defu(out[k], v) : v
  }
  return out
}

// ── Locale-Dateien: verschachteltes JSON → flache Schlüssel-Pfade ─────────
function flatten(node, prefix, into) {
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (isPlain(v)) flatten(v, path, into)
    else into.add(path)
  }
  return into
}

function localeKeys(dir, locale) {
  const file = join(dir, 'i18n', 'locales', `${locale}.json`)
  if (!existsSync(file)) return new Set()
  return flatten(JSON.parse(readFileSync(file, 'utf8')), '', new Set())
}

// ── App-Zusammenstellung: eigenes Verzeichnis + extends-Kette ─────────────
/** Die in `extends` gelisteten Layer-Verzeichnisse, absolut, in Reihenfolge. */
function extendsChain(appDir) {
  const src = readFileSync(join(appDir, 'nuxt.config.ts'), 'utf8')
  const match = src.match(/extends:\s*\[([^\]]+)\]/)
  if (!match) return null
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => resolve(appDir, m[1]))
}

function appConfigOf(dir) {
  const file = join(dir, 'app', 'app.config.ts')
  if (!existsSync(file)) return null
  return import(pathToFileURL(file).href).then(m => m.default ?? {})
}

const apps = readdirSync(join(ROOT, 'apps'), { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.'))
  .map(e => ({ name: e.name, dir: join(ROOT, 'apps', e.name) }))

// Der Core-Playground ist keine App unter apps/, aber eine echte laufende
// Komposition (Port 3000) mit eigener app.config — er wird mitgeprüft, damit
// ein dort eingetragener labelKey nicht durchs Netz fällt.
const playground = join(ROOT, 'packages/core/.playground')
if (existsSync(join(playground, 'nuxt.config.ts'))) {
  apps.push({ name: 'core/.playground', dir: playground })
}

// ── Prüfung ───────────────────────────────────────────────────────────────
const findings = []
const errors = []
let checkedKeys = 0

for (const app of apps) {
  const chain = extendsChain(app.dir)
  if (!chain) {
    errors.push(`${relative(ROOT, app.dir)}/nuxt.config.ts: extends-Array nicht gefunden — Schlüsselmenge nicht bestimmbar`)
    continue
  }

  // Effektive app.config: App zuerst (höchste Priorität), dann die Layer
  let effective = {}
  for (const dir of [app.dir, ...chain]) {
    let config
    try {
      config = await appConfigOf(dir)
    }
    catch (e) {
      errors.push(`${relative(ROOT, dir)}/app/app.config.ts: nicht ladbar — ${e.message}`)
      continue
    }
    if (config) effective = defu(effective, config)
  }

  // Effektive Schlüsselmenge: App + alle Layer, je Sprache
  const known = {}
  for (const locale of LOCALES) {
    known[locale] = new Set()
    for (const dir of [app.dir, ...chain]) {
      for (const key of localeKeys(dir, locale)) known[locale].add(key)
    }
  }

  const pukalani = effective.pukalani ?? {}
  for (const field of FIELDS) {
    for (const key of new Set(field.keys(pukalani))) {
      checkedKeys++
      const missing = LOCALES.filter(l => !known[l].has(key))
      if (missing.length) findings.push({ app: app.name, feld: field.pfad, quelle: field.quelle, key, missing })
    }
  }
}

// ── Ergebnis ──────────────────────────────────────────────────────────────
if (errors.length) {
  console.error(`✗ i18n-Schlüssel-Check: ${errors.length} Problem(e) beim Einlesen\n`)
  for (const e of errors) console.error(`  ✗ ${e}`)
}

if (findings.length) {
  console.error(`\n✗ i18n-Schlüssel-Check: ${findings.length} Befund(e) — die Config nennt Schlüssel, die es in der App nicht gibt\n`)
  console.error('  (vue-i18n rendert dann den SCHLÜSSEL — genau so stand vier Tage lang „legal.imprint" im Fuß von comments.pukalani.app)\n')
  for (const f of findings) {
    console.error(`  ✗ App „${f.app}" · ${f.feld}`)
    console.error(`      Schlüssel „${f.key}" fehlt in: ${f.missing.join(', ')}`)
    console.error(`      gerendert von: ${f.quelle}`)
  }
  console.error('')
}

if (errors.length || findings.length) process.exit(1)

// Gezählt werden NENNUNGEN (App × Schlüssel), nicht verschiedene Schlüssel:
// derselbe `legal.imprint` ist in drei Apps drei Versprechen an drei Hosts.
console.log(`✔ i18n-Schlüssel-Check: ${checkedKeys} Config-Nennungen (App × Schlüssel) in ${apps.length} Apps, ${FIELDS.length} Felder, de+en — alle Übersetzungen vorhanden`)
