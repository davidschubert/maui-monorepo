/**
 * C19: @nuxtjs/i18n 10.6.0 schickt für die INDEX-Route einen 302 mit LEEREM
 * Location-Header — der Browser lädt dieselbe URL erneut und läuft endlos.
 *
 * URSACHE (kein Konfigurationsfehler, ein Modul-Bug):
 * `@nuxtjs/i18n/dist/runtime/server/plugin.js:110-114` baut das Redirect-Ziel als
 *   joinURL(<domainBase ''>, <app.baseURL '/'>, resolved.path + url.search)
 * Der Pfad-Teil ist für die Index-Route bereits korrekt '/' — aber ufos joinURL
 * kollabiert eine Verkettung aus lauter Schrägstrichen zu '':
 *   joinURL('', '/', '/')     === ''       ← /de  (EN-Browser) → Endlosschleife
 *   joinURL('', '/', '/faq')  === '/faq'   ← /de/faq           → korrekt
 *   joinURL('', '/', '/?x=1') === '/?x=1'  ← /de?x=1           → korrekt
 * Genau EIN Fall ist betroffen: Ziel = Wurzel UND keine Query. Das Modul
 * normalisiert an drei anderen Stellen zurück auf '/' (plugin.js:92,
 * redirect.js:17, routing/context.js:85) — hier fehlt es. 10.6.0 ist die
 * neueste Veröffentlichung (npm dist-tag `latest`, Stand 2026-07-30), es gibt
 * also keinen Upstream-Patch zum Nachziehen.
 *
 * WARUM HIER UND NICHT IN DER i18n-KONFIGURATION:
 * Die dokumentierten Entscheidungen in packages/core/nuxt.config.ts (KEIN
 * fallbackLocale wegen der Crawler, redirectOn: 'all', Cookie-Logik) bleiben so
 * unangetastet — dieser Handler kennt keine Sprachen, er repariert nur einen
 * kaputten Header. Die naheliegende Alternative
 * `i18n.experimental.nitroContextDetection: false` (schaltet die ganze
 * Nitro-Erkennung ab und verlagert den Redirect in den Render-Pfad) wurde
 * verworfen: sie tauscht einen billigen Header-Redirect gegen ein volles SSR
 * und ändert die Sprach-ERKENNUNG mit, statt den Bug zu beheben.
 *
 * `render:response` ist der richtige Haken: Nitro ruft ihn NACH `render:before`
 * (dort setzt i18n die Antwort) und VOR `setResponseHeaders` — die Reihenfolge
 * der Nitro-Plugins untereinander spielt damit keine Rolle.
 *
 * Die Regel ist bewusst allgemein statt i18n-spezifisch: ein 3xx mit leerem
 * Location ist NIE gültig. Fällt der Bug upstream weg, wird dieser Handler
 * still wirkungslos (kein Verhalten, das man zurückbauen müsste).
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    const status = response.statusCode ?? 0
    if (status < 300 || status > 399) return
    if (!response.headers || response.headers.location !== '') return

    // Leeres Ziel heißt „App-Wurzel". Eine Query kann es hier nicht geben —
    // mit Query kollabiert joinURL nicht (s. o.) —, deshalb reicht die Basis.
    const target = useRuntimeConfig(event).app.baseURL || '/'

    response.headers = { ...response.headers, location: target }
    // i18n legt einen meta-refresh als Body bei (plugin.js:25) — der trägt
    // dasselbe leere Ziel und würde die Schleife ohne Location-Header drehen.
    if (typeof response.body === 'string') {
      response.body = response.body.replace('content="0; url="', `content="0; url=${target}"`)
    }
  })
})
