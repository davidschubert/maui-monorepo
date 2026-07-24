<script setup lang="ts">
/**
 * Theme-Picker als Grid-Modal (Vollausbau E7b): 26×11 sprengt jedes Dropdown —
 * hier wählen Besucher das Theme aus einem Swatch-Grid (Farb-Punkt + Name),
 * darunter die Farbvariationen des AKTIVEN Themes als Chip-Reihe (Standard +
 * 10 Töne). Auswahl wirkt sofort (Cookie via useTheme, SSR-flash-frei) —
 * das Modal bleibt offen, damit man Varianten direkt durchprobieren kann.
 */
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { themes, theme, variant, setTheme, setVariant } = useTheme()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
</script>

<template>
  <UModal v-model:open="open" :title="t('themes.picker.title')" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-6">
        <!-- Theme-Grid: 27 Kacheln (Maui-Default + 26 Farbwelten + Customs) -->
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-theme-grid>
          <button
            v-for="entry in themes"
            :key="entry.id"
            type="button"
            class="flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs ring transition-colors hover:bg-elevated/60"
            :class="entry.id === theme.id ? 'bg-elevated ring-2 ring-primary' : 'ring-default'"
            :aria-pressed="entry.id === theme.id"
            @click="setTheme(entry.id)"
          >
            <span
              class="size-6 rounded-full shadow-inner ring-1 ring-black/10"
              :style="{ backgroundColor: entry.color }"
              aria-hidden="true"
            />
            <span class="truncate font-medium">{{ entry.name }}</span>
          </button>
        </div>

        <!-- Farbvariationen des aktiven Themes: Standard + Töne. Sticky am
             unteren Modal-Rand — bleibt beim Scrollen durchs Grid sichtbar,
             die Wahl wirkt sofort und ist direkt durchprobierbar. -->
        <div v-if="theme.variants.length" class="sticky -bottom-4 -mb-4 border-t border-default bg-default pb-4 pt-3 sm:-bottom-6 sm:-mb-6 sm:pb-6" data-variant-row>
          <p class="mb-2 text-sm font-medium text-muted">{{ t('themes.picker.variants') }}</p>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              size="xs"
              :variant="variant === null ? 'solid' : 'soft'"
              color="neutral"
              @click="setVariant(null)"
            >
              <span class="size-3 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: theme.color }" aria-hidden="true" />
              {{ t('themes.variantDefault') }}
            </UButton>
            <UButton
              v-for="v in theme.variants"
              :key="v.id"
              size="xs"
              :variant="variant === v.id ? 'solid' : 'soft'"
              color="neutral"
              @click="setVariant(v.id)"
            >
              <span class="size-3 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: v.color }" aria-hidden="true" />
              {{ capitalize(v.id) }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
