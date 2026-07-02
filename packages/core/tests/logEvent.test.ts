import { describe, expect, it, vi } from 'vitest'
import { logEvent, shapeErrorLog } from '../server/utils/logEvent'

describe('shapeErrorLog', () => {
  it('h3-Fehler: Status + Message + gekappter Stack', () => {
    const error = Object.assign(new Error('boom'), { statusCode: 503 })
    const shaped = shapeErrorLog(error, { path: '/api/x', method: 'GET' })
    expect(shaped).toMatchObject({ path: '/api/x', method: 'GET', status: 503, message: 'boom' })
    expect(String(shaped.stack).split('\n').length).toBeLessThanOrEqual(12)
  })

  it('nackter Error ohne Status → 500', () => {
    expect(shapeErrorLog(new Error('kaputt'))).toMatchObject({ status: 500, message: 'kaputt' })
  })

  it('Nicht-Error-Wert wird stringifiziert', () => {
    expect(shapeErrorLog('einfach ein string')).toMatchObject({ status: 500, message: 'einfach ein string' })
    expect(shapeErrorLog(42).message).toBe('42')
  })

  it('sehr langer Stack wird auf 12 Zeilen gekappt', () => {
    const error = new Error('deep')
    error.stack = Array.from({ length: 50 }, (_, i) => `at frame${i}`).join('\n')
    expect(String(shapeErrorLog(error).stack).split('\n')).toHaveLength(12)
  })
})

describe('logEvent', () => {
  it('schreibt eine JSON-Zeile mit time/level/event auf den passenden Kanal', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logEvent('error', 'server.error', { status: 500 })
    const line = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(line).toMatchObject({ level: 'error', event: 'server.error', status: 500 })
    expect(typeof line.time).toBe('string')
    spy.mockRestore()
  })
})
