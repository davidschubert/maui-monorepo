import { describe, expect, it } from 'vitest'
import { switcherExternalLink } from '../shared/communitySwitcherLinks'

/**
 * Die zwei Ausgänge des Community-Switchers (F50, 2026-08-07): sie verlassen
 * den Mandanten-Host, müssen also absolut sein — und dürfen bei fehlender
 * Config lieber gar nicht erscheinen als kaputt.
 */
describe('switcherExternalLink', () => {
  it('baut eine absolute https-URL aus dem ERSTEN Host', () => {
    expect(switcherExternalLink(['my.pukalani.app', 'start.pukalani.app'], '/communities'))
      .toBe('https://my.pukalani.app/communities')
    expect(switcherExternalLink(['start.pukalani.app'], '/start'))
      .toBe('https://start.pukalani.app/start')
  })

  it('spricht lokal http (Entwicklungs-Hosts)', () => {
    expect(switcherExternalLink(['my.localhost'], '/communities')).toBe('http://my.localhost/communities')
    expect(switcherExternalLink(['localhost'], '/start')).toBe('http://localhost/start')
  })

  it('überspringt leere Einträge', () => {
    expect(switcherExternalLink(['  ', 'my.pukalani.app'], '/communities'))
      .toBe('https://my.pukalani.app/communities')
  })

  it('liefert leer, wenn kein Host konfiguriert ist — dann fehlt der Menüpunkt', () => {
    expect(switcherExternalLink(undefined, '/start')).toBe('')
    expect(switcherExternalLink([], '/start')).toBe('')
    expect(switcherExternalLink(['', '   '], '/start')).toBe('')
  })
})
