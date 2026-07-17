<script setup lang="ts">
import { CASES, findCase } from '../../data/cases'

definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const entry = findCase(String(route.params.slug))
if (!entry) {
  throw createError({ status: 404, statusText: 'Case not found' })
}

const lang = computed(() => (locale.value.startsWith('de') ? 'de' : 'en') as 'de' | 'en')

useHead({ title: `${entry.title} — David Schubert` })
useSeoMeta({ description: () => entry.teaser[lang.value] })

// Nächster Case für die Weiter-Navigation (zyklisch)
const nextCase = CASES[(CASES.findIndex(c => c.slug === entry.slug) + 1) % CASES.length]!
</script>

<template>
  <article v-if="entry">
    <section class="case-head">
      <div class="container reveal">
        <NuxtLink :to="localePath('/#cases')" class="case-head__back">← {{ t('portfolio.case.back') }}</NuxtLink>
        <p class="eyebrow">{{ entry.year }} · {{ entry.role[lang] }}</p>
        <h1 class="case-head__title">{{ entry.title }}</h1>
        <p class="case-head__teaser">{{ entry.teaser[lang] }}</p>
        <ul class="case-head__stack" :aria-label="t('portfolio.case.stack')">
          <li v-for="item in entry.stack" :key="item" class="case-head__chip">{{ item }}</li>
        </ul>
      </div>
    </section>

    <section class="section case-body">
      <div class="container case-body__inner">
        <p v-for="(paragraph, index) in entry.paragraphs" :key="index">{{ paragraph[lang] }}</p>
        <a v-if="entry.link" :href="entry.link.href" target="_blank" rel="noopener" class="btn">{{ entry.link.label }}</a>
      </div>
    </section>

    <section class="section case-next">
      <div class="container">
        <p class="eyebrow">{{ t('portfolio.case.next') }}</p>
        <NuxtLink :to="localePath(`/cases/${nextCase.slug}`)" class="case-next__link">{{ nextCase.title }} →</NuxtLink>
      </div>
    </section>
  </article>
</template>

<style scoped>
.case-head {
  padding-top: clamp(8rem, 18vh, 11rem);
}
.case-head__back {
  display: inline-block;
  margin-bottom: 2rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-soft);
  transition: color 0.3s var(--ease);
}
.case-head__back:hover {
  color: var(--accent);
}
.case-head__title {
  font-size: clamp(2.4rem, 8vw, 5.5rem);
  margin-top: 0.7rem;
}
.case-head__teaser {
  color: var(--text-soft);
  font-size: 1.15rem;
  max-width: 58ch;
  margin-top: 1.4rem;
}
.case-head__stack {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  margin-top: 1.8rem;
}
.case-head__chip {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-soft);
}
.case-body__inner {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  max-width: 68ch;
  color: var(--text-soft);
  font-size: 1.08rem;
}
.case-body__inner .btn {
  align-self: flex-start;
  margin-top: 0.6rem;
}
.case-next {
  border-top: 1px solid var(--line);
}
.case-next__link {
  display: inline-block;
  margin-top: 0.8rem;
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  font-size: clamp(1.6rem, 5vw, 3rem);
  transition: color 0.3s var(--ease);
}
.case-next__link:hover {
  color: var(--accent);
}
</style>
