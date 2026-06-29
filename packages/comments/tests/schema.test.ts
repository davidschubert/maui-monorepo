import { describe, it, expect } from 'vitest'
import { commentSchema } from '../schemas/comment'

// Basis: ein gültiger Comment-Body, den wir je Test um targetUrl ergänzen.
const base = { targetId: 't1', targetType: 'post', content: 'hi' }

function accepts(targetUrl: string) {
  return commentSchema.safeParse({ ...base, targetUrl }).success
}

describe('commentSchema.targetUrl — Open-Redirect-Guard', () => {
  it('lässt gültige interne Pfade zu', () => {
    for (const v of ['/', '/posts/123', '/de/dashboard', '/posts/123?tab=2#c-9', '/a/b/c']) {
      expect(accepts(v), v).toBe(true)
    }
  })

  it('blockt protokoll-relative und externe Bypässe', () => {
    // //evil, /\evil (Browser normalisiert \→/), /%2F%2Fevil, Whitespace-Tricks,
    // absolute URLs und javascript: — alle müssen abgelehnt werden.
    for (const v of [
      '//evil.com',
      '//evil',
      '/\\evil.com',
      '/\t//evil',
      '/%2F%2Fevil.com',
      '/\r//evil.com',
      '/ /evil.com',
      'http://evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      'evil.com',
    ]) {
      expect(accepts(v), v).toBe(false)
    }
  })

  it('targetUrl ist optional', () => {
    expect(commentSchema.safeParse(base).success).toBe(true)
  })
})
