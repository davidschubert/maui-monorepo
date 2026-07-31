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
        // MARKEN-TON AUF HELLEM GRUND = primary-600, NICHT primary-500
        // (Paket 2). `color="primary"` malt --ui-primary = puka-500 (#fbb337,
        // die Sonne) — als FLÄCHE richtig (der CTA), als TEXT auf den hellen
        // tone-*-Flächen unlesbar (Kontrast 1,7:1). Die Alt-Optik benutzte für
        // Text-Akzente konsequent --puka-sun-deep, und das IST puka-600.
        // Deshalb: überall dort, wo Nuxt UI die Primärfarbe als SCHRIFT setzt
        // (link-Buttons, subtle-Badges, subtle-Alerts), eine Stufe tiefer.
        {
          color: 'primary',
          variant: 'link',
          class: 'text-primary-600 hover:text-primary-700 active:text-primary-700',
        },
      ],
    },

    /**
     * OPTIK-VERTRAG DER MARKETING-KARTEN (Paket 2) — EINE Stelle für alle.
     *
     * Der Bestand war sechsmal dieselbe handgeschriebene Karte:
     *   background: hsl(0 0% 100% / .55–.65) · border: 1px hsl(ink / .07–.08)
     *   border-radius: 1rem · padding: 1.25–1.5rem
     * Ab jetzt ist das `UPageCard`. WARUM ALS `compoundVariants` UND NICHT ALS
     * `slots`: die gesuchten Eigenschaften (Fläche, Kante) setzt Nuxt UI selbst
     * in der VARIANTE (`outline` = `bg-default ring ring-default`). Ein
     * `slots`-Override landet in der Klassen-Kette VOR den Varianten — welche
     * Farbe gewinnt, entschiede dann tailwind-merge nach Reihenfolge, also
     * Zufall. `compoundVariants` werden hinten angehängt und gewinnen
     * deterministisch. Gleiches Muster wie beim sekundären CTA oben.
     *
     * Gebunden an `variant: 'outline'`, weil das der Default ist: eine Karte
     * ohne `variant`-Prop bekommt die Marketing-Optik automatisch, und wer
     * bewusst `soft`/`solid` wählt, bekommt bewusst etwas anderes.
     *
     * `rounded-lg` (Nuxt-UI-Basis) ist hier bereits 1rem — der Core setzt
     * `--ui-radius: 0.5rem` und Nuxt UI rechnet `lg = ui-radius * 2`. Der
     * Radius braucht deshalb KEINEN Override.
     */
    pageCard: {
      compoundVariants: [
        {
          variant: 'outline',
          class: {
            // Fläche wie im Bestand (hsl(0 0% 100% / .55–.65)).
            root: 'bg-white/65',
            container: 'p-5 sm:p-6',
            // Marketing-Karten tragen kräftigere Titel als Dashboard-Karten
            // (Bestand: 1,1–1,2rem / 700–800). Nuxt-UI-Default wäre 1rem/600.
            title: 'text-lg font-bold',
            // `text-muted` (neutral-500) wäre heller als der Bestand;
            // `text-toned` (neutral-600) trifft --puka-ink-soft praktisch exakt.
            description: 'text-toned',
            leadingIcon: 'size-8 text-primary-600',
          },
        },
        {
          // Die Haarlinie NUR für die gewöhnliche Karte. Der Ring ist bei
          // Nuxt UI auch der Träger der BETONUNG (`highlight` malt
          // `ring-2 ring-primary`) — stünde die Kantenfarbe im Block darüber,
          // überschriebe sie die Betonung und `highlight` wäre wirkungslos
          // (live erwischt auf /de/use-cases/coaches und /de/vs/*).
          // Der Farbwert kommt als fertiges Token aus puka-theme.css (Tailwind
          // kann für diese App keine eigenen Farb-Utilities bauen).
          variant: 'outline',
          highlight: false,
          class: { root: 'ring-[color:var(--puka-card-edge)]' },
        },
      ],
    },

    /**
     * Raster-Rhythmus der Seite. Nuxt-UI-Default ist `gap-8` (2rem) — die
     * Marketing-Raster standen durchweg auf 1,1rem. Die SPALTENZAHL bleibt
     * bewusst am Einsatzort (die Raster sind 2-, 3- und 4-spaltig), der
     * ABSTAND gehört hierher: er ist der Rhythmus der ganzen Seite.
     */
    pageGrid: {
      base: 'gap-[1.1rem]',
    },

    // Statuspillen: siehe „Marken-Ton auf hellem Grund" oben. `subtle` malt
    // die Schrift in der Basisfarbe — auf Weiß braucht es die 600er/700er
    // Stufe, damit die Pille lesbar bleibt (Bestand: sun-deep bzw. dunkelgrün).
    badge: {
      compoundVariants: [
        { color: 'primary', variant: 'subtle', class: 'bg-primary/20 text-primary-600' },
        { color: 'success', variant: 'subtle', class: 'bg-success/15 text-success-700' },
      ],
    },

    // Hinweis-Callouts: dieselbe Regel. Zusätzlich bleibt der FLIESSTEXT
    // neutral-dunkel (`text-highlighted`) — eine ganze Absatzfläche in der
    // Akzentfarbe wäre lauter als der Bestand, wo nur die Zeile darüber
    // farbig war.
    //
    // NUR `primary`: die Ehrlichkeits-Kästen der Seite (Entwurfs-Hinweis,
    // „Ehrlich zum Import", Early-Access, DSGVO-Disclaimer) sind
    // MARKEN-Hinweise, keine Warnungen — im Bestand allesamt --puka-sun.
    // Ein `warning`-Block stand hier kurz daneben; er ist entfallen, weil
    // kein Alert der Seite ihn benutzt und eine Statusfarbe als Markenton
    // genau die Zweckentfremdung wäre, die die Palette oben abgeschafft hat
    // (auf den kühlen tone-*-Flächen wirkt sie oliv-beige statt warm).
    alert: {
      compoundVariants: [
        {
          color: 'primary',
          variant: 'subtle',
          class: {
            root: 'bg-primary/15 text-highlighted ring-primary/30',
            icon: 'text-primary-600',
            title: 'text-primary-600',
          },
        },
      ],
    },
  },
})
