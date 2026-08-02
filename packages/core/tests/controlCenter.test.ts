import { describe, expect, it } from 'vitest'
import { controlHomeTarget, isAllowedControlPath, isControlHost, isTenantHost, parseControlHosts, resolveControlHosts } from '../shared/controlCenter'

const PREFIXES = ['/api/auth/', '/api/onboarding/', '/api/health', '/api/telemetry/']

describe('Kontroll-Hosts auflösen', () => {
  it('liest die kommagetrennte Env-Liste und normalisiert', () => {
    expect(parseControlHosts(' My.Pukalani.App , start.pukalani.app ')).toEqual([
      'my.pukalani.app', 'start.pukalani.app',
    ])
  })

  it('verträgt leer, undefined und Müll', () => {
    for (const raw of ['', undefined, null, ' , , ']) {
      expect(parseControlHosts(raw)).toEqual([])
    }
  })

  it('nimmt die Env VOR der app.config (Umgebung schlägt Build)', () => {
    expect(resolveControlHosts('app.localhost', ['my.pukalani.app'])).toEqual(['app.localhost'])
    expect(resolveControlHosts('', ['my.pukalani.app'])).toEqual(['my.pukalani.app'])
    expect(resolveControlHosts(undefined, undefined)).toEqual([])
  })

  it('vergleicht Hosts unabhängig von Groß-/Kleinschreibung', () => {
    const hosts = resolveControlHosts(undefined, ['my.pukalani.app'])
    expect(isControlHost('MY.pukalani.app', hosts)).toBe(true)
    expect(isControlHost('my.pukalani.app', hosts)).toBe(true)
  })

  it('hält Community-Hosts und Leerwerte draußen', () => {
    const hosts = ['my.pukalani.app']
    for (const host of ['kunde.pukalani.app', 'pukalani.app', 'my.pukalani.app.evil.com', '', undefined, null]) {
      expect(isControlHost(host, hosts), String(host)).toBe(false)
    }
  })

  it('ist ohne konfigurierte Hosts immer false (kein Versehens-Kundenbereich)', () => {
    expect(isControlHost('my.pukalani.app', [])).toBe(false)
  })
})

describe('Mandanten-Host erkennen (Betreiber-Inhalt sperren, N7)', () => {
  const CONTROL = ['my.pukalani.app', 'start.pukalani.app']

  it('ist ohne Tenant-Gate IMMER false — Silo-Apps bleiben unverändert', () => {
    for (const host of ['localhost', 'kommentare.example.com', 'my.pukalani.app']) {
      expect(isTenantHost(false, host, CONTROL), String(host)).toBe(false)
      expect(isTenantHost(false, host, []), String(host)).toBe(false)
    }
  })

  it('lässt die Kontroll-Hosts der Pool-App in Ruhe', () => {
    expect(isTenantHost(true, 'my.pukalani.app', CONTROL)).toBe(false)
    expect(isTenantHost(true, 'START.pukalani.app', CONTROL)).toBe(false)
  })

  it('erkennt jede Kunden-Community als Mandanten-Host', () => {
    for (const host of ['kunde-a.localhost', 'morgenlicht.pukalani.app', 'demo.pukalani.app']) {
      expect(isTenantHost(true, host, CONTROL), host).toBe(true)
    }
  })

  it('ist fail-closed: unbekannte/leere Hosts gelten als Mandanten-Host', () => {
    // Die Middleware gibt diesen Hosts ohnehin 404 — aber Betreiber-Inhalt
    // darf auch dann nicht durchrutschen, wenn hier etwas Unerwartetes ankommt.
    for (const host of ['', undefined, null, 'irgendwas.example.com']) {
      expect(isTenantHost(true, host, CONTROL), String(host)).toBe(true)
    }
  })
})

