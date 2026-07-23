/**
 * Maui Comments — Embed-Loader (Disqus-Modell, docs/plans/EMBED-WIDGET.md).
 * Dependency-frei, kein Build-Schritt, versionslos stabil.
 *
 * Integration:
 *   <div id="maui-comments"></div>
 *   <script async src="https://<widget-domain>/embed.js"
 *     data-target-id="mein-blogpost-42"
 *     data-target-type="blog"
 *     data-theme="auto"            <!-- light | dark | auto (Default) -->
 *     data-locale="de"             <!-- de | en (Default) -->
 *     data-primary="sky"           <!-- optionale Akzentfarbe (Whitelist) -->
 *     data-container="maui-comments"><\/script>
 *
 * Mehrere Widgets pro Seite: je ein Script-Tag mit eigenem data-container.
 * Theme nachsteuern: iframe.contentWindow.postMessage(
 *   { type: 'maui:set-theme', theme: 'dark' }, widgetOrigin)
 *
 * Kommentar-Zähler (E3): Elemente mit data-maui-count werden mit der Anzahl
 * befüllt (CORS-read-only, keine Cookies) — z. B. für Artikel-Listen:
 *   <a href="/post-42#kommentare">
 *     <span data-maui-count data-target-id="post-42" data-target-type="blog">…</span>
 *   </a>
 * data-target-type ist optional (Default wie beim Widget: 'page').
 */
(function () {
  'use strict'

  var script = document.currentScript
  if (!script) return

  var widgetOrigin = new URL(script.src).origin

  // E3: „N Kommentare"-Zähler auf der Hostseite befüllen (unabhängig vom
  // Widget — funktioniert auch ohne data-target-id am Script-Tag)
  function fillCounts() {
    var nodes = document.querySelectorAll('[data-maui-count]')
    Array.prototype.forEach.call(nodes, function (node) {
      var id = node.getAttribute('data-target-id')
      if (!id) return
      var type = node.getAttribute('data-target-type') || 'page'
      var q = new URLSearchParams({ targetId: id, targetType: type })
      fetch(widgetOrigin + '/api/comments/count?' + q.toString(), { credentials: 'omit' })
        .then(function (res) { return res.ok ? res.json() : null })
        .then(function (data) {
          if (data && typeof data.count === 'number') node.textContent = String(data.count)
        })
        .catch(function () { /* Zähler bleibt leer — nie die Hostseite stören */ })
    })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillCounts)
  }
  else {
    fillCounts()
  }

  var targetId = script.getAttribute('data-target-id')
  if (!targetId) {
    // Nur Zähler-Modus (data-maui-count) — ohne target kein Widget-iframe
    return
  }
  var targetType = script.getAttribute('data-target-type') || 'page'
  var theme = script.getAttribute('data-theme') || 'auto'
  var locale = script.getAttribute('data-locale') || ''
  var primary = script.getAttribute('data-primary') || ''

  // Container: per data-container benannt, sonst #maui-comments, sonst
  // ein frisches <div> direkt vor dem Script-Tag.
  var containerId = script.getAttribute('data-container') || 'maui-comments'
  var container = document.getElementById(containerId)
  if (!container) {
    container = document.createElement('div')
    script.parentNode.insertBefore(container, script)
  }

  var params = new URLSearchParams({
    targetId: targetId,
    targetType: targetType,
    theme: theme,
    url: location.href,
  })
  if (primary) params.set('primary', primary)

  // i18n prefix_except_default: en ohne Präfix, andere Sprachen als /<locale>/
  var path = (locale && locale !== 'en' ? '/' + locale : '') + '/embed?' + params.toString()

  var iframe = document.createElement('iframe')
  iframe.src = widgetOrigin + path
  iframe.title = 'Comments'
  iframe.loading = 'lazy'
  // allow-popups(-to-escape-sandbox): Login-Popup (E2) muss top-level raus
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox')
  iframe.setAttribute('allowtransparency', 'true')
  iframe.style.width = '100%'
  iframe.style.border = '0'
  iframe.style.minHeight = '120px'
  iframe.style.colorScheme = 'normal' // sonst zwingt der UA dem transparenten iframe einen Hintergrund auf
  container.appendChild(iframe)

  // Resize: das Widget meldet seine Höhe — Origin UND Quelle strikt prüfen
  var gotResize = false
  window.addEventListener('message', function (event) {
    if (event.origin !== widgetOrigin) return
    if (event.source !== iframe.contentWindow) return
    var data = event.data || {}
    if (data.type === 'maui:resize' && typeof data.height === 'number' && isFinite(data.height)) {
      gotResize = true
      iframe.style.height = Math.max(120, Math.ceil(data.height)) + 'px'
    }
  })

  // E3: meldet sich das Widget nie (z. B. CSP blockt einen unregistrierten
  // Einbetter → Browser lässt das iframe leer), zeigen wir statt eines
  // stummen Lochs einen neutralen Hinweis auf der Hostseite.
  setTimeout(function () {
    if (gotResize) return
    var note = document.createElement('p')
    note.textContent = 'Comments could not be loaded on this site.'
    note.style.cssText = 'font-size:.85em;color:#888;margin:.5em 0'
    container.appendChild(note)
    iframe.style.display = 'none'
  }, 10000)
})()
