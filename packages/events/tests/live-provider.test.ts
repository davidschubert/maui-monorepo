import { describe, expect, it } from 'vitest'
import { detectLiveProvider } from '../shared/liveProvider'

describe('detectLiveProvider', () => {
  it('erkennt die erstklassigen Provider', () => {
    expect(detectLiveProvider('https://meet.google.com/abc-defg-hij').id).toBe('meet')
    expect(detectLiveProvider('https://www.twitch.tv/somechannel').id).toBe('twitch')
    expect(detectLiveProvider('https://www.youtube.com/watch?v=x').id).toBe('youtube')
    expect(detectLiveProvider('https://youtu.be/x').id).toBe('youtube')
    expect(detectLiveProvider('https://meet.jit.si/MeinRaum').id).toBe('jitsi')
    expect(detectLiveProvider('https://stream.owncast.online/').id).toBe('owncast')
    expect(detectLiveProvider('https://www.linkedin.com/events/123/').id).toBe('linkedin')
  })

  it('erkennt weitere bekannte Anbieter', () => {
    expect(detectLiveProvider('https://us02web.zoom.us/j/123').id).toBe('zoom')
    expect(detectLiveProvider('https://teams.microsoft.com/l/meetup-join/x').id).toBe('teams')
    expect(detectLiveProvider('https://vimeo.com/event/123').id).toBe('vimeo')
  })

  it('fällt bei unbekannten Hosts und Müll auf generic zurück', () => {
    // self-gehostete Jitsi-/OwnCast-Instanzen sind nicht erkennbar — bewusst generic
    expect(detectLiveProvider('https://jitsi.meine-domain.de/raum').id).toBe('generic')
    expect(detectLiveProvider('https://example.com/live').id).toBe('generic')
    expect(detectLiveProvider('kein-link').id).toBe('generic')
    expect(detectLiveProvider(null).id).toBe('generic')
    expect(detectLiveProvider(undefined).id).toBe('generic')
  })

  it('matcht nur echte Host-Grenzen (kein Suffix-Spoofing)', () => {
    expect(detectLiveProvider('https://eviltwitch.tv/x').id).toBe('generic')
    expect(detectLiveProvider('https://not-meet.google.com.evil.io/x').id).toBe('generic')
  })
})
