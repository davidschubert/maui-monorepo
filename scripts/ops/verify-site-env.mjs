#!/usr/bin/env node
/**
 * Env-Wächter: prüft für JEDE Site auf dem Server, ob die Variablen gesetzt
 * sind, ohne die sie eine Aufgabe still nicht erfüllt.
 *
 *   node scripts/ops/verify-site-env.mjs                 # alle Sites
 *   node scripts/ops/verify-site-env.mjs platform        # eine Site
 *
 * WARUM ES DAS GIBT (F44, 2026-08-02): `platform.pukalani.app` hatte KEIN
 * `NUXT_SMTP_*`. Damit ging für JEDE Kunden-Community nie eine
 * Benachrichtigungs-Mail raus — Antworten, Erwähnungen, Digest, die
 * Zahlungswarnung des Owners. Niemandem fiel es auf, weil ein fehlender
 * Mailer sich exakt wie ein bewusst abgeschaltetes Produkt verhält: die App
 * läuft, die Seite antwortet, nur die Mail bleibt aus. Gefunden wurde es
 * zufällig beim Beweis für einen ANDEREN Punkt.
 *
 * Das ist dieselbe Sorte Loch wie beim TLS-Wächter nebenan: die Konfiguration
 * ist falsch, aber nichts wird rot. Deshalb dieselbe Antwort — nachsehen, was
 * WIRKLICH auf dem Server steht, statt zu glauben, was in einer Vorlage steht.
 *
 * WERTE VERLASSEN DEN SERVER NIE. Über ssh läuft nur ein `grep -oE` auf die
 * SCHLÜSSELNAMEN; ein Passwort steht damit weder im Terminal noch in einem
 * CI-Log. Deshalb kann dieses Skript auch nur „fehlt ganz" erkennen und nicht
 * „steht drin, ist aber falsch" — für Letzteres ist die Probe im jeweiligen
 * Runbook zuständig.
 *
 * Exit 0 = alles da · Exit 1 = mindestens eine Pflicht-Variable fehlt.
 */
import { execFileSync } from 'node:child_process'

const SERVER = process.env.PUKALANI_OPS_SSH || 'ploi@49.13.211.173'

/**
 * Pflicht = „ohne das erfüllt die Site eine Aufgabe still nicht".
 *
 * BEWUSST eine gepflegte Liste und nicht die Schlüssel aus `.env.example`:
 * die Vorlage führt auch Optionales (`NUXT_ENTITLEMENTS_URL`), und ein
 * Wächter, der Optionales anmahnt, wird weggelesen — dann übersieht man den
 * echten Fund. Neue Pflicht-Variable ⇒ hier eintragen.
 */
