<script setup lang="ts">
import { CASES } from '../data/cases'

definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead({ title: 'David Schubert — UI/UX Design & Web Development' })
useSeoMeta({ description: () => t('portfolio.hero.intro') })

const lang = computed(() => (locale.value.startsWith('de') ? 'de' : 'en') as 'de' | 'en')
</script>

<template>
  <div>
    <section class="hero">
      <div class="container reveal hero__inner">
        <p class="eyebrow">{{ t('portfolio.hero.eyebrow') }}</p>
        <h1 class="hero__title">{{ t('portfolio.hero.headline') }}</h1>
        <p class="hero__intro">{{ t('portfolio.hero.intro') }}</p>
        <div class="hero__actions">
          <a href="mailto:mail@davidschubert.com" class="btn btn--solid">{{ t('portfolio.hero.cta') }}</a>
          <NuxtLink :to="localePath('/#cases')" class="btn">{{ t('portfolio.hero.secondary') }}</NuxtLink>
        </div>
      </div>
    </section>

    <section id="cases" class="section">
      <div class="container">
        <p class="eyebrow">{{ t('portfolio.cases.eyebrow') }}</p>
        <h2 class="section-title">{{ t('portfolio.cases.title') }}</h2>
        <ol class="cases" data-cases>
          <li v-for="(entry, index) in CASES" :key="entry.slug" class="case">
            <NuxtLink :to="localePath(`/cases/${entry.slug}`)" class="case__link" :data-case="entry.slug">
              <span class="case__index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="case__main">
                <span class="case__title">{{ entry.title }}</span>
                <span class="case__teaser">{{ entry.teaser[lang] }}</span>
                <span class="case__meta">{{ entry.year }} · {{ entry.stack.slice(0, 3).join(' · ') }}</span>
              </span>
              <span class="case__arrow" aria-hidden="true">→</span>
            </NuxtLink>
          </li>
        </ol>
      </div>
    </section>

    <section id="about" class="section section--soft">
      <div class="container about">
        <div>
          <p class="eyebrow">{{ t('portfolio.about.eyebrow') }}</p>
          <h2 class="section-title">{{ t('portfolio.about.title') }}</h2>
        </div>
        <div class="about__copy">
          <p>{{ t('portfolio.about.p1') }}</p>
          <p>{{ t('portfolio.about.p2') }}</p>
        </div>
      </div>
    </section>

    <section class="section contact">
      <div class="container contact__inner">
        <h2 class="contact__title">{{ t('portfolio.contact.title') }}</h2>
        <a href="mailto:mail@davidschubert.com" class="btn btn--solid">{{ t('portfolio.contact.cta') }}</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  min-height: 100vh;
  padding-top: 4.5rem;
}
.hero__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: clamp(1.2rem, 3vw, 2rem);
}
.hero__title {
  /* 7vw statt 9vw: „Markenerlebnisse" (16 Zeichen) muss einzeilig in den
     Viewport passen, sonst läuft die Zeile an den Rand */
  font-size: clamp(2.2rem, 7vw, 5.6rem);
  max-width: 18ch;
}
.hero__intro {
  color: var(--text-soft);
  font-size: clamp(1rem, 2vw, 1.3rem);
  max-width: 42ch;
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
}
.section-title {
  font-size: clamp(1.9rem, 5vw, 3.4rem);
  margin-top: 0.7rem;
}
.cases {
  list-style: none;
  margin-top: clamp(2rem, 5vw, 3.5rem);
  border-top: 1px solid var(--line);
}
.case {
  border-bottom: 1px solid var(--line);
}
.case__link {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: clamp(1rem, 4vw, 2.5rem);
  padding-block: clamp(1.4rem, 3.5vw, 2.4rem);
  transition: padding-inline 0.35s var(--ease);
}
.case__link:hover {
  padding-inline: 0.6rem;
}
.case__index {
  font-weight: 800;
  color: var(--metal);
  font-size: 0.9rem;
}
.case__main {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}
.case__title {
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  font-size: clamp(1.4rem, 4vw, 2.4rem);
  line-height: 1.05;
  transition: color 0.3s var(--ease);
}
.case__link:hover .case__title {
  color: var(--accent);
}
.case__teaser {
  color: var(--text-soft);
  max-width: 62ch;
}
.case__meta {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--metal);
  font-weight: 700;
}
.case__arrow {
  font-size: 1.4rem;
  color: var(--text-soft);
  transition: color 0.3s var(--ease), transform 0.35s var(--ease);
}
.case__link:hover .case__arrow {
  color: var(--accent);
  transform: translateX(4px);
}
.section--soft {
  background: var(--bg-soft);
}
.about {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;
}
.about__copy {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  color: var(--text-soft);
  font-size: 1.05rem;
  padding-top: 0.4rem;
}
.contact__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.8rem;
  text-align: center;
}
.contact__title {
  font-size: clamp(2rem, 6vw, 4rem);
  max-width: 18ch;
}
@media (max-width: 760px) {
  .about {
    grid-template-columns: 1fr;
  }
  .case__arrow {
    display: none;
  }
}
</style>
