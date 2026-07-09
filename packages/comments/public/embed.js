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
 */
(function () {
  'use strict'

  var script = document.currentScript
  if (!script) return

  var targetId = script.getAttribute('data-target-id')
  if (!targetId) {
    console.warn('[maui-comments] data-target-id fehlt — Widget wird nicht geladen.')
    return
  }

  var widgetOrigin = new URL(script.src).origin
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
  window.addEventListener('message', function (event) {
    if (event.origin !== widgetOrigin) return
    if (event.source !== iframe.contentWindow) return
    var data = event.data || {}
    if (data.type === 'maui:resize' && typeof data.height === 'number' && isFinite(data.height)) {
      iframe.style.height = Math.max(120, Math.ceil(data.height)) + 'px'
    }
  })
})()
