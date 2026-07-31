export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Die Marketing-Seite
  // ist öffentlich + datensparsam — keine Analytics, kein Consent, kein Auth.
  maui: {},
  ui: {
    colors: {
      // Die Marke ist die Sonne, nicht eine Statusfarbe: `puka` ist die eigene
      // 11-stufige Palette aus app/assets/css/puka-theme.css. Damit malt
      // color="primary" den CTA-Ton, und die Seite muss die Statusfarbe
      // `warning` nicht länger als Markenfarbe zweckentfremden.
      primary: 'puka',
      // `neutral` bleibt BEWUSST auf dem Core-Wert `mist`: die Neutral-Ramp
      // färbt Text, Ränder und Flächen JEDER Nuxt-UI-Komponente. Ein Wechsel
      // auf einen --puka-ink-nahen Ton wäre eine sichtbare Änderung an der
      // ganzen Seite — die gehört in ein eigenes Paket, nicht in die
      // Theme-Brücke.
    },
    button: {
      compoundVariants: [
        {
          // SEKUNDÄRER CTA auf HELLEM Grund (color="neutral" variant="outline").
          //
          // Kontrast-Zweck (übernommen aus dem alten !important-Block in
          // HeroSection.vue): die Ghost-Variante war dort doppelt schwach —
          // viel zu helle Schrift (unlesbar) UND ohne Kante nicht als Button
          // erkennbar. Deshalb: sichtbare Kante + Ink-Text (hoher Kontrast);
          // beim Hover wechselt NUR die Fläche, nicht die Textfarbe — ein
          // Farbwechsel nach Orange lag mit 2,8:1 unter der Lesbarkeitsschwelle.
          //
          // WARUM `border` UND NICHT nur der Ring: Nuxt UI zeichnet die
          // outline-Variante per Ring (box-shadow, ohne Platzbedarf). Der
          // sekundäre CTA steht neben dem primären — ohne die 1px-Kante ist er
          // 2px kleiner und die beiden Buttons stehen sichtbar ungleich hoch
          // (gemessen: 42px vs. 40px). Der Ring bleibt daneben stehen, genau wie
          // bisher.
          //
          // Die Farbwerte kommen als fertige --puka-cta-*-Tokens aus
          // app/assets/css/puka-theme.css (Tailwind kann für diese App keine
          // eigenen Farb-Utilities bauen — Begründung dort).
          color: 'neutral',
          variant: 'outline',
          class: [
            'font-semibold',
            'text-(--puka-cta-ink)',
            'bg-(--puka-cta-surface)',
            'border border-[color:var(--puka-cta-edge)]',
            'hover:bg-(--puka-cta-surface-hover)',
            'hover:border-[color:var(--puka-cta-edge-hover)]',
            'active:bg-(--puka-cta-surface-hover)',
          ].join(' '),
        },
      ],
    },
  },
})
