/**
 * Sanftes Einfügen/Entfernen in Listen (TransitionGroup mit :css="false"):
 * das Element WÄCHST von 0 auf seine Höhe (inkl. Margins) und faded dabei
 * ein — die Nachbarn gleiten mit, statt hart zu springen. Kein CSS-move
 * nötig (die Höhenänderung schiebt das Layout von selbst weich).
 *
 * WAAPI statt CSS-Klassen: die Zielhöhe ist erst zur Laufzeit bekannt.
 * Respektiert prefers-reduced-motion (dann sofort fertig).
 */

const DURATION = 300
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function expandEnter(element: Element, done: () => void) {
  const el = element as HTMLElement
  if (reducedMotion() || typeof el.animate !== 'function') return done()

  const style = getComputedStyle(el)
  const height = `${el.offsetHeight}px`
  const marginTop = style.marginTop
  const marginBottom = style.marginBottom

  el.style.overflow = 'hidden'
  const animation = el.animate([
    { height: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 },
    { height, marginTop, marginBottom, opacity: 0.4, offset: 0.6 },
    { height, marginTop, marginBottom, opacity: 1 },
  ], { duration: DURATION, easing: EASING })
  const finish = () => {
    el.style.overflow = ''
    done()
  }
  animation.onfinish = finish
  animation.oncancel = finish
}

export function expandLeave(element: Element, done: () => void) {
  const el = element as HTMLElement
  if (reducedMotion() || typeof el.animate !== 'function') return done()

  const style = getComputedStyle(el)
  const height = `${el.offsetHeight}px`
  const marginTop = style.marginTop
  const marginBottom = style.marginBottom

  el.style.overflow = 'hidden'
  const animation = el.animate([
    { height, marginTop, marginBottom, opacity: 1 },
    { height, marginTop, marginBottom, opacity: 0, offset: 0.4 },
    { height: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 },
  ], { duration: DURATION * 0.8, easing: EASING })
  animation.onfinish = done
  animation.oncancel = done
}
