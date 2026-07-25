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

@media (min-width: 768px) {
  .mkt-nav { display: flex; }
  .mkt-header-actions { margin-left: 0; }
}
</style>
