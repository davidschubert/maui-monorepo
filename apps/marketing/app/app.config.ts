export default defineAppConfig({
  // App-spezifische Overrides (tiefer Merge, App > Core). Die Marketing-Seite
  // ist öffentlich + datensparsam — keine Analytics, kein Consent, kein Auth.
  pukalani: {},
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
        {
          // SEKUNDÄRER CTA auf DUNKLEM Grund (Paket 3). Gegenstück zum
          // outline-Block ganz oben: die Abschluss-CTAs stehen auf `tone-ink`,
          // und dort ist `ghost`+`neutral` in der Voreinstellung `text-muted`
          // (neutral-500) — auf dem dunklen Grund praktisch unlesbar. Der
          // Bestand malte diesen Knopf in --puka-cloud, also nahezu Weiß;
          // `text-inverted` IST im Hellmodus reines Weiß und nimmt einen
          // späteren Palettenwechsel mit.
          // Die Hover-FLÄCHE muss ebenfalls gedreht werden: `hover:bg-elevated`
          // (neutral-100) wäre auf Dunkel ein greller weißer Block.
          color: 'neutral',
          variant: 'ghost',
          class: 'text-inverted hover:bg-inverted/10 hover:text-inverted active:bg-inverted/10',
        },
      ],
    },

    /**
     * BREITE UND RAND DER SEITE (Paket 3) — der eine Container.
     *
     * Jeder Page*-Baustein (PageHero, PageCTA, PageSection) setzt seinen Inhalt
     * in einen `UContainer`. Dessen Voreinstellung (80rem, px-4 sm:px-6 lg:px-8)
     * ist breiter und am Rand unruhiger als der Bestand dieser Seite:
     * `.mkt-inner` = 68rem, Sektionsrand konstant 1,5rem auf allen Breiten.
     * Hier steht der RAND; die BREITE steht als `--ui-container` in
     * puka-theme.css (dort gehört sie hin, weil sie eine Farb-/Maß-Variable des
     * Seiten-Themes ist und nicht eine Klassenkette).
     *
     * WARUM app-weit UND NICHT je Baustein: `UContainer` wird in dieser App
     * ausschließlich von den Marketing-Sektionen benutzt (Kopf, Fuß und
     * CoreErrorPage bauen ihre Breite selbst). Ein `px-6` je Aufrufstelle
     * bekäme das ohnehin nicht sauber hin — `px-6` allein löscht nur `px-4` und
     * ließe `sm:px-6 lg:px-8` stehen (tailwind-merge räumt nur innerhalb
     * derselben Breakpoint-Stufe auf).
     */
    container: {
      // `lg:px-6` muss dabeistehen: die Vorgabe hebt den Rand ab 1024px auf
      // 2rem, und eine unpräfixierte Klasse kommt in Tailwinds Ausgabe VOR den
      // Breakpoint-Klassen — sie könnte `lg:px-8` gar nicht schlagen.
      // (`sm:px-6` der Vorgabe ist zufällig schon der richtige Wert.)
      base: 'w-full max-w-(--ui-container) mx-auto px-6 lg:px-6',
    },

    /**
     * OPTIK-VERTRAG DER HEROS (Paket 3) — EINE Stelle für acht Kopfbereiche.
     *
     * Der Bestand war achtmal derselbe handgeschriebene Kopf: Sektion mit
     * `tone-*`-Grund und `clamp()`-Polsterung, darin ein 46rem-Textblock aus
     * Kicker · H1 · Lead. Ab jetzt ist das `UPageHero`.
     *
     * WARUM DIE MASSE AN JEDEM BREAKPOINT WIEDERHOLT WERDEN (`sm:`, `lg:`):
     * die Vorgaben sind selbst gestuft (`py-24 sm:py-32 lg:py-40`,
     * `text-5xl sm:text-7xl`). tailwind-merge räumt nur INNERHALB einer Stufe
     * auf, und eine unpräfixierte Klasse steht in Tailwinds Ausgabe VOR den
     * Breakpoint-Klassen — sie könnte `sm:text-7xl` also selbst dann nicht
     * schlagen, wenn sie überlebt. Der WERT steht deshalb einmal als
     * `--mkt-*`-Variable in puka-theme.css; hier wiederholt sich nur die Stufe.
     *
     * WARUM `compoundVariants` UND NICHT NUR `slots` (Lehre aus Paket 2):
     * `slots` landen VOR den Varianten in der Klassenkette. Alles, was eine
     * Variante ebenfalls setzt — Ausrichtung (`orientation`), Beschreibungs-
     * Abstand (`title`) — muss deshalb hierher, sonst entscheidet die
     * Reihenfolge und damit der Zufall.
     */
    pageHero: {
      slots: {
        // Die puka-Lichtkreise sind absolut positioniert und dürfen über den
        // Sektionsrand hinaus gerechnet, aber nicht gezeichnet werden
        // (Bestand: `overflow: clip` an jeder Hero-Sektion).
        root: 'overflow-clip',
        // `relative` ist PFLICHT, nicht Kosmetik: der Lichtkreis liegt als
        // absolut positioniertes Geschwister VOR dem Container im DOM.
        // Positionierte Elemente malen über nicht-positionierte Blöcke — ohne
        // `relative` läge der Glow ÜBER der Überschrift.
        container: [
          'relative',
          'pt-(--mkt-hero-pt) sm:pt-(--mkt-hero-pt) lg:pt-(--mkt-hero-pt)',
          'pb-(--mkt-hero-pb) sm:pb-(--mkt-hero-pb) lg:pb-(--mkt-hero-pb)',
          // Bestand `.hero-inner`: 3rem, ab 900px 3,5rem.
          'gap-12 sm:gap-y-12 lg:gap-14',
        ].join(' '),
        // `.mkt-inner.mkt-narrow` = 46rem, mittig — der Textblock der
        // Unterseiten-Heros. Der zweispaltige Startseiten-Hero hebt die
        // Schranke auf (`max-w-none`), weil seine Spalte selbst schon misst.
        //
        // `w-full` ist PFLICHT neben `mx-auto`: der Container ist ab 1024px ein
        // Grid, und ein Grid-Element mit `margin-inline: auto` verliert sein
        // `justify-self: stretch` — es misst sich dann am INHALT. Auf /faq war
        // der Textblock dadurch 656px statt 736px breit und saß 40px zu weit
        // rechts; Seiten mit längerem Text fielen nicht auf, weil sie ohnehin
        // an die Schranke stießen. Mit `w-full` misst er die Spur und wird
        // erst danach von `max-w` beschnitten.
        wrapper: 'mx-auto w-full max-w-[46rem]',
        title: 'text-(length:--mkt-hero-title) sm:text-(length:--mkt-hero-title) font-[850] leading-[1.06] tracking-[-0.02em] text-balance',
        // `.mkt-lead`: 1,05–1,25rem / 1.6 / --puka-ink-soft ≈ `text-toned`
        // (neutral-600, in Paket 2 als Treffer belegt).
        description: 'text-(length:--mkt-lead) sm:text-(length:--mkt-lead) leading-[1.6] text-toned max-w-[42rem]',
        // Der „Augenbrauen"-Bereich über der H1. Er trägt hier NUR den Abstand
        // (Bestand: Kicker, dann H1 mit `margin-top: 0.5rem`) — die Typografie
        // des Kickers steht als `.mkt-kicker` in marketing.css und wird von
        // acht weiteren Sektionen geteilt; eine zweite Definition hier wäre
        // genau die Doppelpflege, die Paket 1/2 abgebaut haben.
        // Jeder Hero füllt den Bereich per `#headline`-SLOT statt per
        // Eigenschaft: die Unterseiten stellen den Zurück-Link über den
        // Kicker, und einen eigenen Slot dafür gibt es nicht (`#top` läge
        // außerhalb des Breiten-Containers).
        headline: 'mb-2',
        // Bestand `.hero-cta`: `margin: 2rem 0 1.75rem`, `gap: 0.85rem`.
        footer: 'mt-8',
        links: 'gap-x-3.5 gap-y-3.5',
      },
      compoundVariants: [
        {
          // Die Heros dieser Seite sind LINKSBÜNDIG. Nuxt UI zentriert die
          // senkrechte Bauform (`wrapper: text-center`, `links: justify-center`,
          // `description: text-balance`) — das ist der Vorgabe-Geschmack für
          // eine Produkt-Landingpage, nicht der dieser Seite: hier steht links
          // der Text und rechts (auf der Startseite) das Produktbild, und die
          // Unterseiten führen mit einem linksbündigen Zurück-Link.
          orientation: 'vertical',
          class: {
            // `lg:grid-cols-1` ist keine Kosmetik: der Container ist ab 1024px
            // ein Grid, und die senkrechte Bauform legt KEINE Spalten fest.
            // Eine implizite Spalte misst sich am Inhalt — der Textblock wurde
            // dadurch so breit wie seine längste Zeile (gemessen: 656px statt
            // 736px) und der Umbruch stand woanders als im Bestand.
            container: 'lg:grid-cols-1',
            wrapper: 'text-left',
            links: 'justify-start',
            description: 'text-pretty',
          },
        },
        {
          // Nuxt UI setzt zwischen Titel und Lead `mt-6` (1,5rem); der Bestand
          // hat dort 1rem (`margin: 0.5rem 0 1rem` an jedem Hero-Titel).
          title: true,
          class: { description: 'mt-4' },
        },
      ],
    },

    /**
     * OPTIK-VERTRAG DER ABSCHLUSS-CTAs (Paket 3) — EINE Stelle für acht Blöcke.
     *
     * Der Bestand war achtmal derselbe dunkle Schlussblock: `tone-ink`,
     * mittig, Zeichen · H2 · Lead · Knopf. Sieben davon teilten sich schon die
     * `.mkt-cta-*`-Klassen in marketing.css, die Startseite hatte ihre eigene
     * Kopie. Ab jetzt ist das `UPageCTA`.
     *
     * `defaultVariants.variant = 'naked'`: die Vorgabe `outline` malt eine
     * eigene Fläche samt Ring — hier malt die `tone-ink`-Klasse (das Bildmotiv
     * der Licht-Dramaturgie, kein UI-Baustein). „naked" heißt auf dieser Seite
     * also: der Grund kommt von der Dramaturgie, die Schrift von hier. Weil
     * ALLE acht Blöcke dunkel sind, sind die hellen Schriftfarben unten an
     * genau diese Variante gebunden und nicht an `slots` — ein späterer heller
     * CTA (`variant="soft"` o. ä.) bekäme dann wieder die Vorgabe-Farben.
     */
    pageCTA: {
      slots: {
        // Der Bestand ist ein randloses Band über die volle Breite; die
        // Vorgabe `rounded-xl` wäre eine schwebende Karte.
        root: 'rounded-none overflow-clip',
        // `relative` aus demselben Grund wie beim Hero (Lichtkreis im
        // `#top`-Slot). Polsterung = `.mkt-cta-block` (senkrecht) bzw. der
        // konstante 1,5rem-Seitenrand der Seite — die Vorgabe zieht ihn ab
        // 640px auf 3rem und ab 1024px auf 4rem hoch.
        container: [
          'relative',
          'py-(--mkt-cta-py) sm:py-(--mkt-cta-py) lg:py-(--mkt-cta-py)',
          'px-6 sm:px-6 lg:px-6',
          'gap-8 sm:gap-8',
        ].join(' '),
        // `.mkt-cta-inner` war `.mkt-inner.mkt-narrow` — 46rem, mittig.
        // `w-full` aus demselben Grund wie beim Hero (siehe dort).
        wrapper: 'mx-auto w-full max-w-[46rem]',
        // `tracking-normal` muss explizit dabeistehen: die Vorgabe zieht die
        // Überschrift mit `tracking-tight` (−0,025em) zusammen, die sieben
        // Unterseiten-CTAs standen im Bestand aber auf normaler Laufweite
        // (gemessen: die Zeile war dadurch 32px schmaler). Der Startseiten-CTA
        // setzt seine eigenen −0,02em wieder darüber.
        title: 'text-(length:--mkt-cta-title) sm:text-(length:--mkt-cta-title) font-[850] tracking-normal text-inverted text-balance',
        // `.mkt-cta-lead` erbt die Grundschriftgröße (1rem); die Vorgabe hebt
        // sie ab 640px auf 1,125rem.
        description: 'text-base sm:text-base',
        // `.mkt-cta-btn { margin-top: 1.75rem }`
        footer: 'mt-7',
        links: 'gap-x-3.5 gap-y-3.5',
      },
      compoundVariants: [
        {
          // Auf dunklem Grund kehren sich die Textfarben um: die Vorgabe
          // `text-muted` (neutral-500) ist dort ein Grau, das kaum vom Grund
          // abhebt. Der Bestand malte den Lead in --puka-mist / 0.85 — reines
          // Weiß bei 80 % trifft denselben Wert und bleibt an der Theme-Achse.
          variant: 'naked',
          class: { description: 'text-inverted/80' },
        },
        {
          // Gleiche Falle wie beim Hero: ohne feste Spaltenzahl misst sich die
          // implizite Grid-Spalte am Inhalt statt an der verfügbaren Breite.
          // `text-pretty` statt `text-balance` am Lead: der Bestand ließ ihn
          // normal umbrechen. `balance` verteilt die Zeilen gleichmäßig und
          // brach den Startseiten-Lead sichtbar früher um („… in 60 Sekunden
          // steht | deine Community" statt „… deine Community. | Kostenlos").
          // Am TITEL bleibt `balance` — dort hatte ihn auch der Bestand.
          orientation: 'vertical',
          class: { container: 'lg:grid-cols-1', description: 'text-pretty' },
        },
        {
          // Bestand: Titel mit `margin-bottom: 0.6rem` zum Lead (Vorgabe: 1,5rem).
          title: true,
          class: { description: 'mt-2.5' },
        },
      ],
      defaultVariants: {
        variant: 'naked',
      },
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
