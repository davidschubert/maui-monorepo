<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const { locale } = useI18n()
const { start } = useProductLinks()

// Die sechs Produkte der Hauptnavigation. Reihenfolge = Reihenfolge im
// Bausteine-Abschnitt; Texte kommen aus i18n (marketing.nav.products.items.*),
// nur Icon und Early-Access-Flagge stehen im Code.
const PRODUCTS = [
  { slug: 'diskussionen', icon: 'i-ph-chats-circle-bold', ea: false },
  { slug: 'moderation', icon: 'i-ph-shield-check-bold', ea: false },
  { slug: 'branding', icon: 'i-ph-note-bold', ea: false },
  { slug: 'beitraege', icon: 'i-ph-broadcast-bold', ea: true },
  { slug: 'kurse', icon: 'i-ph-graduation-cap-bold', ea: true },
  { slug: 'events', icon: 'i-ph-calendar-check-bold', ea: true },
] as const

/** Die Produkt-Sektion liegt auf der Startseite — auch von Unterseiten aus. */
const blocksTarget = computed(() => ({ path: localePath('/'), hash: '#bausteine' }))
</script>

<template>
  <header class="mkt-header">
    <div class="mkt-header-inner">
      <NuxtLink :to="localePath('/')" class="brand" aria-label="Pukalani">
        <PukaMark :size="26" />
        <span class="brand-word">Pukalani</span>
      </NuxtLink>

      <nav class="mkt-nav" aria-label="Hauptnavigation">
        <!-- Produkte-Ausklapper: bewusst rein per CSS (:hover / :focus-within),
             wie der <details>-Ausklapper unten — kein JS-State, funktioniert
             also auch, solange Hydration noch läuft. -->
        <div class="nav-item">
          <NuxtLink :to="blocksTarget" class="nav-link nav-trigger">
            {{ t('marketing.nav.features') }}
            <UIcon name="i-ph-caret-down-bold" class="nav-caret" aria-hidden="true" />
          </NuxtLink>
          <div class="nav-dropdown">
            <div class="nav-dropdown-panel">
              <NuxtLink
                v-for="product in PRODUCTS"
                :key="product.slug"
                :to="localePath({ name: 'produkte-slug', params: { slug: product.slug } })"
                class="nav-product"
              >
                <span class="nav-product-icon"><UIcon :name="product.icon" /></span>
                <span class="nav-product-body">
                  <span class="nav-product-title">
                    {{ t(`marketing.nav.products.items.${product.slug}.title`) }}
                    <span v-if="product.ea" class="nav-product-badge">
                      {{ t('marketing.blocks.earlyAccess') }}
                    </span>
                  </span>
                  <span class="nav-product-text">
                    {{ t(`marketing.nav.products.items.${product.slug}.text`) }}
                  </span>
                </span>
              </NuxtLink>
              <NuxtLink :to="blocksTarget" class="nav-dropdown-foot">
                {{ t('marketing.nav.products.overview') }}
                <UIcon name="i-ph-arrow-right-bold" aria-hidden="true" />
              </NuxtLink>
            </div>
          </div>
        </div>
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
          <NuxtLink
            v-for="product in PRODUCTS"
            :key="product.slug"
            :to="localePath({ name: 'produkte-slug', params: { slug: product.slug } })"
            class="mkt-nav-mobile-product"
          >
            <UIcon :name="product.icon" />
            {{ t(`marketing.nav.products.items.${product.slug}.title`) }}
          </NuxtLink>
          <a href="#bausteine" class="mkt-nav-mobile-divide">{{ t('marketing.nav.features') }}</a>
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

/* ── Produkte-Ausklapper (Desktop, CSS-only) ──────────────────────────────── */
.nav-item { position: relative; }
.nav-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.nav-caret {
  width: 0.8rem;
  height: 0.8rem;
  transition: transform 0.15s ease;
}
.nav-item:hover .nav-caret,
.nav-item:focus-within .nav-caret { transform: rotate(180deg); }
.nav-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  /* padding statt Lücke: die Fläche zwischen Trigger und Panel bleibt
     hoverbar, sonst flackert das Menü beim Hinuntergehen. */
  padding-top: 0.65rem;
  width: 23rem;
  max-width: calc(100vw - 2rem);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: 60;
}
.nav-item:hover .nav-dropdown,
.nav-item:focus-within .nav-dropdown {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.nav-dropdown-panel {
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  border-radius: 0.9rem;
  background: hsl(0 0% 100%);
  border: 1px solid hsl(var(--puka-ink) / 0.1);
  box-shadow: 0 18px 40px -20px hsl(var(--puka-ink) / 0.45);
}
.nav-product {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.55rem 0.6rem;
  border-radius: 0.6rem;
  text-decoration: none;
  color: hsl(var(--puka-ink));
}
.nav-product:hover { background: hsl(var(--puka-ink) / 0.05); }
.nav-product-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: hsl(var(--puka-sun) / 0.18);
  color: hsl(var(--puka-sun-deep));
}
.nav-product-icon :deep(svg) { width: 1.1rem; height: 1.1rem; }
.nav-product-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.nav-product-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.3;
}
.nav-product-badge {
  flex: none;
  padding: 0.05rem 0.35rem;
  border-radius: 0.35rem;
  background: hsl(var(--puka-sun) / 0.22);
  color: hsl(var(--puka-sun-deep));
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.nav-product-text {
  font-size: 0.8rem;
  line-height: 1.4;
  color: hsl(var(--puka-ink-soft));
  font-weight: 400;
}
.nav-dropdown-foot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.3rem;
  padding: 0.6rem 0.6rem 0.45rem;
  border-top: 1px solid hsl(var(--puka-ink) / 0.08);
  color: hsl(var(--puka-sun-deep));
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 700;
}
.nav-dropdown-foot :deep(svg) { width: 0.85rem; height: 0.85rem; }
.nav-dropdown-foot:hover { text-decoration: underline; }
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
/* Die Selektoren tragen den Panel-Vorfahren mit, sonst gewinnt die
   allgemeinere Regel `.mkt-nav-mobile-panel a` (höhere Spezifität). */
.mkt-nav-mobile-panel a.mkt-nav-mobile-product {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.9rem;
}
.mkt-nav-mobile-product :deep(svg) {
  width: 1.05rem;
  height: 1.05rem;
  flex: none;
  color: hsl(var(--puka-sun-deep));
}
/* Trenner zwischen den Produkten und den Seiten-Ankern */
.mkt-nav-mobile-panel a.mkt-nav-mobile-divide {
  margin-top: 0.35rem;
  border-top: 1px solid hsl(var(--puka-ink) / 0.1);
  padding-top: 0.7rem;
}

@media (min-width: 768px) {
  .mkt-nav { display: flex; }
  .mkt-nav-mobile { display: none; }
  .mkt-header-actions { margin-left: 0; }
}
</style>
