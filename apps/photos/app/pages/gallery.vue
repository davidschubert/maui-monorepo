<script setup lang="ts">
// Galerie (Design-Port): liest den media-Layer statt hartkodierter photos.ts —
// gepflegt wird unter /dashboard/media.
definePageMeta({ layout: 'site' })

const { data } = await useMediaItems()

useHead({
  title: 'Gallery — maui.photos',
  meta: [
    {
      name: 'description',
      content: 'The full gallery of fine-art photography from Maui, Hawaiʻi.',
    },
  ],
})
</script>

<template>
  <div>
    <section class="page-head">
      <div class="container reveal">
        <p class="eyebrow">The archive</p>
        <h1 class="page-head__title">Gallery</h1>
        <p class="page-head__lead">
          Landscapes, coastlines and ocean studies from across Maui. Hover an
          image for its location — every frame is available as a limited print.
        </p>
      </div>
    </section>

    <section class="section container">
      <GalleryGrid v-if="data?.items.length" :items="data.items" />
      <p v-else class="page-head__lead" data-gallery-empty>
        The gallery is being curated — first frames arrive shortly.
      </p>
    </section>
  </div>
</template>

<style scoped>
.page-head {
  padding-top: clamp(8rem, 18vh, 12rem);
  padding-bottom: clamp(2rem, 5vw, 3.5rem);
}
.page-head__title {
  font-size: clamp(3rem, 9vw, 6rem);
  margin-top: 0.6rem;
}
.page-head__lead {
  color: var(--text-soft);
  font-size: 1.1rem;
  max-width: 52ch;
  margin-top: 1.2rem;
}
.section {
  padding-top: 0;
}
</style>
