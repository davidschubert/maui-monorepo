<script setup lang="ts">
definePageMeta({ layout: 'site' })

useHead({
  title: 'About — maui.photos',
  meta: [
    {
      name: 'description',
      content:
        'About the photographer behind maui.photos — fine-art photography from Maui, Hawaiʻi.',
    },
  ],
})

const facts = [
  { k: 'Based', v: 'Maui, Hawaiʻi' },
  { k: 'Since', v: '2016' },
  { k: 'Focus', v: 'Landscape · Ocean' },
  { k: 'Prints', v: 'Limited editions' },
]
</script>

<template>
  <div>
    <section class="page-head">
      <div class="container reveal">
        <p class="eyebrow">About</p>
        <h1 class="page-head__title">Chasing island light.</h1>
      </div>
    </section>

    <section class="section container about">
      <div class="about__media">
        <img src="/images/gallery/makani.svg" alt="Windward cliffs at Nākālele, Maui" />
      </div>
      <div class="about__body">
        <p>
          maui.photos is a personal project born from years of early mornings on
          the island — waiting for the first light to break over Haleakalā, and
          for the trade winds to settle the sea.
        </p>
        <p>
          The work favours patience over spectacle: quiet coastlines, the
          texture of water, and the way the land meets the ocean. Each image is
          made on location across Maui, from the Road to Hāna to the west-side
          sunsets of Lāhainā.
        </p>
        <p>
          Prints are produced in limited editions on archival fine-art paper.
          Commissions and licensing enquiries are always welcome.
        </p>

        <dl class="facts">
          <div v-for="f in facts" :key="f.k" class="facts__item">
            <dt>{{ f.k }}</dt>
            <dd>{{ f.v }}</dd>
          </div>
        </dl>

        <NuxtLink to="/contact" class="btn btn--solid">Get in touch</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-head {
  padding-top: clamp(8rem, 18vh, 12rem);
  padding-bottom: clamp(1rem, 3vw, 2rem);
}
.page-head__title {
  font-size: clamp(2.6rem, 8vw, 5rem);
  margin-top: 0.6rem;
}
.about {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;
}
.about__media img {
  width: 100%;
  border-radius: 8px;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  position: sticky;
  top: 6rem;
}
.about__body p {
  color: var(--text-soft);
  font-size: 1.08rem;
  margin-bottom: 1.3rem;
}
.facts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.4rem;
  margin: 2.4rem 0;
  padding-top: 2rem;
  border-top: 1px solid var(--line);
}
.facts__item dt {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--accent);
}
.facts__item dd {
  font-family: var(--font-display);
  font-size: 1.4rem;
  margin-top: 0.25rem;
}

@media (max-width: 760px) {
  .about {
    grid-template-columns: 1fr;
  }
  .about__media img {
    position: static;
    max-width: 420px;
  }
}
</style>
