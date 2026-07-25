<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const { locale } = useI18n()
const { start } = useProductLinks()
</script>

<template>
  <header class="mkt-header">
    <div class="mkt-header-inner">
      <NuxtLink :to="localePath('/')" class="brand" aria-label="Pukalani">
        <PukaMark :size="26" />
        <span class="brand-word">Pukalani</span>
      </NuxtLink>

      <nav class="mkt-nav" aria-label="Hauptnavigation">
        <a href="#bausteine" class="nav-link">{{ t('marketing.nav.features') }}</a>
        <a href="#preise" class="nav-link">{{ t('marketing.nav.pricing') }}</a>
        <a href="#geschichte" class="nav-link">{{ t('marketing.nav.story') }}</a>
      </nav>

      <!-- Mobil: die Desktop-Nav ist ausgeblendet — ohne diesen Ausklapper wären
           Bausteine/Preise/Geschichte auf dem Handy gar nicht erreichbar.
           Bewusst <details>: kein JS, tastatur- und screenreader-fähig, und es
           funktioniert auch, wenn Hydration noch läuft. -->
      <details class="mkt-nav-mobile">
        <summary :aria-label="t('marketing.nav.menu')">
          <UIcon name="i-ph-list-bold" />
        </summary>
        <div class="mkt-nav-mobile-panel">
          <a href="#bausteine">{{ t('marketing.nav.features') }}</a>
          <a href="#preise">{{ t('marketing.nav.pricing') }}</a>
          <a href="#geschichte">{{ t('marketing.nav.story') }}</a>
          <a href="#faq">{{ t('marketing.faq.kicker') }}</a>
        </div>
      </details>

      <div class="mkt-header-actions">
        <NuxtLink
          :to="switchLocalePath(locale === 'de' ? 'en' : 'de')"
          class="lang-switch"
        >{{ locale === 'de' ? 'EN' : 'DE' }}</NuxtLink>
        <UButton :to="start" class="header-cta" color="warning" size="sm">
          {{ t('marketing.nav.start') }}
        </UButton>
      </div>
    </div>
  </header>
</template>

<style scoped>
.mkt-header {
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: saturate(1.4) blur(10px);
  background: hsl(var(--puka-cloud) / 0.72);
  border-bottom: 1px solid hsl(var(--puka-ink) / 0.06);
}
.mkt-header-inner {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: -0.01em;
  color: hsl(var(--puka-ink));
  text-decoration: none;
}
.mkt-nav {
  display: none;
  gap: 1.5rem;
  margin-inline: auto;
}
.nav-link {
  color: hsl(var(--puka-ink-soft));
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
}
.nav-link:hover { color: hsl(var(--puka-sun-deep)); }
.mkt-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}
.lang-switch {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: hsl(var(--puka-ink-soft));
  text-decoration: none;
  padding: 0.25rem 0.4rem;
  border-radius: 0.4rem;
}
.lang-switch:hover { background: hsl(var(--puka-ink) / 0.06); }

/* ── Mobil-Ausklapper (nur unter 768px sichtbar) ──────────────────────────── */
.mkt-nav-mobile {
  position: relative;
  margin-left: auto;
}
.mkt-nav-mobile summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 0.55rem;
  cursor: pointer;
  color: hsl(var(--puka-ink));
  list-style: none;
}
.mkt-nav-mobile summary::-webkit-details-marker { display: none; }
.mkt-nav-mobile summary:hover { background: hsl(var(--puka-ink) / 0.06); }
.mkt-nav-mobile summary :deep(svg) { width: 1.35rem; height: 1.35rem; }
.mkt-nav-mobile-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  min-width: 12rem;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  border-radius: 0.8rem;
  background: hsl(0 0% 100%);
  border: 1px solid hsl(var(--puka-ink) / 0.1);
  box-shadow: 0 18px 40px -20px hsl(var(--puka-ink) / 0.45);
  z-index: 60;
}
.mkt-nav-mobile-panel a {
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  color: hsl(var(--puka-ink));
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
}
.mkt-nav-mobile-panel a:hover { background: hsl(var(--puka-ink) / 0.05); }

@media (min-width: 768px) {
  .mkt-nav { display: flex; }
  .mkt-nav-mobile { display: none; }
  .mkt-header-actions { margin-left: 0; }
}
</style>