const SITES = [
  {
    dir: 'platform.pukalani.app',
    name: 'platform',
    note: 'Pool-App — alle Kunden-Communities',
    required: [
      'NUXT_APPWRITE_KEY',
      'NUXT_PUBLIC_APPWRITE_ENDPOINT',
      'NUXT_PUBLIC_APPWRITE_PROJECT_ID',
      'NUXT_PLATFORM_CONTROL_KEY',
      'NUXT_ONBOARDING_SERVICE_SECRET',
      // F44: ohne diese fünf verschickt der Pool NICHTS.
      'NUXT_SMTP_HOST',
      'NUXT_SMTP_PORT',
      'NUXT_SMTP_USER',
      'NUXT_SMTP_PASS',
      'NUXT_SMTP_FROM',
      // Link-Basis für Mails ohne Community-Bezug (D5-Rückfall).
      'NUXT_PUBLIC_APP_URL',
    ],
  },
  {
    dir: 'control.pukalani.app',
    name: 'control',
    note: 'Betreiber-Oberfläche — Stripe-Webhook, Einladungen, Missbrauchsmeldungen',
    required: [
      'NUXT_APPWRITE_KEY',
      'NUXT_PUBLIC_APPWRITE_ENDPOINT',
      'NUXT_PUBLIC_APPWRITE_PROJECT_ID',
      'NUXT_CONTROL_ONBOARDING_SECRET',
      'NUXT_SMTP_HOST',
      'NUXT_SMTP_PORT',
      'NUXT_SMTP_USER',
      'NUXT_SMTP_PASS',
      'NUXT_SMTP_FROM',
      'NUXT_PUBLIC_APP_URL',
    ],
  },
  {
    dir: 'comments.pukalani.app',
    name: 'comments',
    note: 'Silo-Kunde',
    required: [
      'NUXT_APPWRITE_KEY',
      'NUXT_PUBLIC_APPWRITE_ENDPOINT',
      'NUXT_PUBLIC_APPWRITE_PROJECT_ID',
      'NUXT_SMTP_HOST',
      'NUXT_SMTP_PORT',
      'NUXT_SMTP_USER',
      'NUXT_SMTP_PASS',
      'NUXT_SMTP_FROM',
      'NUXT_PUBLIC_APP_URL',
    ],
  },
  {
    dir: 'portfolio.pukalani.app',
    name: 'portfolio',
    note: 'Silo-Kunde — verschickt bewusst keine Mails (kein SMTP nötig)',
    required: [
      'NUXT_APPWRITE_KEY',
      'NUXT_PUBLIC_APPWRITE_ENDPOINT',
      'NUXT_PUBLIC_APPWRITE_PROJECT_ID',
    ],
  },
  {
    dir: 'help.pukalani.app',
    name: 'help',
    note: 'Hilfe-Seiten — reine Inhalte, kein Appwrite, keine Mails',
    required: [],
  },
  {
    dir: 'pukalani.app',
    name: 'marketing',
    note: 'Landing — reine Inhalte, kein Appwrite, keine Mails',
    required: [],
  },
]

/** Liest NUR die Schlüsselnamen einer Server-.env. Werte bleiben dort. */
function readKeyNames(dir) {
  const out = execFileSync('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    SERVER,
    `test -f /home/ploi/${dir}/.env && grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' /home/ploi/${dir}/.env | tr -d '=' || echo __NO_ENV_FILE__`,
  ], { encoding: 'utf8' })
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.includes('__NO_ENV_FILE__')) return null
  return new Set(lines)
}

const only = process.argv[2]
const sites = only ? SITES.filter(s => s.name === only || s.dir === only) : SITES
if (sites.length === 0) {
  console.error(`Keine Site namens "${only}". Bekannt: ${SITES.map(s => s.name).join(', ')}`)
  process.exit(2)
}

let broken = 0
for (const site of sites) {
  let present
  try {
    present = readKeyNames(site.dir)
  }
  catch (error) {
    console.log(`✖ ${site.name.padEnd(10)} ssh/Lesen fehlgeschlagen — ${(error && error.message) || error}`)
    broken++
    continue
  }
  if (present === null) {
    // Keine Datei ist nur dann ein Fehler, wenn die Site etwas braucht.
    if (site.required.length === 0) {
      console.log(`✔ ${site.name.padEnd(10)} keine .env nötig (${site.note})`)
      continue
    }
    console.log(`✖ ${site.name.padEnd(10)} KEINE .env vorhanden, ${site.required.length} Pflicht-Variablen erwartet`)
    broken++
    continue
  }
  const missing = site.required.filter(key => !present.has(key))
  if (missing.length === 0) {
    console.log(`✔ ${site.name.padEnd(10)} ${site.required.length} Pflicht-Variablen gesetzt (${site.note})`)
    continue
  }
  console.log(`✖ ${site.name.padEnd(10)} FEHLT: ${missing.join(', ')}`)
  console.log(`  ${' '.repeat(10)} ${site.note}`)
  broken++
}

if (broken > 0) {
  console.log(`\n${broken} Site(s) unvollständig. Was die Variablen bedeuten, steht in der jeweiligen apps/<app>/.env.example.`)
  process.exit(1)
}
console.log('\nAlle Sites vollständig konfiguriert.')
