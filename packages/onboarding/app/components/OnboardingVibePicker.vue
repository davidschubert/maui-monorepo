<script setup lang="ts">import { SITE_VIBES, type SiteVibeId } from '../../../studio/shared/onboarding'

/**
 * Vibe-Auswahl (Schritt 6).
 *
 * Die Farbpunkte kommen aus der GENERIERTEN Theme-Registry des themes-Layers
 * (`THEME_REGISTRY`, Auto-Import) — NICHT aus einer eigenen Farbliste. Sonst
 * gäbe es zwei Wahrheiten über dieselbe Farbe, und die im Wizard wäre die,
 * die zuerst veraltet. Fehlt ein Eintrag (Theme umbenannt), bleibt der Punkt
 * neutral statt die Auswahl zu sprengen; ein Test wacht darüber, dass jede
 * Vibe-Referenz existiert.
 */
const props = defineProps<{ modelValue?: SiteVibeId }>()
const emit = defineEmits<{ 'update:modelValue': [SiteVibeId] }>()

const { t } = useI18n()

interface VibeCard {
  id: SiteVibeId
  label: string
  hint: string
  /** Basisfarbe + der tonale Ton der Variante — das, was die Site prägt. */
  colors: string[]
}

const cards = computed<VibeCard[]>(() => SITE_VIBES.map((vibe) => {
  const theme = THEME_REGISTRY.find(entry => entry.id === vibe.theme)
  const variant = vibe.variant ? theme?.variants?.find(entry => entry.id === vibe.variant) : undefined
  // Basisfarbe + Variantenton — dedupliziert: hat ein Vibe keine Variante,
  // wären es zwei identische Punkte, und das sieht wie ein Fehler aus.
  const colors = [...new Set([variant?.color, theme?.color].filter(Boolean) as string[])]
  return {
    id: vibe.id,
    label: t(`onboarding.vibes.${vibe.id}.label`),
    hint: t(`onboarding.vibes.${vibe.id}.hint`),
    colors,
  }
}))

const selected = computed(() => props.modelValue)
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="sr-only">{{ t('onboarding.steps.vibe.title') }}</legend>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <label
        v-for="card in cards"
        :key="card.id"
        class="group flex cursor-pointer flex-col gap-3 rounded-xl border border-default bg-default p-4 transition-colors hover:bg-elevated/60 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-primary"
      >
        <input
          :checked="selected === card.id"
          name="vibe"
          :value="card.id"
          type="radio"
          class="sr-only"
          @change="emit('update:modelValue', card.id)"
        >
        <span class="flex items-center gap-1.5" aria-hidden="true">
          <span
            v-for="(color, index) in card.colors"
            :key="index"
            class="size-6 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10"
            :style="{ backgroundColor: color }"
          />
          <span v-if="!card.colors.length" class="size-6 rounded-full bg-elevated" />
        </span>
        <span class="space-y-0.5">
          <span class="block text-sm font-medium">{{ card.label }}</span>
          <span class="block text-xs text-muted">{{ card.hint }}</span>
        </span>
      </label>
    </div>
    <p class="text-sm text-dimmed">{{ t('onboarding.steps.vibe.changeable') }}</p>
  </fieldset>
</template>
