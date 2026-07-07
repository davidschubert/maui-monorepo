<script setup lang="ts">
import type { CSSProperties } from 'vue'

/**
 * Klappt langen Content auf N Zeilen zusammen (YouTube-Muster): erst
 * „Mehr erfahren" zeigt den Rest — Feeds/Threads bleiben kompakt.
 * Ob geklappt werden muss, wird NACH dem Mount gemessen (scrollHeight),
 * kurzer Content bekommt nie einen Button. Core-Baustein — Konsumenten:
 * comments (CommentItem), posts (PostCard).
 */
const props = withDefaults(defineProps<{ lines?: number }>(), { lines: 5 })

const { t } = useI18n()

const el = ref<HTMLElement | null>(null)
const expanded = ref(false)
const clamped = ref(false)

function measure() {
  const node = el.value
  if (!node || expanded.value) return
  clamped.value = node.scrollHeight > node.clientHeight + 1
}

onMounted(() => {
  measure()
  // Breiten-Änderungen (Sidebar, Resize) können den Umbruch ändern
  if (el.value && 'ResizeObserver' in window) {
    const observer = new ResizeObserver(measure)
    observer.observe(el.value)
    onBeforeUnmount(() => observer.disconnect())
  }
})

// Clamp über CSS-Klasse + Custom Property statt Inline-Webkit-Styles:
// Vues SSR-Serializer verliert den führenden Bindestrich von
// -webkit-line-clamp (→ ungültiges CSS) — der erste Paint wäre UNGEKLAPPT
// und würde nach der Hydration sichtbar zuschnappen.
const clampStyle = computed<CSSProperties | undefined>(() =>
  expanded.value ? undefined : { '--clamp-lines': props.lines })
</script>

<template>
  <div>
    <div ref="el" :class="{ 'content-clamp': !expanded }" :style="clampStyle" data-clamp>
      <slot />
    </div>
    <button
      v-if="clamped"
      type="button"
      class="mt-1 text-xs font-medium text-muted transition-colors hover:text-default"
      :aria-expanded="expanded"
      data-clamp-toggle
      @click="expanded = !expanded"
    >
      {{ expanded ? t('ui.showLess') : t('ui.showMore') }}
    </button>
  </div>
</template>

<style scoped>
.content-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--clamp-lines);
  overflow: hidden;
}
</style>
