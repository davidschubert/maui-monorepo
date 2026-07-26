import type { ComputedRef } from 'vue'
import type { TicketRow } from '../../shared/types/ticket'

/** Flugdauer + Kurven sind am Referenz-Motion-Design nachgemessen (60-fps-
 *  Frame-Tracking): 800 ms Flug, Bogen-Apex bei ~35 %, Rotation 0→6,5°→−1°→0,
 *  die Zielspalte öffnet den Slot erst kurz vor der Landung. */
const FLIGHT_MS = 800
/** Mehr als 3 gleichzeitige Flüge wirken chaotisch — der Rest erscheint einfach. */
const MAX_FLIGHTS = 3

/**
 * „Kartenflug" für fremdausgelöste Spaltenwechsel: Realtime-Moves anderer
 * Nutzer, Verschieben übers Ticket-Modal, Fehler-Reverts. Die Karte fliegt
 * als Klon im Overlay von der alten zur neuen Spalte, während die Spalten
 * per TransitionGroup-FLIP nachrücken (TicketBoardList). Eigenes DnD fliegt
 * bewusst NICHT — die Karte liegt beim Drop schon unterm Cursor; moveTicket
 * meldet diese IDs über localMoveIds.
 */
export function useTicketBoardFlight(
  ticketsByList: ComputedRef<Map<string, TicketRow[]>>,
  localMoveIds: Set<string>,
) {
  const previousList = new Map<string, string>()
  const active = new Set<() => void>()

  function cardEl(ticketId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-ticket="${ticketId}"]`)
  }

  /** Zielkarte NUR in der Zielspalte suchen: das Quell-Element steht beim
      nextTick noch im DOM (TransitionGroup entfernt Leave-Kinder erst einen
      Frame später) und käme im Dokument zuerst. */
  function targetCardEl(ticketId: string, listId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`section[data-list="${listId}"] [data-ticket="${ticketId}"]`)
  }

  function fly(clone: HTMLElement, from: DOMRect, toEl: HTMLElement, targetColumn: Element | null, delay: number) {
    const to = toEl.getBoundingClientRect()
    const dx = to.left - from.left
    const dy = to.top - from.top

    // Klon im Overlay: außen Translation/Skalierung, innen Rotation —
    // getrennte Elemente, damit beide Kurven unabhängig laufen
    clone.removeAttribute('data-ticket')
    clone.style.margin = '0'
    clone.style.boxShadow = '0 12px 32px rgb(0 0 0 / 0.18)'
    const overlay = document.createElement('div')
    overlay.style.cssText = `position:fixed;left:${from.left}px;top:${from.top}px;`
      + `width:${from.width}px;height:${from.height}px;z-index:40;pointer-events:none;will-change:transform;`
    overlay.appendChild(clone)
    document.body.appendChild(overlay)

    // Zielkarte verstecken — der Klon vertritt sie bis zur Landung
    toEl.style.visibility = 'hidden'

    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      active.delete(done)
      overlay.remove()
      toEl.style.visibility = ''
      targetColumn?.removeAttribute('data-incoming')
    }
    active.add(done)

    const travel = overlay.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.3 - 40}px) scale(1.03)`, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
    ], { duration: FLIGHT_MS, delay, easing: 'cubic-bezier(0.3, 0, 0.1, 1)', fill: 'both' })

    // ankippen, segeln, kurz in den Gegen-Tilt, gerade aufsetzen
    clone.animate([
      { rotate: '0deg' },
      { rotate: '5deg', offset: 0.18 },
      { rotate: '6.5deg', offset: 0.35 },
      { rotate: '-1deg', offset: 0.9 },
      { rotate: '0deg' },
    ], { duration: FLIGHT_MS, delay, easing: 'linear', fill: 'both' })

    travel.finished.then(done, done)
    // Fallback, falls die Animation nie „finished" meldet (Tab-Wechsel o. Ä.)
    window.setTimeout(done, delay + FLIGHT_MS + 250)
  }

  watch(ticketsByList, async (map) => {
    if (import.meta.server) return
    // Diff gegen den letzten Zustand: welche Karte hat die Spalte gewechselt?
    const moved: Array<{ id: string, listId: string }> = []
    for (const [listId, tickets] of map) {
      for (const ticket of tickets) {
        const before = previousList.get(ticket.$id)
        if (before && before !== listId && !localMoveIds.delete(ticket.$id)) {
          moved.push({ id: ticket.$id, listId })
        }
      }
    }
    previousList.clear()
    for (const [listId, tickets] of map) {
      for (const ticket of tickets) previousList.set(ticket.$id, listId)
    }

    if (!moved.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // flush 'pre': das DOM zeigt noch den ALTEN Zustand — Quell-Geometrie und
    // Klon jetzt sichern, nach nextTick hängt die Karte schon in der Zielspalte.
    // [data-incoming] MUSS ebenfalls vor dem Re-Render stehen: die FLIP-
    // Transition der Zielspalte startet mit dem Patch und liest die
    // Verzögerungs-Regel nur, wenn sie da schon gilt.
    const departures: Array<{ id: string, listId: string, from: DOMRect, clone: HTMLElement, column: Element | null }> = []
    for (const move of moved.slice(0, MAX_FLIGHTS)) {
      const el = cardEl(move.id)
      if (!el) continue
      const column = document.querySelector(`section[data-list="${move.listId}"] [data-cards]`)
      column?.setAttribute('data-incoming', '')
      departures.push({ ...move, from: el.getBoundingClientRect(), clone: el.cloneNode(true) as HTMLElement, column })
    }
    if (!departures.length) return

    await nextTick()
    departures.forEach((departure, index) => {
      const toEl = targetCardEl(departure.id, departure.listId)
      if (toEl) fly(departure.clone, departure.from, toEl, departure.column, index * 60)
      else departure.column?.removeAttribute('data-incoming')
    })
  }, { flush: 'pre' })

  // Laufende Flüge beim Verlassen der Seite aufräumen (Overlay + Sichtbarkeit)
  onBeforeUnmount(() => {
    for (const done of [...active]) done()
  })
}
