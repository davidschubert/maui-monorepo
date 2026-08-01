import { describe, expect, it } from 'vitest'
import {
  communityIdsNeedingHost,
  communityOrigin,
  notificationLinkBase,
  notificationLinkUrl,
  safeNotificationPath,
} from '../shared/notificationLinks'
import { NOTIFICATION_SCOPE_ACCOUNT, NOTIFICATION_SCOPE_UNKNOWN, notificationScopeValue } from '../shared/notificationScope'

/**
 * D5 — wohin zeigt der Link in einer Benachrichtigungs-MAIL?
 *
 * Die Glocke war seit C15 richtig, die Mail nicht: jede URL kam aus EINER
 * Env-Basis. Diese Tests nageln die drei Fälle fest (Community · Kundenbereich ·
 * unbekannt) und vor allem die Fail-soft-Kante: eine nicht auflösbare Community
 * darf NIE eine kaputte URL erzeugen, sondern muss sich wie vor D5 verhalten.
 */

const APP = 'https://app.pukalani.app'

describe('communityOrigin (pure)', () => {
  it('echte Hosts sprechen https', () => {
    expect(communityOrigin('kunde-a.pukalani.app')).toBe('https://kunde-a.pukalani.app')
  })
  it('lokale Hosts sprechen http (wie die Einladungsmail)', () => {
    expect(communityOrigin('kunde-a.localhost')).toBe('http://kunde-a.localhost')
    expect(communityOrigin('localhost')).toBe('http://localhost')
    expect(communityOrigin('localhost:3006')).toBe('http://localhost:3006')
  })
  it('normalisiert Groß-/Kleinschreibung und Leerraum', () => {
    expect(communityOrigin('  Kunde-A.Pukalani.App ')).toBe('https://kunde-a.pukalani.app')
  })
  it('leerer Host → leerer Origin (der Aufrufer fällt dann zurück)', () => {
    expect(communityOrigin('')).toBe('')
    expect(communityOrigin('   ')).toBe('')
  })
})

describe('safeNotificationPath (Open-Redirect-Guard)', () => {
  it('lässt gewöhnliche interne Pfade durch', () => {
    expect(safeNotificationPath('/threads/abc?x=1#c-2')).toBe('/threads/abc?x=1#c-2')
    expect(safeNotificationPath('/')).toBe('/')
  })
  it('wehrt alles ab, aus dem ein FREMDER Host werden könnte', () => {
    // Genau hier liegt der Unterschied zu vorher: der Pfad wird jetzt an einen
    // Host aus der DATENBANK geklebt.
    for (const bad of ['//evil.example', '/\\evil.example', '/%2Fevil', 'https://evil.example', 'evil', '/pfad mit leerzeichen', '']) {
      expect(safeNotificationPath(bad), bad).toBe('/')
    }
  })
})

describe('notificationLinkBase — die drei Ablage-Werte', () => {
  const links = { appBase: APP, hosts: { 't-kunde-a': 'kunde-a.pukalani.app' } }

  it('<communityId> → Host DIESER Community', () => {
    expect(notificationLinkBase(links, 't-kunde-a')).toBe('https://kunde-a.pukalani.app')
  })
  it('_account → App-Host (der Kundenbereich, in dem die Zeile entstand)', () => {
    expect(notificationLinkBase(links, NOTIFICATION_SCOPE_ACCOUNT)).toBe(APP)
  })
  it('\'\' und fehlend → App-Host (Bestand + Silo, heutiges Verhalten)', () => {
    expect(notificationLinkBase(links, NOTIFICATION_SCOPE_UNKNOWN)).toBe(APP)
    expect(notificationLinkBase(links, undefined)).toBe(APP)
    expect(notificationLinkBase(links, null)).toBe(APP)
  })
  it('FAIL-SOFT: unbekannte Community → App-Host, nie eine kaputte URL', () => {
    expect(notificationLinkBase(links, 't-gibt-es-nicht')).toBe(APP)
    expect(notificationLinkBase({ appBase: APP }, 't-kunde-a')).toBe(APP)
    expect(notificationLinkBase({ appBase: APP, hosts: { 't-kunde-a': '' } }, 't-kunde-a')).toBe(APP)
  })
  it('Schrägstrich am Ende der App-Basis verdoppelt sich nicht', () => {
    expect(notificationLinkBase({ appBase: 'https://app.pukalani.app///' }, '')).toBe(APP)
  })
})

