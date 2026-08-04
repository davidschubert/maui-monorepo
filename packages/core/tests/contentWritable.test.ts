import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * F1 Stufe 3 — der Schreib-Wächter.
 *
 * Der Vertrag ist ABSICHTLICH anders gebaut als sein Zwilling
 * `contentActivity`: unbekannter Typ heißt weiterhin „ja", ein FEHLER im
 * Wächter aber NICHT. Genau diese Asymmetrie prüfen die Gegenproben unten —
 * ohne sie wäre der Unterschied eine Behauptung im Kommentar.
 */
const {
  __resetContentWriteGuards,
  assertContentWritable,
  registerContentWriteGuard,
  registeredContentWriteGuards,
} = await import('../server/utils/contentWritable')

/** Der Vertrag reicht das Event nur durch — ein Platzhalter genügt. */
const event = {} as H3Event

beforeEach(() => {
  __resetContentWriteGuards()
})

describe('registerContentWriteGuard', () => {
  it('meldet den Typ an und ruft ihn mit Typ und Id', async () => {
    const guard = vi.fn()
    registerContentWriteGuard('post', guard)

    expect(registeredContentWriteGuards()).toEqual(['post'])
    await assertContentWritable(event, 'post', 'row-1')

    expect(guard).toHaveBeenCalledWith(event, { targetType: 'post', targetId: 'row-1' })
  })

  it('ist je Typ EINE Autorität — die letzte Registrierung gewinnt', () => {
    registerContentWriteGuard('post', vi.fn())
    registerContentWriteGuard('post', vi.fn())

    expect(registeredContentWriteGuards()).toEqual(['post'])
  })

  it('trennt Typen sauber — ein Ticket-Kommentar rührt den Beitrags-Wächter nicht an', async () => {
    const posts = vi.fn()
    registerContentWriteGuard('post', posts)

    await assertContentWritable(event, 'ticket', 'row-1')

    expect(posts).not.toHaveBeenCalled()
  })
})

describe('assertContentWritable', () => {
  it('GEGENPROBE: ohne registrierten Typ ist Schreiben ERLAUBT (fail-open)', async () => {
    // Wie beim Aktivitäts-Vertrag: ein Kommentar an einem Ziel ohne Regel
    // (Ticket, Kurs-Lektion, Silo-Andockpunkt) ist völlig in Ordnung.
    await expect(assertContentWritable(event, 'ticket', 'row-1')).resolves.toBeUndefined()
  })

  it('GEGENPROBE: leerer Typ oder leere Id lösen nichts aus', async () => {
    const guard = vi.fn()
    registerContentWriteGuard('post', guard)

    await assertContentWritable(event, '', 'row-1')
    await assertContentWritable(event, 'post', '')

    expect(guard).not.toHaveBeenCalled()
  })

  it('ein stiller Wächter heißt „erlaubt"', async () => {
    registerContentWriteGuard('post', () => {})

    await expect(assertContentWritable(event, 'post', 'row-1')).resolves.toBeUndefined()
  })

  it('DER UNTERSCHIED ZUM AKTIVITÄTS-VERTRAG: ein werfender Wächter bricht den Aufrufer AB', async () => {
    // Hier NICHT schlucken. Ein Wächter, der bei Störung durchwinkt, ist eine
    // Attrappe — „geschlossen" wäre dann eine Zusage, die bei jedem Schluckauf
    // bricht. Der Gegentest steht in contentActivity.test.ts und erwartet dort
    // das genaue Gegenteil.
    registerContentWriteGuard('post', () => {
      throw new Error('Appwrite ist gerade nicht erreichbar')
    })

    await expect(assertContentWritable(event, 'post', 'row-1')).rejects.toThrow('Appwrite ist gerade nicht erreichbar')
  })

  it('reicht den Fehler UNVERÄNDERT durch — der fachliche Grund muss beim Client ankommen', async () => {
    // Der Wächter wirft selbst (statt false zu liefern), weil nur er den Grund
    // kennt. Ginge er hier durch eine Umverpackung, wäre `data.code` weg und
    // der Client bekäme eine nackte 403.
    const denial = Object.assign(new Error('This topic is closed'), {
      status: 403,
      data: { code: 'topic_closed' },
    })
    registerContentWriteGuard('post', () => {
      throw denial
    })

    await expect(assertContentWritable(event, 'post', 'row-1')).rejects.toBe(denial)
  })

  it('wartet auf einen asynchronen Wächter (sonst liefe das Schreiben ihm davon)', async () => {
    let resolved = false
    registerContentWriteGuard('post', async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      resolved = true
    })

    await assertContentWritable(event, 'post', 'row-1')

    expect(resolved).toBe(true)
  })
})
