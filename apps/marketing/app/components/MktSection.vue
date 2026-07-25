<script setup lang="ts">
// Sektions-Wrapper: setzt den Licht-Ton (§6.3) + optional Reveal am Inhalt.
// tone ∈ cloud|mist|sky|dawn|sun|ink (der Grau→Sonne-Verlauf).
withDefaults(defineProps<{ tone?: string, id?: string, reveal?: boolean }>(), {
  tone: 'cloud',
  id: undefined,
  reveal: true,
})
</script>

<template>
  <section :id="id" class="mkt-section" :class="`tone-${tone}`">
    <div class="mkt-inner" :data-reveal="reveal ? '' : undefined">
      <slot />
    </div>
  </section>
</template>
