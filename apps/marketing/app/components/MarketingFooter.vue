<script setup lang="ts">
/**
 * Fußbereich der Marketing-Seite — `UFooter` + `UFooterColumns` (Paket 5).
 *
 * ══ REGEL FÜR ALLE INTERNEN LINKS DIESER APP ═══════════════════════════════
 * localePath IMMER mit dem Route-NAMEN aufrufen, nie mit einem rohen
 * Pfad-String. Fast jede Seite trägt je Sprache einen eigenen Pfad
 * (defineI18nRoute: /agb↔/terms, /dsgvo↔/gdpr, /produkte/*↔/products/* …).
 * Ein roher Pfad bekommt nur den Locale-Präfix davor, das Segment bleibt
 * deutsch — auf EN stünde dann /datenschutz im HTML, und das ist dort ein 404
 * (der Dev-Server meldet es als „No match found for location"). Auch bei
 * Seiten OHNE eigene Pfade (faq, vs/*, use-cases/*) den Namen nehmen: sonst
 * reißt die nächste defineI18nRoute-Ergänzung das Loch wieder auf.
 * EINZIGE Ausnahme: localePath('/') für die Startseite. ════════════════════
 */
import { type MarketingLocale, type ProductKey, slugForLocale } from '#shared/marketing'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const { start, demo } = useProductLinks()
const year = 2026 // statisch: Date.now() steht im Build nicht zur Verfügung

// Siehe MarketingHeader.vue für die Begründung beider Eigenschaften:
// `active: false` hält den Fuß frei von der Einfärbung der gerade offenen
// Seite (der Bestand kannte keinen aktiven Zustand), `locale: false` verbietet
// `ULink` das zweite Durchreichen eines schon aufgelösten Pfades.
const LINK_DEFAULTS = { active: false, locale: false } as const

function page(name: string, label: string) {
  return { ...LINK_DEFAULTS, label, to: localePath({ name }) }
}
/**
 * Produkt-Link am KANONISCHEN Schlüssel — der Slug in der Adresse ist seit
 * 2026-07-31 übersetzt (`kurse` ↔ `courses`) und kommt deshalb aus
 * shared/marketing.ts, nicht aus dem Schlüssel. Steht in einem `computed`, das
 * an `locale` hängt: der Fuß rechnet die Ziele beim Sprachwechsel neu.
 */
function product(key: ProductKey, label: string) {
  return {
    ...LINK_DEFAULTS,
    label,
    to: localePath({ name: 'produkte-slug', params: { slug: slugForLocale(key, locale.value) } }),
  }
}

/**
 * DER SPRACHWECHSLER (Davids Entscheidung 2026-07-31): er stand im Kopf und
 * steht jetzt HIER, unten rechts in der Basiszeile. Der Kopf gehört der einen
 * Handlung („Kostenlos starten"); die Sprache ist eine Einstellung, und
 * Einstellungen sucht man im Fuß.
 *
 * ER FÜHRT AUF DIE ÜBERSETZTE SEITE, nicht nach Hause. Auf
 * `/de/produkte/kurse` zeigt EN auf `/products/courses` — das kann
 * `switchLocalePath()` nur, weil die Produkt-Seite ihre Slugs vorher über
 * `useSetI18nParams()` hinterlegt (siehe pages/produkte/[slug].vue). Deshalb
 * ist das hier ein `computed` und keine Berechnung im Setup: der Fuß steht im
 * Layout, sein SETUP läuft also VOR dem der Seite — erst zur RENDER-Zeit (und
 * im Layout steht der Fuß hinter dem <slot/>) sind die Slugs gesetzt.
 *
 * OHNE HASH — dieselbe Begründung wie früher im Kopf: `switchLocalePath()`
 * hängt den Hash der aktuellen Adresse an, den der SERVER nie zu sehen bekommt
 * (er wird nicht mitgeschickt). Auf `/de#preise` stand serverseitig damit ein
 * anderes `href` im HTML als der Client danach berechnete — „Hydration
 * attribute mismatch", und Vue verwirft in der Entwicklung die ganze
 * Übereinstimmungsprüfung des Baums. Also fällt der Hash auf BEIDEN Seiten
 * weg: ein Sprachwechsel landet oben auf der Seite.
 *
 * `locale: false` aus LINK_DEFAULTS ist auch hier Pflicht — der Pfad ist schon
 * aufgelöst; ein zweiter Durchlauf durch `localePath()` machte aus dem
 * englischen Ziel `/` auf einer deutschen Seite wieder `/de`, der Eintrag wäre
 * also wirkungslos.
 *
 * „Deutsch" und „English" stehen BEWUSST im Code und nicht in i18n: es sind
 * Eigennamen in der jeweils EIGENEN Sprache (Endonyme), also in de.json und
 * en.json identisch. Genau dafür gilt im Projekt schon die Ausnahme der
 * Theme-Namen — ein Sprachwähler, der auf der englischen Seite „German" sagt,
 * hilft niemandem, der Deutsch sucht. Beschriftet ist der Auslöser trotzdem
 * übersetzt: sein `aria-label` kommt aus `marketing.footer.aria.language`.
 */
