<script setup lang="ts">
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

const clampStyle = computed(() => expanded.value
  ? undefined
  : {
      'display': '-webkit-box',
      '-webkit-box-orient': 'vertical',
      '-webkit-line-clamp': String(props.lines),
      'overflow': 'hidden',
    })
</script>

<template>
  <div>
    <div ref="el" :style="clampStyle" data-clamp>
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
