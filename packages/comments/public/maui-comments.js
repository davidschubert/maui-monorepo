/**
 * Maui Comments — Web-Component-Variante (Embed-Plan E4 #19).
 * Dependency-frei, kein Build-Schritt, versionslos stabil — wie embed.js.
 *
 * Registriert das Custom-Element <maui-comments>. Statt eines Script-Tags mit
 * data-*-Attributen bindet man das Widget deklarativ als HTML-Element ein —
 * bequemer in CMS/Frameworks, die Custom Elements sauberer handhaben als
 * eingefügte <script>-Tags. Attribute reagieren live (z. B. theme umstellen).
 *
 * Integration:
 *   <script async src="https://<widget-domain>/maui-comments.js"></script>
 *   <maui-comments
 *     target-id="mein-blogpost-42"
 *     target-type="blog"            <!-- Default: page -->
 *     theme="auto"                  <!-- light | dark | auto (Default) -->
 *     locale="de"                   <!-- de | en (Default) -->
 *     primary="sky"                 <!-- optionale Akzentfarbe (Whitelist) -->
 *   ></maui-comments>
 *
 * Sicherheit: das Element rendert das Widget bewusst in einem SANDBOXED
 * <iframe> (Shadow-DOM-gekapselt) — identisch zu embed.js. Damit bleibt der
 * fremde Kommentar-Inhalt vom Host-DOM entkoppelt (kein XSS-Vektor auf der
 * Einbetter-Seite) und es braucht KEINE CORS-Öffnung der Kommentar-API. Eine
 * echte Inline-Variante (Kommentare direkt im Host-DOM, ohne iframe) wäre ein
 * größeres, sicherheitssensibles Stück (eigener Sanitizer + CORS-Allowlist) —
 * bewusst NICHT hier, siehe docs/plans/EMBED-WIDGET.md § 6.
 */
(function () {
  'use strict'

  // Origin, von dem dieses Script geladen wurde = Widget-Domain (wie embed.js).
  // Zum Definitionszeitpunkt ist currentScript gesetzt; als Fallback erlaubt das
  // Element ein `base`-Attribut (z. B. wenn das Bundle selbst gehostet wird).
  var loaderOrigin = ''
  try {
    if (document.currentScript && document.currentScript.src) {
      loaderOrigin = new URL(document.currentScript.src).origin
    }
  }
  catch (e) { /* base-Attribut bleibt der Weg */ }

  var PRIMARY = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']

  if (typeof window.customElements === 'undefined' || window.customElements.get('maui-comments')) return

  function MauiComments() {
    return Reflect.construct(HTMLElement, [], MauiComments)
  }
  MauiComments.prototype = Object.create(HTMLElement.prototype)
  MauiComments.prototype.constructor = MauiComments

  MauiComments.observedAttributes = ['target-id', 'target-type', 'theme', 'locale', 'primary', 'base']
  Object.defineProperty(MauiComments, 'observedAttributes', {
    get: function () { return ['target-id', 'target-type', 'theme', 'locale', 'primary', 'base'] },
  })

  MauiComments.prototype.widgetOrigin = function () {
    return this.getAttribute('base') || loaderOrigin || window.location.origin
  }

  MauiComments.prototype.buildSrc = function () {
    var origin = this.widgetOrigin()
    var targetId = this.getAttribute('target-id')
    if (!targetId) return null
    var params = new URLSearchParams({
      targetId: targetId,
      targetType: this.getAttribute('target-type') || 'page',
      theme: this.getAttribute('theme') || 'auto',
      url: window.location.href,
    })
    var primary = this.getAttribute('primary')
    if (primary && PRIMARY.indexOf(primary) !== -1) params.set('primary', primary)
    var locale = this.getAttribute('locale') || ''
    // i18n prefix_except_default: en ohne Präfix, sonst /<locale>/
    var path = (locale && locale !== 'en' ? '/' + locale : '') + '/embed?' + params.toString()
    return origin + path
  }

  MauiComments.prototype.connectedCallback = function () {
    if (this._root) return
    var root = this.attachShadow ? this.attachShadow({ mode: 'open' }) : this
    this._root = root

    var style = document.createElement('style')
    style.textContent = ':host{display:block}iframe{width:100%;border:0;min-height:120px;color-scheme:normal}p.err{font-size:.85em;color:#888;margin:.5em 0}'
    root.appendChild(style)

    var src = this.buildSrc()
    if (!src) return // ohne target-id kein Widget

    var iframe = document.createElement('iframe')
    iframe.src = src
    iframe.title = 'Comments'
    iframe.loading = 'lazy'
    // allow-popups(-to-escape-sandbox): Login-Popup (E2) muss top-level raus
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox')
    iframe.setAttribute('allowtransparency', 'true')
    root.appendChild(iframe)
    this._iframe = iframe

    var self = this
    this._gotResize = false
    this._onMessage = function (event) {
      if (event.origin !== self.widgetOrigin()) return
      if (event.source !== iframe.contentWindow) return
      var data = event.data || {}
      if (data.type === 'maui:resize' && typeof data.height === 'number' && isFinite(data.height)) {
        self._gotResize = true
        iframe.style.height = Math.max(120, Math.ceil(data.height)) + 'px'
      }
    }
    window.addEventListener('message', this._onMessage)

    // Meldet sich das Widget nie (CSP blockt einen unregistrierten Einbetter →
    // leeres iframe), neutraler Hinweis statt eines stummen Lochs.
    this._fallbackTimer = setTimeout(function () {
      if (self._gotResize || !self._iframe) return
      var note = document.createElement('p')
      note.className = 'err'
      note.textContent = 'Comments could not be loaded on this site.'
      root.appendChild(note)
      iframe.style.display = 'none'
    }, 10000)
  }

  MauiComments.prototype.disconnectedCallback = function () {
    if (this._onMessage) window.removeEventListener('message', this._onMessage)
    clearTimeout(this._fallbackTimer)
  }

  MauiComments.prototype.attributeChangedCallback = function (name, oldValue, newValue) {
    if (!this._iframe || oldValue === newValue) return
    // theme live nachsteuern (ohne iframe-Reload) — nutzt die dokumentierte
    // postMessage-Schnittstelle des Widgets.
    if (name === 'theme' && newValue) {
      try { this._iframe.contentWindow.postMessage({ type: 'maui:set-theme', theme: newValue }, this.widgetOrigin()) }
      catch (e) { /* iframe evtl. noch nicht bereit — nächster Attribut-Set greift */ }
      return
    }
    // Alle anderen Attribute ändern die Ziel-URL → iframe neu laden.
    var src = this.buildSrc()
    if (src) this._iframe.src = src
  }

  window.customElements.define('maui-comments', MauiComments)
})()
