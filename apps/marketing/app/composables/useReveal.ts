/**
 * Scroll-getriggerte Enthüllung (Konzept §6.5): Inhalte mit [data-reveal]
 * blenden beim Erreichen sanft ein — wie ein Schnitt. Zusätzlich fährt das
 * Licht-Motiv ([data-parallax]) minimal langsamer als der Vordergrund (Tiefe).
 *
 * Strikt reduced-motion-respektierend: bei `prefers-reduced-motion: reduce`
 * passiert NICHTS (die CSS zeigt die Inhalte ohnehin sofort). Rein clientseitig.
 */
export function useReveal() {
  onMounted(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    // Reveal-Beobachter: einmalig einblenden, dann entkoppeln.
    const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (revealEls.length) {
      // Fallback: was beim Laden schon (nahezu) im Viewport steht, sofort
      // einblenden — der Above-the-fold-Inhalt darf nie unsichtbar hängen
      // bleiben (LCP + Robustheit gegen Observer-Timing).
      const vh = window.innerHeight
      for (const el of revealEls) {
        if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add('is-revealed')
      }
      const io = new IntersectionObserver((entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            obs.unobserve(entry.target)
          }
        }
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 })
      for (const el of revealEls) {
        if (!el.classList.contains('is-revealed')) io.observe(el)
      }
      onBeforeUnmount(() => io.disconnect())
    }

    // Licht-Parallax: die puka/der Himmel bewegt sich etwas langsamer.
    const parallaxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'))
    if (parallaxEls.length) {
      let ticking = false
      const onScroll = () => {
        if (ticking) return
        ticking = true
        requestAnimationFrame(() => {
          const y = window.scrollY
          for (const el of parallaxEls) {
            const factor = Number(el.dataset.parallax || '0.15')
            el.style.transform = `translate3d(0, ${Math.round(y * factor)}px, 0)`
          }
          ticking = false
        })
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      onScroll()
      onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
    }
  })
}
