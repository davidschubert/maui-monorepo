<script setup lang="ts">
// marketing.css + die Licht-Dramaturgie wirken nur unter body.marketing-site —
// so bleiben etwaige Layer-Layouts (Login etc.) unberührt.
//
// ── DIE ADRESSLEISTE GEHÖRT ZUM BILD (F53, 2026-08-07) ────────────────────
// Auf dem Telefon ist die Browser-Leiste die größte Fläche, die diese Seite
// NICHT malt — ohne `theme-color` bleibt sie beim Standard des Browsers und
// steht als heller Balken über einer dunklen Seite. Die zwei Werte sind der
// Seitenanfang selbst: `--puka-cloud` je Modus (marketing.css), also genau der
// Ton, den auch der Kopf trägt (--puka-header-surface = cloud/0.72).
//
// EIN EINZIGER, MITDENKENDER EINTRAG — NICHT ZWEI MIT `media`. Der naheliegende
// Weg (je ein `<meta media="(prefers-color-scheme: …)">`) scheitert an unhead:
// beide Einträge tragen denselben Dedupe-Schlüssel (`meta:theme-color`, das
// `media`-Attribut geht darin NICHT ein), also überlebt ohne `key` nur der
// zweite. Mit `key` überleben zwar beide, aber `meta` steht nicht in unheads
// `DupeableTags` — die SSR-Auszeichnung `data-hid` wird deshalb gar nicht erst
// geschrieben, und beim Hydrieren findet der Client seine eigenen Einträge
// nicht wieder: gemessen standen danach VIER `theme-color`-Zeilen im Kopf, zwei
// davon tot (stabil, sie wuchsen nicht — richtig gerendert, trotzdem Unrat).
//
// Die Bindung an `colorMode` ist ohnehin die genauere Aussage: sie trifft auch
// den Fall, den eine Medienabfrage NIE ausdrücken kann — wer im Fuß bewusst
// gegen seine Systemeinstellung wählt (der Wähler steht dort seit B7).
// Serverseitig ist `colorMode.value` noch 'system' (plugin.server.js kennt die
// Wahl des Browsers nicht) und fällt damit auf Hell — genau das, was
// `fallback: 'light'` in nuxt.config.ts zusagt. Der Balken zieht also erst mit
// der Hydration nach; das ist eine Tönung, kein Inhalt.
const colorMode = useColorMode()

const THEME_COLOR = { light: '#f0f2f4', dark: '#131720' } as const

useHead({
  bodyAttrs: { class: 'marketing-site' },
  meta: [
    {
      name: 'theme-color',
      content: () => (colorMode.value === 'dark' ? THEME_COLOR.dark : THEME_COLOR.light),
    },
  ],
})
</script>

<template>
  <div>
    <MarketingHeader />
    <!--
      `UMain` statt der eigenen Flex-Schale (Paket 5). Die Schale hatte genau
      EINE Aufgabe: auf kurzen Seiten (z. B. /impressum) darf der Fuß nicht in
      der Mitte des Fensters kleben. `UMain` löst das mit
      `min-h-[calc(100vh - var(--ui-header-height))]` — dieselbe Wirkung ohne
      `min-height: 100vh` am Elternteil und ohne scoped CSS.
      Die Rechnung stimmt nur, weil BEIDE Seiten dieselbe Zahl lesen: der Kopf
      setzt --ui-header-height als `min-h` (puka-theme.css, dort auch die
      Messung). Die tone-*-Flächen stören sich daran nicht — sie liegen an den
      Sektionen INNERHALB von <main>, nicht an der Schale.
    -->
    <UMain>
      <slot />
    </UMain>
    <MarketingFooter />
  </div>
</template>
