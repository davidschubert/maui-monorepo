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
  PRESET_DEFS.map(p => ({ key: p.key, label: t(`marketing.modular.presets.${p.key}`), on: p.on as readonly string[] })),
)
const allBlocks = computed(() => ALL_BLOCK_IDS.map(id => ({ id, label: t(`marketing.modular.blocks.${id}`) })))
const active = ref(0)
const activeSet = computed(() => new Set(PRESET_DEFS[active.value]?.on ?? []))
</script>

<template>
  <section id="modular" class="mkt-section tone-dawn">
    <div class="mkt-inner mod-grid">
      <div class="mod-copy" data-reveal>
        <p class="mkt-kicker">{{ t('marketing.modular.kicker') }}</p>
        <h2 class="mkt-h2">{{ t('marketing.modular.title') }}</h2>
        <p class="mkt-lead">{{ t('marketing.modular.lead') }}</p>
      </div>

      <div class="mod-demo" data-reveal style="--reveal-delay: 120ms">
        <div class="mod-tabs" role="tablist">
          <button
            v-for="(p, i) in presets" :key="p.label" type="button"
            class="mod-tab" :class="{ 'mod-tab-active': i === active }"
            role="tab" :aria-selected="i === active"
            @click="active = i"
          >{{ p.label }}</button>
        </div>
        <ul class="mod-chips">
          <li
            v-for="block in allBlocks" :key="block.id"
            class="mod-chip" :class="{ 'mod-chip-on': activeSet.has(block.id) }"
          >
            <UIcon :name="activeSet.has(block.id) ? 'i-ph-check-circle-fill' : 'i-ph-circle-dashed'" />
            {{ block.label }}
          </li>
        </ul>
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
.mod-tabs {
  display: inline-flex;
  gap: 0.3rem;
  padding: 0.3rem;
  background: hsl(var(--puka-ink) / 0.06);
  border-radius: 999px;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.mod-tab {
  border: 0;
  background: transparent;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
  color: hsl(var(--puka-ink-soft));
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.mod-tab-active { background: hsl(0 0% 100%); color: hsl(var(--puka-sun-deep)); box-shadow: 0 2px 8px -3px hsl(var(--puka-ink) / 0.3); }
.mod-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0;
  margin: 0;
  list-style: none;
}
.mod-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border-radius: 0.7rem;
  font-weight: 600;
  font-size: 0.92rem;
  background: hsl(0 0% 100% / 0.5);
  color: hsl(var(--puka-ink-soft) / 0.6);
  border: 1px solid hsl(var(--puka-ink) / 0.06);
  transition: color 0.25s, background 0.25s, opacity 0.25s;
}
.mod-chip-on { color: hsl(var(--puka-ink)); background: hsl(0 0% 100%); }
.mod-chip :deep(svg) { width: 1.05rem; height: 1.05rem; }
.mod-chip-on :deep(svg) { color: hsl(var(--puka-sun-deep)); }

@media (min-width: 860px) { .mod-grid { grid-template-columns: 1fr 1fr; } }
</style>