const LANGUAGES = [
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
] as const satisfies readonly { code: MarketingLocale, flag: string, label: string }[]

const currentLanguage = computed(() => LANGUAGES.find(l => l.code === locale.value) ?? LANGUAGES[1])

/**
 * BEWUSST GEWÖHNLICHE LINK-EINTRÄGE, kein `type: 'checkbox'`. Die
 * Checkbox-Bauform von Nuxt UI sieht nach „einer aus dieser Liste ist der
 * aktuelle" aus, rendert aber `DropdownMenu.CheckboxItem` STATT eines Links —
 * `to` wird dort nicht ausgewertet, das Menü wäre also hübsch und tot. Die
 * aktuelle Sprache wird deshalb über `current` markiert (Häkchen im
 * `#item-trailing`-Slot); gesagt wird sie ohnehin schon vom Auslöser, der die
 * aktuelle Sprache als Beschriftung trägt.
 */
const languageItems = computed(() => LANGUAGES.map(language => ({
  ...LINK_DEFAULTS,
  label: language.label,
  flag: language.flag,
  current: language.code === locale.value,
  to: (switchLocalePath(language.code) || '/').split('#')[0],
})))

/**
 * FÜNF EIGENE `UFooterColumns` STATT EINER MIT FÜNF SPALTEN — wegen der
 * Landmarken. Der Bestand hatte fünf `<nav>` mit je eigenem `aria-label`;
 * mehrere Navigations-Landmarken auf einer Seite MÜSSEN unterscheidbar
 * benannt sein, sonst hört ein Screenreader fünfmal „Navigation". Ein
 * einzelnes `UFooterColumns` rendert aber genau EIN `<nav>` und hat für die
 * Spalten keinen eigenen Beschriftungs-Weg.
 * Das Raster liegt deshalb außen (eine Reihe Tailwind-Stufen, exakt die
 * Breakpoints des Bestands) und jede Spalte ist ein eigenes `<nav>`.
 */
const columns = computed(() => [
  {
    aria: t('marketing.footer.aria.product'),
    label: t('marketing.footer.colProduct'),
    children: [
      { ...LINK_DEFAULTS, label: t('marketing.footer.start'), to: start },
      { ...LINK_DEFAULTS, label: t('marketing.footer.demo'), to: demo },
      product('diskussionen', t('marketing.footer.featDiscussions')),
      product('kurse', t('marketing.footer.featCourses')),
      product('events', t('marketing.footer.featEvents')),
      product('branding', t('marketing.footer.featBranding')),
      page('faq', t('marketing.footer.faq')),
      page('glossar', t('marketing.footer.glossary')),
    ],
  },
  {
    aria: t('marketing.footer.aria.compare'),
    label: t('marketing.footer.colCompare'),
    children: [
      { ...LINK_DEFAULTS, label: t('marketing.footer.vsCircle'), to: localePath({ name: 'vs-slug', params: { slug: 'circle' } }) },
      { ...LINK_DEFAULTS, label: t('marketing.footer.vsSkool'), to: localePath({ name: 'vs-slug', params: { slug: 'skool' } }) },
      { ...LINK_DEFAULTS, label: t('marketing.footer.vsMighty'), to: localePath({ name: 'vs-slug', params: { slug: 'mighty-networks' } }) },
      page('wechseln', t('marketing.footer.switchPage')),
    ],
  },
  {
    aria: t('marketing.footer.aria.useCases'),
    label: t('marketing.footer.colUseCases'),
    children: [
      { ...LINK_DEFAULTS, label: t('marketing.footer.forCoaches'), to: localePath({ name: 'use-cases-slug', params: { slug: 'coaches' } }) },
      { ...LINK_DEFAULTS, label: t('marketing.footer.forCourses'), to: localePath({ name: 'use-cases-slug', params: { slug: 'kurse' } }) },
      { ...LINK_DEFAULTS, label: t('marketing.footer.forCreator'), to: localePath({ name: 'use-cases-slug', params: { slug: 'creator' } }) },
      { ...LINK_DEFAULTS, label: t('marketing.footer.forClubs'), to: localePath({ name: 'use-cases-slug', params: { slug: 'vereine' } }) },
    ],
  },
  {
    aria: t('marketing.footer.aria.company'),
    label: t('marketing.footer.colCompany'),
    children: [
      { ...LINK_DEFAULTS, label: t('marketing.footer.story'), to: localePath('/') },
      page('dsgvo', t('marketing.footer.privacyHow')),
      { ...LINK_DEFAULTS, label: t('marketing.footer.changelog'), to: 'https://changelog.pukalani.app' },
      // Die Statusseite liegt bewusst NICHT bei uns: sie muss antworten, wenn
      // unser Server es nicht tut.
      { ...LINK_DEFAULTS, label: t('marketing.footer.status'), to: 'https://status.pukalani.app', rel: 'noopener' },
    ],
  },
  {
    // Rechtstexte liegen auf DIESER Domain (Impressumspflicht), nicht als Link
    // auf my.pukalani.app.
    aria: t('marketing.footer.aria.legal'),
    label: t('marketing.footer.colLegal'),
    children: [
      page('datenschutz', t('marketing.footer.privacy')),
      page('impressum', t('marketing.footer.imprint')),
      page('agb', t('marketing.footer.terms')),
    ],
  },
])

