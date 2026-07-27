<script setup lang="ts">
// Seitenleiste = Navigation des AKTIVEN Abschnitts (Anleitung | Entwickler).
const route = useRoute()
const fallback = ref<DocsNavigation | null>(null)
const navigation = inject(docsNavigationKey, fallback)
const items = computed(() => docsSectionItems(navigation.value, resolveDocsSection(route.path)))
</script>

<template>
  <UContainer>
    <UPage>
      <template #left>
        <UPageAside>
          <UContentNavigation
            highlight
            :navigation="items"
          />
        </UPageAside>
      </template>

      <slot />
    </UPage>
  </UContainer>
</template>
