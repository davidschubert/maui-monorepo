<script setup lang="ts">
// Startseite (Design-Port aus nuxt-maui-photos): Hero + Selected Work.
// Bilder kommen aus dem media-Layer; ohne Uploads greift das Platzhalter-
// Hero-Bild aus public/ (Erst-Eindruck bleibt intakt).
definePageMeta({ layout: 'site' })

const localePath = useLocalePath()
const { data } = await useMediaItems()

const featured = computed(() => data.value?.items.slice(0, 6) ?? [])
const heroSrc = computed(() => data.value?.items.find(i => i.featured)?.src ?? '/images/gallery/honua-sunrise.svg')

useHead({
  title: 'maui.photos — Fine-art photography from Maui',
  meta: [
    {
      name: 'description',
      content: 'Fine-art landscape and ocean photography from the islands of Maui, Hawaiʻi. Prints and commissions.',
    },
  ],
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="hero">
      <div class="hero__bg" aria-hidden="true">
        <img :src="heroSrc" alt="">
        <div class="hero__scrim" />
      </div>
      <div class="container hero__content reveal">
        <p class="eyebrow">Maui · Hawaiʻi</p>
        <h1 class="hero__title">
          Light, water<br>and the edge of the land.
        </h1>
        <p class="hero__lead">
          A photographic record of Maui — its sunrises over Haleakalā, the
          swell of the north shore, and the quiet coasts in between.
        </p>
        <div class="hero__actions">
          <NuxtLink :to="localePath('/gallery')" class="btn btn--solid">View the gallery</NuxtLink>
          <NuxtLink :to="localePath('/contact')" class="btn">Commission a print</NuxtLink>
        </div>
      </div>
      <div class="hero__scroll" aria-hidden="true">
        <span>Scroll</span>
      </div>
    </section>

    <!-- Featured -->
    <section class="section container">
      <div class="section__head">
        <p class="eyebrow">Selected work</p>
        <h2 class="section__title">Recent frames</h2>
        <p class="section__lead">
          A rotating selection from across the island. Each image is available
          as a limited fine-art print.
        </p>
      </div>

      <GalleryGrid v-if="featured.length" :items="featured" />
      <p v-else class="section__lead">
        New work is on its way — the gallery is being curated right now.
      </p>

      <div class="section__more">
        <NuxtLink :to="localePath('/gallery')" class="btn">See the full gallery →</NuxtLink>
      </div>
    </section>

    <!-- Statement -->
    <section class="statement">
      <div class="container statement__inner">
        <p class="statement__text">
          “The island keeps its own hours. My work is simply about being there
          when the light arrives.”
        </p>
        <p class="statement__by">— The photographer behind maui.photos</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 100svh;
  display: flex;
  align-items: flex-end;
  padding-bottom: clamp(4rem, 12vh, 9rem);
  overflow: hidden;
}
.hero__bg {
  position: absolute;
  inset: 0;
  z-index: -1;
}
.hero__bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.05);
  animation: heroZoom 18s ease-out forwards;
}
@keyframes heroZoom {
  to {
    transform: scale(1);
  }
}
.hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
      to top,
      rgba(11, 12, 14, 0.95) 4%,
      rgba(11, 12, 14, 0.3) 45%,
      rgba(11, 12, 14, 0.55) 100%
    );
}
.hero__title {
  font-size: clamp(2.8rem, 8vw, 6rem);
  margin: 1.2rem 0 1.5rem;
  max-width: 16ch;
}
.hero__lead {
  color: var(--text-soft);
  font-size: clamp(1rem, 2vw, 1.25rem);
  max-width: 46ch;
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 2.4rem;
}
.hero__scroll {
  position: absolute;
  bottom: 1.6rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.68rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--text-soft);
}
.section__more {
  margin-top: 3rem;
}

.statement {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--bg-soft);
  padding-block: clamp(4rem, 10vw, 8rem);
}
.statement__inner {
  max-width: 900px;
  text-align: center;
}
.statement__text {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 4.5vw, 3rem);
  line-height: 1.25;
}
.statement__by {
  margin-top: 1.8rem;
  color: var(--text-soft);
  letter-spacing: 0.1em;
  font-size: 0.85rem;
}
</style>
