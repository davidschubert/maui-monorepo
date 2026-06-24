<script setup lang="ts">
import type { SortDir } from '../composables/useTableSort'

const props = defineProps<{
  label: string
  /** Server-Feldname für die Sortierung */
  field: string
  /** aktuell aktives Sortierfeld */
  active: string
  dir: SortDir
}>()

defineEmits<{ toggle: [field: string] }>()

const { t } = useI18n()

// Screenreader: Richtung wird sonst nur durch das Icon vermittelt
const ariaLabel = computed(() => {
  if (props.active !== props.field) return t('ui.sortBy', { label: props.label })
  return props.dir === 'asc'
    ? t('ui.sortedAsc', { label: props.label })
    : t('ui.sortedDesc', { label: props.label })
})
</script>

<template>
  <button
    type="button"
    class="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 hover:text-default"
    :aria-label="ariaLabel"
    @click="$emit('toggle', field)"
  >
    <span>{{ label }}</span>
    <UIcon
      :name="active === field ? (dir === 'asc' ? 'i-ph-arrow-up' : 'i-ph-arrow-down') : 'i-ph-arrows-down-up'"
      class="size-3.5 shrink-0"
      :class="active === field ? 'text-primary' : 'text-dimmed'"
    />
  </button>
</template>
