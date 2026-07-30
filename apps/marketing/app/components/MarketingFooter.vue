<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { start, demo } = useProductLinks()
const year = 2026 // statisch: Date.now() steht im Build nicht zur Verfügung
</script>

<template>
  <footer class="mkt-footer tone-ink">
    <div class="mkt-footer-inner">
      <div class="foot-brand">
        <div class="foot-brand-row">
          <PukaMark :size="24" />
          <span class="foot-word">Pukalani</span>
        </div>
        <p class="foot-tagline">{{ t('marketing.footer.tagline') }}</p>
        <p class="foot-refrain">„{{ t('marketing.footer.refrain') }}"</p>
      </div>

      <nav class="foot-col" aria-label="Produkt">
        <h3>{{ t('marketing.footer.colProduct') }}</h3>
        <a :href="start">{{ t('marketing.footer.start') }}</a>
        <a :href="demo">{{ t('marketing.footer.demo') }}</a>
        <!-- Route-NAME statt Pfad-String: /produkte/* und /fuer/* tragen
             lokalisierte Pfade (defineI18nRoute). Ein roher Pfad wird nur mit
             dem Locale-Präfix versehen, das Segment bleibt deutsch — auf EN
             stünde dann /produkte/… im HTML. -->
        <NuxtLink :to="localePath({ name: 'produkte-slug', params: { slug: 'diskussionen' } })">{{ t('marketing.footer.featDiscussions') }}</NuxtLink>
        <NuxtLink :to="localePath({ name: 'produkte-slug', params: { slug: 'kurse' } })">{{ t('marketing.footer.featCourses') }}</NuxtLink>
        <NuxtLink :to="localePath({ name: 'produkte-slug', params: { slug: 'events' } })">{{ t('marketing.footer.featEvents') }}</NuxtLink>
        <NuxtLink :to="localePath({ name: 'produkte-slug', params: { slug: 'branding' } })">{{ t('marketing.footer.featBranding') }}</NuxtLink>
        <NuxtLink :to="localePath('/faq')">{{ t('marketing.footer.faq') }}</NuxtLink>
        <NuxtLink :to="localePath('/glossar')">{{ t('marketing.footer.glossary') }}</NuxtLink>
      </nav>

      <nav class="foot-col" aria-label="Vergleich">
        <h3>{{ t('marketing.footer.colCompare') }}</h3>
        <NuxtLink :to="localePath('/vs/circle')">{{ t('marketing.footer.vsCircle') }}</NuxtLink>
        <NuxtLink :to="localePath('/vs/skool')">{{ t('marketing.footer.vsSkool') }}</NuxtLink>
        <NuxtLink :to="localePath('/vs/mighty-networks')">{{ t('marketing.footer.vsMighty') }}</NuxtLink>
        <NuxtLink :to="localePath('/wechseln')">{{ t('marketing.footer.switchPage') }}</NuxtLink>
      </nav>

      <nav class="foot-col" aria-label="Anwendungsfälle">
        <h3>{{ t('marketing.footer.colUseCases') }}</h3>
        <NuxtLink :to="localePath({ name: 'fuer-slug', params: { slug: 'coaches' } })">{{ t('marketing.footer.forCoaches') }}</NuxtLink>
        <NuxtLink :to="localePath({ name: 'fuer-slug', params: { slug: 'kurse' } })">{{ t('marketing.footer.forCourses') }}</NuxtLink>
        <NuxtLink :to="localePath({ name: 'fuer-slug', params: { slug: 'creator' } })">{{ t('marketing.footer.forCreator') }}</NuxtLink>
        <NuxtLink :to="localePath({ name: 'fuer-slug', params: { slug: 'vereine' } })">{{ t('marketing.footer.forClubs') }}</NuxtLink>
      </nav>

      <nav class="foot-col" aria-label="Über">
        <h3>{{ t('marketing.footer.colCompany') }}</h3>
        <NuxtLink :to="localePath('/')">{{ t('marketing.footer.story') }}</NuxtLink>
        <NuxtLink :to="localePath('/dsgvo')">{{ t('marketing.footer.privacyHow') }}</NuxtLink>
        <a href="https://changelog.pukalani.app">{{ t('marketing.footer.changelog') }}</a>
        <!-- Die Statusseite liegt bewusst NICHT bei uns: sie muss antworten,
             wenn unser Server es nicht tut. -->
        <a href="https://status.pukalani.app" rel="noopener">{{ t('marketing.footer.status') }}</a>
      </nav>

      <!-- Rechtstexte liegen auf DIESER Domain (Impressumspflicht), nicht als
           Link auf app.pukalani.app. -->
      <nav class="foot-col" aria-label="Rechtliches">
        <h3>{{ t('marketing.footer.colLegal') }}</h3>
        <NuxtLink :to="localePath('/datenschutz')">{{ t('marketing.footer.privacy') }}</NuxtLink>
        <NuxtLink :to="localePath('/impressum')">{{ t('marketing.footer.imprint') }}</NuxtLink>
        <NuxtLink :to="localePath('/agb')">{{ t('marketing.footer.terms') }}</NuxtLink>
      </nav>
    </div>

    <div class="mkt-footer-base">
      <span>© {{ year }} Pukalani. {{ t('marketing.footer.rights') }}</span>
      <span>{{ t('marketing.footer.madeIn') }}</span>
    </div>
  </footer>
</template>

<style scoped>
.mkt-footer {
  padding: clamp(3rem, 6vw, 5rem) 1.5rem 2rem;
}
.mkt-footer-inner {
  max-width: 72rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
}
.foot-brand-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.foot-word {
  font-weight: 800;
  font-size: 1.1rem;
  color: hsl(var(--puka-cloud));
}
.foot-tagline {
  margin-top: 0.75rem;
  max-width: 22rem;
  color: hsl(var(--puka-mist) / 0.75);
  line-height: 1.55;
  font-size: 0.95rem;
}
.foot-refrain {
  margin-top: 0.75rem;
  color: hsl(var(--puka-sun));
  font-style: italic;
  font-size: 0.95rem;
}
.foot-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.foot-col h3 {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: hsl(var(--puka-mist) / 0.6);
  margin-bottom: 0.2rem;
}
.foot-col a {
  color: hsl(var(--puka-cloud) / 0.85);
  text-decoration: none;
  font-size: 0.95rem;
}
.foot-col a:hover { color: hsl(var(--puka-sun)); }
.mkt-footer-base {
  max-width: 72rem;
  margin: 2.5rem auto 0;
  padding-top: 1.5rem;
  border-top: 1px solid hsl(var(--puka-cloud) / 0.12);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  justify-content: space-between;
  font-size: 0.85rem;
  color: hsl(var(--puka-mist) / 0.6);
}

.foot-col :deep(a) {
  color: hsl(var(--puka-cloud) / 0.85);
  text-decoration: none;
  font-size: 0.95rem;
}
.foot-col :deep(a:hover) { color: hsl(var(--puka-sun)); }

@media (min-width: 640px) {
  .mkt-footer-inner { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 900px) {
  .mkt-footer-inner { grid-template-columns: 1.5fr repeat(3, 1fr); }
}
@media (min-width: 1150px) {
  .mkt-footer-inner { grid-template-columns: 1.5fr repeat(4, 1fr); }
}
</style>
