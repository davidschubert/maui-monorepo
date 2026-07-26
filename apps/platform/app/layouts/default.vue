<script setup lang="ts">
import type { PublicPageNavItem } from '../../../../packages/pages/server/api/pages/public/index.get'

/**
 * Tenant-Layout der Community-Hosts (P3, Davids Demo-Feedback 2026-07-26):
 * überschreibt das core-default-Layout NUR in dieser App. Unterschiede:
 *  - Brand oben links = Tenant-Name („Morgenlicht") statt App-Brand
 *  - Hauptnavigation: Feed (posts-Layer) + veröffentlichte CMS-Seiten des
 *    Mandanten (pages-Liste, ohne `home` — die trägt das Logo)
 *  - Demo-Banner lebt HIER (nicht in app.vue) — die Login-Seite nutzt das
 *    auth-Layout und bleibt banner-frei
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
const appConfig = useAppConfig()

const tenantBrand = useTenantBrand()
const brand = computed(() => tenantBrand.value ?? appConfig.maui?.brand?.name ?? 'Pukalani')
const legalLinks = computed(() => appConfig.maui?.legalLinks ?? [])

// useRequestFetch: der SSR-interne Aufruf MUSS den Host-Header (= Tenant)
// weiterreichen — dieselbe Falle wie pages/[slug].vue.
const requestFetch = useRequestFetch()
const { data: navPages } = await useAsyncData(
  () => `nav-pages-${locale.value}`,
  () => requestFetch<PublicPageNavItem[]>('/api/pages/public', { query: { locale: locale.value } }).catch(() => []),
  { watch: [locale] },
)
const pageLinks = computed(() => (navPages.value ?? []).filter(page => page.slug !== 'home'))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <PlatformDemoBanner />
    <AuthEmailVerifyBanner />
    <header class="border-b border-default">
      <nav data-testid="main-nav" class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 items-center gap-6">
          <NuxtLink :to="localePath('/')" class="shrink-0 font-bold tracking-tight">{{ brand }}</NuxtLink>
          <div class="flex items-center gap-4 overflow-x-auto text-sm">
            <NuxtLink :to="localePath('/feed')" class="whitespace-nowrap text-muted hover:text-default">
              {{ t('nav.feed') }}
            </NuxtLink>
            <NuxtLink
              v-for="page in pageLinks"
              :key="page.slug"
              :to="localePath(`/${page.slug}`)"
              class="whitespace-nowrap text-muted hover:text-default"
            >
              {{ page.title }}
            </NuxtLink>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <CoreLocaleSwitcher />
          <UserMenu v-if="isLoggedIn" />
          <UButton v-else :to="localePath('/login')" color="neutral" variant="ghost">{{ t('auth.login.title') }}</UButton>
        </div>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 p-4">
      <slot />
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-2 p-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>{{ brand }}</span>
        <nav v-if="legalLinks.length" class="flex flex-wrap gap-x-4 gap-y-1">
          <NuxtLink
            v-for="link in legalLinks"
            :key="link.to"
            :to="localePath(link.to)"
            class="hover:text-default"
          >
            {{ t(link.labelKey) }}
          </NuxtLink>
        </nav>
      </div>
    </footer>

    <ConsentCookieBanner />
  </div>
</template>
