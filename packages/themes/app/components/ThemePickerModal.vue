<script setup lang="ts">
/**
 * Theme-Picker als Grid-Modal (Vollausbau E7b): 26×11 sprengt jedes Dropdown —
 * hier wählen Besucher das Theme aus einem Swatch-Grid (Farb-Punkt + Name),
 * darunter die Farbvariationen des AKTIVEN Themes als Chip-Reihe (Standard +
 * 10 Töne). Auswahl wirkt sofort (Cookie via useTheme, SSR-flash-frei) —
 * das Modal bleibt offen, damit man Varianten direkt durchprobieren kann.
 *
 * ZWEI BETRIEBSARTEN (Entscheidung 12, 2026-07-28) — dasselbe Grid, damit es
 * den Picker nur EINMAL gibt:
 *
 *  1. UNKONTROLLIERT (Default, öffentlicher Header): die Wahl ist die des
 *     BESUCHERS und landet in seinen Cookies (useTheme).
 *  2. KONTROLLIERT (`:selection` gesetzt, Kunden-Dashboard): die Wahl gehört
 *     der COMMUNITY und wird nur nach oben gemeldet (`@select`) — hier darf
 *     KEIN Cookie geschrieben werden, sonst färbte der Owner beim Durchklicken
 *     seine eigene Ansicht um statt die der Community.
 *
 * `:builtin-only` blendet Custom Themes aus: die liegen pro Appwrite-PROJEKT
 * (custom_themes) und gehören im Pool nicht einem einzelnen Mandanten.
 */
const props = defineProps<{
  /**
   * Kontrollierter Modus: die aktuell gewählte Kombination von AUSSEN.
   * `undefined` (Prop nicht gesetzt) = unkontrolliert, Cookie-Verhalten wie
   * bisher. `null` = kontrolliert, aber noch nichts gewählt.
   */
  selection?: { theme: string, variant: string } | null
  /** Nur Built-ins zeigen (Custom Themes gehören dem Projekt, nicht der Site). */
  builtinOnly?: boolean
  /** Abweichender Modal-Titel (Default: der öffentliche „Theme wählen"). */
  title?: string
}>()

const emit = defineEmits<{ select: [{ theme: string, variant: string }] }>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { themes, theme: cookieTheme, variant: cookieVariant, setTheme, setVariant } = useTheme()

// `selection` ist ein optionales Prop: nicht gesetzt = undefined = der
// gewohnte Cookie-Modus. Ein explizit übergebenes `null` ist kontrolliert.
const controlled = computed(() => props.selection !== undefined)

const visibleThemes = computed(() => (
  // Custom Themes tragen das Attribut 'c-<rowId>' (customThemeAttr) — der
  // einzige verlässliche Unterschied zu den Built-ins ist `file`: Built-ins
  // liefern eine statische CSS-Datei (bzw. null beim Core-Default), Customs
  // rendern ihre Ramp als Inline-Style.
  props.builtinOnly ? themes.value.filter(entry => !entry.id.startsWith('c-')) : themes.value
))

/** Aktives Theme: im kontrollierten Modus die WAHL VON AUSSEN, sonst der Cookie-Zustand. */
const theme = computed(() => {
  if (!controlled.value) return cookieTheme.value
  return visibleThemes.value.find(entry => entry.id === props.selection?.theme)
    ?? visibleThemes.value[0]!
})

const variant = computed<string | null>(() => {
  if (!controlled.value) return cookieVariant.value
  const value = props.selection?.variant || ''
  return value && theme.value.variants.some(v => v.id === value) ? value : null
})

function chooseTheme(id: string) {
  // Theme-Wechsel setzt die Variante zurück — die Töne gehören zum Theme
  // (identisches Verhalten zu setTheme() im Cookie-Modus).
  if (controlled.value) emit('select', { theme: id, variant: '' })
  else setTheme(id)
}

function chooseVariant(id: string | null) {
  if (controlled.value) emit('select', { theme: theme.value.id, variant: id ?? '' })
  else setVariant(id)
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
</script>

<template>
  <UModal v-model:open="open" :title="title || t('themes.picker.title')" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-6">
        <!-- Theme-Grid: 27 Kacheln (`default`/„Aloha" + 26 Farbwelten + Customs) -->
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-theme-grid>
          <button
            v-for="entry in visibleThemes"
            :key="entry.id"
            type="button"
            class="flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs ring transition-colors hover:bg-elevated/60"
            :class="entry.id === theme.id ? 'bg-elevated ring-2 ring-primary' : 'ring-default'"
            :aria-pressed="entry.id === theme.id"
            @click="chooseTheme(entry.id)"
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
              @click="chooseVariant(null)"
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
              @click="chooseVariant(v.id)"
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
