<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <header class="header">
    <div class="container header__inner">
      <NuxtLink :to="localePath('/')" class="header__brand">
        david<span class="header__brand-accent">.</span>schubert
      </NuxtLink>
      <nav class="header__nav" :aria-label="t('portfolio.nav.label')">
        <NuxtLink :to="localePath('/#cases')" class="header__link">{{ t('portfolio.nav.cases') }}</NuxtLink>
        <NuxtLink :to="localePath('/#about')" class="header__link">{{ t('portfolio.nav.about') }}</NuxtLink>
        <a href="mailto:mail@davidschubert.com" class="header__link header__link--cta">{{ t('portfolio.nav.contact') }}</a>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: fixed;
  inset-inline: 0;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  border-bottom: 1px solid var(--line);
}
.header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4.5rem;
}
.header__brand {
  font-weight: 800;
  letter-spacing: -0.02em;
  font-size: 1.05rem;
}
.header__brand-accent {
  color: var(--accent);
}
.header__nav {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 3vw, 2.2rem);
}
.header__link {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-soft);
  transition: color 0.3s var(--ease);
}
.header__link:hover {
  color: var(--accent);
}
.header__link--cta {
  color: var(--accent);
}
.header__link--cta:hover {
  color: var(--text);
}
</style>