describe('notificationLinkUrl — Basis + geprüfter Pfad', () => {
  const links = { appBase: APP, hosts: { 't-kunde-a': 'kunde-a.pukalani.app', 't-kunde-b': 'kunde-b.localhost' } }

  it('baut die Community-URL', () => {
    expect(notificationLinkUrl(links, { link: '/de/threads/1', communityId: 't-kunde-a' }))
      .toBe('https://kunde-a.pukalani.app/de/threads/1')
    expect(notificationLinkUrl(links, { link: '/threads/2', communityId: 't-kunde-b' }))
      .toBe('http://kunde-b.localhost/threads/2')
  })
  it('Konto-Meldungen bleiben auf dem App-Host', () => {
    expect(notificationLinkUrl(links, { link: '/dashboard/billing', communityId: NOTIFICATION_SCOPE_ACCOUNT }))
      .toBe('https://app.pukalani.app/dashboard/billing')
  })
  it('der Guard gewinnt auch gegen einen Community-Host', () => {
    expect(notificationLinkUrl(links, { link: '//evil.example', communityId: 't-kunde-a' }))
      .toBe('https://kunde-a.pukalani.app/')
  })
  it('EINE Mail, MEHRERE Communities — jeder Eintrag trägt seinen Host', () => {
    // Der Digest bündelt bewusst mandantenübergreifend (C15): eine Sammel-Mail
    // pro Tag, nicht eine je Community. Genau deshalb ist die Regel pro EINTRAG.
    const items = [
      { link: '/a', communityId: 't-kunde-a' },
      { link: '/b', communityId: 't-kunde-b' },
      { link: '/c', communityId: NOTIFICATION_SCOPE_ACCOUNT },
      { link: '/d', communityId: NOTIFICATION_SCOPE_UNKNOWN },
    ]
    expect(items.map(item => notificationLinkUrl(links, item))).toEqual([
      'https://kunde-a.pukalani.app/a',
      'http://kunde-b.localhost/b',
      'https://app.pukalani.app/c',
      'https://app.pukalani.app/d',
    ])
  })
})

describe('communityIdsNeedingHost — was überhaupt aufgelöst werden muss', () => {
  it('nur echte Communities, dedupliziert', () => {
    expect(communityIdsNeedingHost([
      { communityId: 't-a' }, { communityId: 't-a' }, { communityId: 't-b' },
      { communityId: NOTIFICATION_SCOPE_ACCOUNT }, { communityId: '' }, { communityId: null }, {},
    ])).toEqual(['t-a', 't-b'])
  })
  it('nichts aufzulösen → leere Liste (der Sweep fragt dann gar nicht)', () => {
    expect(communityIdsNeedingHost([])).toEqual([])
    expect(communityIdsNeedingHost([{ communityId: '' }, { communityId: NOTIFICATION_SCOPE_ACCOUNT }])).toEqual([])
  })
})

describe('Schulterschluss mit der Ablage-Regel (notificationScope)', () => {
  it('was notify() schreibt, ist genau das, was die Link-Regel liest', () => {
    // Die beiden Dateien müssen sich über dieselben drei Werte einig sein —
    // sonst zeigt die Glocke die Meldung in Community A und die Mail verlinkt
    // woanders hin.
    const links = { appBase: APP, hosts: { 't-1': 'eins.pukalani.app' } }
    expect(notificationLinkBase(links, notificationScopeValue('tenant', 't-1'))).toBe('https://eins.pukalani.app')
    expect(notificationLinkBase(links, notificationScopeValue('tenant', null))).toBe(APP)
    expect(notificationLinkBase(links, notificationScopeValue('account', 't-1'))).toBe(APP)
  })
})