/**
 * HELLE SCHRIFT AUF DUNKLEM GRUND — dieselbe Umrechnung wie beim Abschluss-CTA
 * in Paket 3: der Bestand malte die Links in --puka-cloud / 0.85 und die
 * Spalten-Überschriften in --puka-mist / 0.6; `text-inverted` IST im Hellmodus
 * reines Weiß und nimmt einen späteren Palettenwechsel mit. Nuxt UIs Vorgaben
 * (`text-muted` = neutral-500, `border-default` = neutral-200) sind für HELLE
 * Flächen gerechnet und wären hier grau bzw. grell.
 *
 * `whitespace-normal` ist Pflicht: die Vorgabe setzt `truncate` und schnitte
 * „Wie wir Datenschutz umsetzen" mit „…" ab (der Bestand bricht die Zeile um).
 * `font-normal` an der Überschrift ebenso — Tailwinds Preflight stellt <h3>
 * auf `font-weight: inherit`, der Bestand steht also auf 400, nicht auf 600.
 */
const COLS_UI = {
  // Ein LEERER String räumt NICHTS weg — tv hängt Klassen an, es ersetzt sie
  // nicht. `UFooterColumns` bringt für den Mehrspalten-Fall ein eigenes Raster
  // mit (`root: xl:grid xl:grid-cols-3`, `center: flex lg:grid grid-flow-col
  // auto-cols-fr`), und das lag hier ÜBER dem Raster außen: ab 1280px wurde
  // jede Spalte auf zwei Drittel ihrer Spur eingeschnürt, die Links brachen
  // auf zwei Zeilen um (gemessen: 110px statt 180px, Fuß 104px höher).
  // Weggeräumt wird eine Anzeige-Art nur durch eine ANDERE Anzeige-Art — und
  // je Stufe einzeln.
  root: 'xl:block',
  center: 'block lg:block',
  label: 'text-[0.78rem] font-normal uppercase tracking-[0.1em] text-inverted/60',
  list: 'mt-2 space-y-2.5',
  link: 'items-start text-[0.95rem] font-normal text-inverted/85 hover:text-primary',
  linkLabel: 'whitespace-normal leading-[1.45]',
}

const FOOTER_UI = {
  root: 'pb-8 pt-[clamp(3rem,6vw,5rem)]',
  // `lg:py-0` muss dabeistehen: die Vorgabe ist `py-8 lg:py-12`, und eine
  // unpräfixierte Klasse räumt nur die unpräfixierte weg (gemessen: der Fuß
  // trug ab 1024px 96px Luft, die der Bestand nicht hat).
  top: 'py-0 lg:py-0',
  // Die Basiszeile: 72rem Inhalt + 1,5rem Rand, Trennlinie darüber
  // (Bestand `.mkt-footer-base`).
  container: [
    'max-w-[75rem] mt-10 py-0 pt-6 lg:py-0 lg:pt-6',
    'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 lg:gap-x-6',
    'border-t border-white/12 text-[0.85rem] text-inverted/60',
  ].join(' '),
  // `order-*` OHNE Präfix ist Pflicht: die Vorgabe ordnet die Basiszeile erst
  // ab 1024px (`lg:order-1/3`) und rendert im Markup RECHTS ZUERST — darunter
  // stand das Copyright rechts und der Aloha-Satz links, also spiegelverkehrt
  // zum Bestand.
  left: 'order-1 mt-0 justify-start lg:flex-none',
  center: 'hidden',
  // `gap-3` ist neu (Paket „Sprachwechsler in den Fuß", 2026-07-31): rechts
  // stehen jetzt ZWEI Dinge nebeneinander — der Aloha-Satz und das Sprachmenü.
  right: 'order-3 mt-0 items-center gap-3 justify-end lg:flex-none',
}
</script>

