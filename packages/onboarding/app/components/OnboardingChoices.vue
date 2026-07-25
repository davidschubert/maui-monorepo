<script setup lang="ts">
/**
 * Auswahl-Karten für die Katalog-Schritte (Zweck, Größe, Kategorie, Ziel).
 *
 * ECHTE Radio-Inputs unter den Karten, nicht klickbare divs: damit funktionieren
 * Pfeiltasten, Tab-Reihenfolge, Fokusring und Screenreader-Ansage ohne eine
 * Zeile eigenes Tastatur-JavaScript — und `required` greift im Formular. Die
 * Karte ist nur das Label dazu.
 */
export interface Choice {
  value: string
  label: string
  hint?: string
  /** Kennzeichnung für Bausteine, die noch nicht allgemein verfügbar sind. */
  badge?: string
}

const props = defineProps<{
  modelValue?: string
  options: Choice[]
  name: string
  legend: string
  /** Zwei Spalten ab sm (Default) oder eine — lange Hinweise brauchen Breite. */
  columns?: 1 | 2
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const columnClass = computed(() => props.columns === 1 ? 'sm:grid-cols-1' : 'sm:grid-cols-2')
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="sr-only">{{ legend }}</legend>
    <div class="grid grid-cols-1 gap-3" :class="columnClass">
      <label
        v-for="option in options"
        :key="option.value"
        class="group relative flex cursor-pointer items-start gap-3 rounded-xl border border-default bg-default p-4 transition-colors hover:bg-elevated/60 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-primary"
      >
        <input
          :checked="modelValue === option.value"
          :name="name"
          :value="option.value"
          type="radio"
          class="sr-only"
          @change="emit('update:modelValue', option.value)"
        >
        <span
          class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-default transition-colors group-has-checked:border-primary group-has-checked:bg-primary"
          aria-hidden="true"
        >
          <span class="size-2 rounded-full bg-inverted opacity-0 transition-opacity group-has-checked:opacity-100" />
        </span>
        <span class="min-w-0 space-y-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ option.label }}</span>
            <UBadge v-if="option.badge" color="neutral" variant="subtle" size="sm">{{ option.badge }}</UBadge>
          </span>
          <span v-if="option.hint" class="block text-sm text-muted">{{ option.hint }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
