<script setup lang="ts">
// Szene 5 — Wendung: die Welt gehorcht DIR (§6.4). Ein kleiner interaktiver
// Umschalter „nur Kurse / Community / alles" macht das Modulare greifbar.
const { t } = useI18n()

// Sprach-neutrale Block-Ids + Preset-Zugehörigkeit; Labels via i18n.
const ALL_BLOCK_IDS = ['discussions', 'moderation', 'feed', 'courses', 'events'] as const
const PRESET_DEFS = [
  { key: 'only', on: ['discussions', 'moderation'] },
  { key: 'community', on: ['discussions', 'feed', 'events'] },
  { key: 'all', on: ['feed', 'courses', 'events', 'discussions'] },
] as const

const presets = computed(() =>
  PRESET_DEFS.map(p => ({
    value: p.key,
    label: t(`marketing.modular.presets.${p.key}`),
    on: new Set<string>(p.on),
  })),
)
const allBlocks = computed(() => ALL_BLOCK_IDS.map(id => ({ id, label: t(`marketing.modular.blocks.${id}`) })))
const active = ref<string | number>('only')

/**
 * DIE PILLE IST JETZT EIN ECHTES REITER-PAAR (Paket 5). Der Bestand war
 * `role="tablist"` mit drei `role="tab"` — UND OHNE EIN EINZIGES `tabpanel`.
 * Das ist kaputte Semantik: `aria-selected` verspricht einen Bereich, den es
 * nicht gibt, und die Chip-Fläche darunter war für Hilfstechnik nur eine
 * beliebige Liste ohne Bezug zum gewählten Reiter.
 * `UTabs` MIT Inhalt (`content` bleibt an) räumt beides auf: Reka verknüpft
 * Reiter und Fläche über `aria-controls`/`aria-labelledby` und liefert
 * Pfeiltasten-Navigation. Die Chip-Fläche bleibt dabei genau da, wo sie war —
 * als eigene Fläche UNTER der Leiste; sie ist jetzt nur der Inhalt des
 * Reiters statt eines Nachbarn ohne Verbindung.
 *
 * Die drei `in-[…]`-Zeilen sind dieselbe Falle wie beim Intervall-Umschalter
 * der Preise (Paket 4): der Indicator misst seine Breite im Browser und wird
 * serverseitig GAR NICHT gerendert, die Vorgabe malt die aktive Fläche dann
 * über ein ::before am Reiter. Ohne die Zeilen zeigt der erste Bildaufbau eine
 * voll orange Pille mit weißer Schrift und springt bei der Hydration auf die
 * weiße Fläche des Bestands um. Die lange Bedingungskette ist NICHT
 * schmückend — nur mit ihr erkennt tailwind-merge die Dopplung und wirft die
 * Vorgabe raus; jede Klasse steht ausgeschrieben da, weil Tailwinds Scanner
 * zusammengesetzte Strings nicht findet.
 */
const TRIGGER_CLASS = [
  'grow-0 rounded-full px-4 py-[0.45rem] text-[0.9rem] font-semibold',
  'data-[state=inactive]:text-toned data-[state=active]:text-primary-600',
  'in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:bg-(--puka-solid-bg)',
  'in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:rounded-full',
  'in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:shadow-[0_2px_8px_-3px_var(--puka-tab-shadow)]',
].join(' ')
</script>

<template>
  <section id="modular" class="mkt-section tone-dawn">
    <div class="mkt-inner mod-grid">
      <div class="mod-copy" data-reveal>
        <p class="mkt-kicker">{{ t('marketing.modular.kicker') }}</p>
        <h2 class="mkt-h2">{{ t('marketing.modular.title') }}</h2>
        <p class="mkt-lead">{{ t('marketing.modular.lead') }}</p>
      </div>

      <div data-reveal style="--reveal-delay: 120ms">
        <UTabs
          v-model="active"
          :items="presets"
          :ui="{
            root: 'items-start gap-5',
            list: 'w-auto flex-wrap gap-[0.3rem] rounded-full bg-[color:var(--puka-tab-surface)] p-[0.3rem]',
            indicator: 'rounded-full bg-(--puka-solid-bg) shadow-[0_2px_8px_-3px_var(--puka-tab-shadow)]',
            trigger: TRIGGER_CLASS,
            content: 'w-auto',
          }"
        >
          <!-- An/aus als Badge-VARIANTE: `subtle` (Fläche + Kante) für an,
               `outline` (nur Kante) für aus. Die beiden Klassen halten die
               Flächen des Bestands — an = deckendes Weiß, aus = halb
               durchscheinend, damit der getönte Sektions-Grund durchkommt. -->
          <template #content="{ item }">
            <ul class="flex list-none flex-wrap gap-2.5 p-0">
              <li v-for="block in allBlocks" :key="block.id">
                <UBadge
                  as="span" color="neutral" size="lg"
                  :variant="item.on.has(block.id) ? 'subtle' : 'outline'"
                  :icon="item.on.has(block.id) ? 'i-ph-check-circle-fill' : 'i-ph-circle-dashed'"
                  :label="block.label"
                  class="px-3.5 py-2 font-semibold transition-colors"
                  :class="item.on.has(block.id) ? 'bg-(--puka-solid-bg) text-highlighted' : 'bg-(--puka-panel-soft-bg) text-muted'"
                  :ui="{ leadingIcon: item.on.has(block.id) ? 'size-4 text-primary-600' : 'size-4' }"
                />
              </li>
            </ul>
          </template>
        </UTabs>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mod-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
  align-items: center;
}

@media (min-width: 860px) { .mod-grid { grid-template-columns: 1fr 1fr; } }
</style>