<template>
  <UFooter class="tone-ink" :ui="FOOTER_UI">
    <!-- Der obere Block trägt seinen Breiten-Container selbst: `UFooter` legt
         nur um die BASISZEILE einen `UContainer`, der `#top`-Slot bekommt
         keinen. 75rem = 72rem Inhalt + die 1,5rem Seitenrand des Bestands. -->
    <template #top>
      <UContainer class="max-w-[75rem]">
        <!-- ALLE STUFEN ARBITRÄR (`min-[…]`), KEINE EINZIGE BENANNTE — und das
             ist keine Marotte: Tailwind stellt in seiner Ausgabe sämtliche
             arbiträren Breiten-Regeln VOR die benannten (`sm:`, `md:`, `lg:`),
             egal wie groß der Wert ist (nachgemessen: min-[1150px] steht bei
             Zeichen 206999, sm: erst bei 207290). Ein einziges `sm:` in dieser
             Kette schlüge deshalb alle vier Stufen darüber — der Fuß stand
             genau so mit zwei statt fünf Spalten da. Untereinander sind die
             arbiträren Stufen aufsteigend sortiert, also stimmt die Kette.
             Breakpoints wie im Bestand: 1 · 2 (640) · 4 (900) · 5 (1150).
             Die Spuren stehen ausgeschrieben statt als `repeat(n,1fr)`:
             für ein arbiträres Maß mit Komma erzeugt Tailwind keine Regel. -->
        <div class="grid grid-cols-1 gap-10 min-[640px]:grid-cols-2 min-[900px]:grid-cols-[1.5fr_1fr_1fr_1fr] min-[1150px]:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div>
            <div class="flex items-center gap-2">
              <PukaMark :size="24" />
              <span class="text-[1.1rem] font-extrabold text-inverted">Pukalani</span>
            </div>
            <p class="mt-3 max-w-[22rem] text-[0.95rem]/[1.55] text-inverted/75">
              {{ t('marketing.footer.tagline') }}
            </p>
            <!-- Die Anführungszeichen stehen IM i18n-Text: „…" ist deutsche
                 Typografie, EN setzt “…”. -->
            <p class="mt-3 text-[0.95rem] italic text-primary">
              {{ t('marketing.footer.refrain') }}
            </p>
          </div>

          <UFooterColumns
            v-for="column in columns" :key="column.label"
            as="nav" :aria-label="column.aria"
            :columns="[column]"
            :ui="COLS_UI"
          />
        </div>
      </UContainer>
    </template>

    <template #left>
      <span>© {{ year }} Pukalani. {{ t('marketing.footer.rights') }}</span>
    </template>

    <!-- Basiszeile rechts: der Aloha-Satz und ganz außen der Sprachwechsler.
         `side: 'top'` ist hier keine Geschmacksfrage — unter dem Fuß ist die
         Seite zu Ende, ein nach unten aufklappendes Menü fiele aus dem Bild
         und schöbe die Seite länger. -->
    <template #right>
      <span>{{ t('marketing.footer.madeIn') }}</span>
      <UDropdownMenu
        :items="languageItems"
        :content="{ side: 'top', align: 'end', sideOffset: 8 }"
        :ui="{ itemLeadingIcon: 'hidden' }"
      >
        <UButton
          color="neutral" variant="ghost" size="sm"
          trailing-icon="i-ph-caret-down-bold"
          :aria-label="t('marketing.footer.aria.language')"
          class="gap-1.5 px-2 text-[0.85rem] font-semibold"
        >
          <!-- Die Flagge ist Zierde, kein Inhalt: sie wiederholt nur, was
               direkt daneben steht. Ein Screenreader soll „Deutsch" sagen und
               nicht „Flagge Deutschland Deutsch". -->
          <span class="text-[1.05rem] leading-none" aria-hidden="true">{{ currentLanguage.flag }}</span>
          {{ currentLanguage.label }}
        </UButton>

        <template #item-leading="{ item }">
          <span class="text-[1.05rem] leading-none" aria-hidden="true">{{ item.flag }}</span>
        </template>
        <template #item-trailing="{ item }">
          <UIcon v-if="item.current" name="i-ph-check-bold" class="size-3.5 text-primary-600" />
        </template>
      </UDropdownMenu>
    </template>
  </UFooter>
</template>