describe('Wohin führt `/` auf einem Kontroll-Host? (F12)', () => {
  const WIZARD = ['start.pukalani.app']

  it('schickt den Kurz-Link-Host in den Wizard', () => {
    expect(controlHomeTarget('start.pukalani.app', WIZARD, false)).toBe('wizard')
    expect(controlHomeTarget('START.Pukalani.app', WIZARD, false)).toBe('wizard')
  })

  it('zeigt auf dem Kundenbereich die Übersicht', () => {
    expect(controlHomeTarget('my.pukalani.app', WIZARD, false)).toBe('overview')
  })

  it('lässt ein `?code=` immer in den Wizard — auch auf dem Kundenbereich', () => {
    // Weitergeleitete Mail, kopierter Link: die Absicht steht in der Query.
    expect(controlHomeTarget('my.pukalani.app', WIZARD, true)).toBe('wizard')
    expect(controlHomeTarget('start.pukalani.app', WIZARD, true)).toBe('wizard')
  })

  it('ist ohne konfigurierte Wizard-Hosts überall die Übersicht', () => {
    // Die Übersicht schickt Konten OHNE Community selbst weiter — der
    // Neukunde landet also auch dann im Trichter, nur einen Schritt später.
    for (const host of ['my.pukalani.app', 'start.pukalani.app', '', undefined, null]) {
      expect(controlHomeTarget(host, [], false), String(host)).toBe('overview')
    }
  })
})

describe('Erlaubte Pfade im Kundenbereich (fail-closed)', () => {
  it('lässt die eingetragenen API-Präfixe durch', () => {
    for (const path of ['/api/auth/me', '/api/auth/login', '/api/onboarding/site', '/api/health', '/api/telemetry/error']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(true)
    }
  })

  it('sperrt JEDEN anderen API-Pfad — dort wäre nichts mandanten-gescopt', () => {
    for (const path of ['/api/comments', '/api/pages/public/home', '/api/themes', '/api/stats', '/api/admin/themes', '/api/presence/heartbeat']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(false)
    }
  })

  it('lässt sich nicht mit Präfix-Tricks umgehen', () => {
    // '/api/authX' beginnt mit '/api/auth', aber NICHT mit '/api/auth/' —
    // deshalb enden die Einträge auf einen Schrägstrich.
    expect(isAllowedControlPath('/api/authX/leak', PREFIXES)).toBe(false)
    expect(isAllowedControlPath('/api/onboarding-secret', PREFIXES)).toBe(false)
  })

  /**
   * Audit-Befund 9 (2026-08-02): der Vergleich war ein nacktes `startsWith`.
   * Für Einträge OHNE Schrägstrich am Ende — und vier der sieben echten stehen
   * so in der app.config — erlaubte das jeden Pfad, der zufällig mit demselben
   * Wort beginnt. Jetzt gilt die Segmentgrenze aus dem Produkt-Gate.
   */
  it('vergleicht an der SEGMENTGRENZE, auch bei Präfixen ohne Schrägstrich', () => {
    const real = ['/api/auth/', '/api/onboarding/', '/api/health', '/api/telemetry/', '/api/notifications', '/api/feedback', '/api/abuse']
    // Erlaubt bleibt, was erlaubt war.
    for (const path of ['/api/health', '/api/health?deep=1', '/api/notifications', '/api/notifications/42', '/api/feedback', '/api/abuse/report', '/api/auth/me', '/api/onboarding/site']) {
      expect(isAllowedControlPath(path, real), path).toBe(true)
    }
    // Und die Mitläufer sind draußen.
    for (const path of ['/api/healthz', '/api/health-internal', '/api/notificationsettings', '/api/feedbackfoo', '/api/abuse-export']) {
      expect(isAllowedControlPath(path, real), path).toBe(false)
    }
  })

  it('ein Schrägstrich am Ende des Präfixes verlangt kein doppeltes //', () => {
    expect(isAllowedControlPath('/api/auth', ['/api/auth/'])).toBe(true)
    expect(isAllowedControlPath('/api/auth/me', ['/api/auth/'])).toBe(true)
    expect(isAllowedControlPath('/api/authX', ['/api/auth/'])).toBe(false)
  })

  it('lässt Nicht-API-Pfade unberührt (Seiten, Assets, i18n)', () => {
    for (const path of ['/', '/start', '/de/start', '/_nuxt/entry.js', '/_i18n/de/messages.json']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(true)
    }
  })

  it('sperrt bei leerer Präfix-Liste jeden API-Pfad', () => {
    expect(isAllowedControlPath('/api/auth/me', [])).toBe(false)
    expect(isAllowedControlPath('/start', [])).toBe(true)
  })
})
