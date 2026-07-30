/**
 * OG-Bild-Generator (1200×630) — ein eigenes Social-Bild pro Seite und Sprache.
 *
 * Warum so und nicht mit einem Modul:
 *  - Die Bilder werden EINMAL erzeugt und COMMITTET. Prod braucht dadurch keinen
 *    Renderer, kein Modul, keine Laufzeit-Kosten — nur statische Dateien.
 *  - Gerendert wird mit dem bereits vorhandenen Playwright + dem SYSTEM-Chrome
 *    (channel: 'chrome'): keine neue Abhängigkeit, kein Browser-Download.
 *  - Die Titel kommen DIREKT aus den i18n-Dateien. Kein zweiter Ort, an dem
 *    Copy gepflegt werden müsste (und veralten könnte).
 *
 * Aufruf:  pnpm --filter marketing og:images
 * Danach:  public/og/*.jpg committen.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const OUT_DIR = resolve(APP, 'public/og')

const locales = ['de', 'en']
const messages = Object.fromEntries(
  locales.map(loc => [loc, JSON.parse(readFileSync(resolve(APP, `i18n/locales/${loc}.json`), 'utf8')).marketing]),
)

/** Pfad in der i18n-Struktur auflösen ('gdpr.title'). */
function pick(loc, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), messages[loc])
}

/**
 * Welche Bilder entstehen. `title` ist der i18n-Pfad der Überschrift, `sub` der
 * Unterzeile. Die Dateinamen spiegeln die Route (og/<name>-<locale>.png).
 */
const CARDS = [
  { name: 'home', title: 'hero.title', sub: 'hero.eyebrow' },
  { name: 'gdpr', title: 'gdpr.title', sub: 'gdpr.kicker' },
  { name: 'switch', title: 'switch.title', sub: 'switch.kicker' },
  { name: 'faq', title: 'faq.title', sub: 'faq.kicker' },
  { name: 'glossary', title: 'glossary.title', sub: 'glossary.kicker' },
  ...['circle', 'skool', 'mighty-networks'].map(slug => ({
    name: `vs-${slug}`, title: `vs.items.${slug}.title`, sub: `vs.items.${slug}.sub`,
  })),
  ...['coaches', 'kurse', 'creator', 'vereine'].map(slug => ({
    name: `use-cases-${slug}`, title: `audiencePages.items.${slug}.title`, sub: `audiencePages.items.${slug}.name`,
  })),
  ...['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events'].map(slug => ({
    name: `products-${slug}`, title: `features.items.${slug}.title`, sub: `features.items.${slug}.name`,
  })),
]

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Die Karte als eigenständiges HTML — Marken-Look wie die Site (puka + Licht). */
function cardHtml({ title, sub }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(150deg, hsl(220 16% 95%) 0%, hsl(35 90% 93%) 62%, hsl(38 96% 84%) 100%);
    color: hsl(220 40% 13%);
    position: relative; overflow: hidden;
    padding: 72px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  /* die puka: Sonne, die durch die Wolken bricht */
  .glow {
    position: absolute; top: -320px; right: -220px; width: 900px; height: 900px;
    border-radius: 50%;
    background: radial-gradient(circle at center,
      hsl(38 96% 60% / 0.95) 0%, hsl(38 96% 60% / 0.45) 32%,
      hsl(35 90% 88% / 0.25) 55%, transparent 72%);
  }
  .brand { position: relative; display: flex; align-items: center; gap: 16px; }
  .brand svg { width: 44px; height: 44px; }
  .brand span { font-size: 34px; font-weight: 800; letter-spacing: -0.5px; }
  .body { position: relative; max-width: 900px; }
  .sub {
    font-size: 24px; font-weight: 700; letter-spacing: 2.5px;
    text-transform: uppercase; color: hsl(26 90% 42%); margin-bottom: 22px;
  }
  h1 { font-size: 76px; line-height: 1.04; font-weight: 850; letter-spacing: -2.5px; }
  .foot {
    position: relative; display: flex; align-items: center; gap: 14px;
    font-size: 22px; font-weight: 600; color: hsl(220 18% 32%);
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: hsl(26 90% 48%); }
</style></head>
<body>
  <div class="glow"></div>
  <div class="brand">
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="s" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="hsl(40 98% 66%)"/><stop offset="70%" stop-color="hsl(32 94% 54%)"/>
        <stop offset="100%" stop-color="hsl(26 90% 48%)"/></radialGradient></defs>
      <circle cx="16" cy="16" r="14" stroke="hsl(220 40% 13%)" stroke-opacity="0.28" stroke-width="2" fill="none"/>
      <circle cx="16" cy="16" r="7.5" fill="url(#s)"/>
      <g stroke="url(#s)" stroke-width="2" stroke-linecap="round">
        <line x1="16" y1="1.5" x2="16" y2="5"/><line x1="16" y1="27" x2="16" y2="30.5"/>
        <line x1="1.5" y1="16" x2="5" y2="16"/><line x1="27" y1="16" x2="30.5" y2="16"/>
      </g>
    </svg>
    <span>Pukalani</span>
  </div>
  <div class="body">
    <p class="sub">${escapeHtml(sub)}</p>
    <h1>${escapeHtml(title)}</h1>
  </div>
  <div class="foot"><span class="dot"></span><span>pukalani.app</span></div>
</body></html>`
}

mkdirSync(OUT_DIR, { recursive: true })

// System-Chrome statt Playwright-Download: channel 'chrome'.
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })

let count = 0
for (const card of CARDS) {
  for (const loc of locales) {
    const title = pick(loc, card.title)
    const sub = pick(loc, card.sub)
    if (!title || !sub) {
      console.warn(`⚠️  ${card.name}-${loc}: i18n-Pfad leer (${card.title} / ${card.sub}) — übersprungen`)
      continue
    }
    const file = resolve(OUT_DIR, `${card.name}-${loc}.jpg`)
    await page.setContent(cardHtml({ title, sub }), { waitUntil: 'load' })
    // JPEG statt PNG: der weiche Farbverlauf komprimiert als PNG miserabel
    // (~270 KB/Bild), als JPEG bei q90 sichtbar identisch und ~6x kleiner.
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90 })
    writeFileSync(file, buffer)
    count++
  }
}

await browser.close()
console.log(`✔ ${count} OG-Bilder in public/og/ erzeugt`)
