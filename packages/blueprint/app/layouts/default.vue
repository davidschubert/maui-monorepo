<script setup lang="ts">
/**
 * DAS Community-Layout (Layout-Konsolidierung Audit S9, Davids Entscheidungen
 * 2026-07-27): ersetzt die App-Overrides von comments und platform — beide
 * Apps extenden blueprint und bekommen exakt dieselbe Hülle. Aufbau:
 *
 *  - core-Hülle (max-w-5xl) + CoreDemoBanner (config-gated, maui.demo) +
 *    AuthEmailVerifyBanner
 *  - Header: Brand (useBrandName-Kette: Tenant vor App-Brand) · Inline-Nav
 *    mit Überlauf (ab >5 Einträgen wandert der Rest in ein „Mehr"-Dropdown,
 *    Entscheidung 1) · Utilities rechts · DisplaySettingsMenu statt
 *    CoreLocaleSwitcher (K7, Entscheidung 2 — kommt als themes-Utility)
 *  - Nav + Utilities kommen aus der Chrome-Registry (maui.chrome.nav /
 *    maui.chrome.utilities, core/shared/types/chrome.ts): ein Eintrag
 *    existiert genau dann, wenn sein Layer extended ist — der frühere
 *    „fehlt-in-platform"-Bruch ist damit strukturell weg. Zusätzliche
 *    Nav-Quelle: veröffentlichte CMS-Seiten des Mandanten (pages-Layer
 *    registriert maui.chrome.pagesNav).
 *  - Footer: Brand + Rechtslinks + optionaler Changelog-Link (Entscheidung 3).
 *    Rechtslinks: CMS-Seiten mit Legal-Slugs des Tenants zuerst (Entscheidung
 *    5 — der Kunde pflegt Impressum/Datenschutz selbst), sonst der
 *    maui.legalLinks-Fallback aus der App-Config (Demo → pukalani.app).
 *
 * Das core-default-Layout bleibt unverändert die Basis für Apps OHNE
 * blueprint (control/photos/portfolio/marketing/_template).
 */
import type { DropdownMenuItem } from '@nuxt/ui'
import { isFeatureStateEnabled } from '../../../core/shared/types/config'
import type { MauiChromeNavEntry, MauiChromeUtility } from '../../../core/shared/types/chrome'
import type { PublicPageNavItem } from '../../../pages/server/api/pages/public/index.get'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
const appConfig = useAppConfig()
const brand = useBrandName()
const { planAllows } = useTenantPlan()

// Laufzeit-Feature-Gates (F2): nur Ausblenden — die Autorität ist die
// core feature-gate-Middleware (gleicher Mechanismus wie die Dashboard-Nav).
const runtimeFlags = useRuntimeFlags()
const featureOn = (featureKey?: string) =>
  !featureKey || isFeatureStateEnabled(runtimeFlags.value.features[featureKey])

type ChromeConfig = {
  nav?: Record<string, MauiChromeNavEntry | false>
  utilities?: Record<string, MauiChromeUtility | false>
  pagesNav?: boolean
  changelogLink?: boolean
}
const chrome = computed<ChromeConfig>(() => (appConfig.maui as { chrome?: ChromeConfig }).chrome ?? {})
const legalLinks = computed(() => appConfig.maui?.legalLinks ?? [])

// CMS-Seiten des Mandanten als Nav-/Footer-Quelle — nur wenn der pages-Layer
// extended ist (er registriert maui.chrome.pagesNav; ohne ihn: kein Fetch).
// useRequestFetch: der SSR-interne Aufruf MUSS den Host-Header (= Tenant)
// weiterreichen — dieselbe Falle wie pages/[slug].vue.
const pagesNavEnabled = chrome.value.pagesNav === true
const requestFetch = useRequestFetch()
const { data: navPages } = await useAsyncData(
  () => `chrome-nav-pages-${locale.value}`,
  () => pagesNavEnabled
    ? requestFetch<PublicPageNavItem[]>('/api/pages/public', { query: { locale: locale.value } }).catch(() => [] as PublicPageNavItem[])
    : Promise.resolve([] as PublicPageNavItem[]),
  { watch: [locale] },
)

// Rechts-Slugs (Entscheidung 5): diese CMS-Seiten gehören in den Footer,
// nicht in die Haupt-Nav.
const LEGAL_SLUGS = ['imprint', 'impressum', 'privacy', 'datenschutz']
const cmsPages = computed(() => (navPages.value ?? []).filter(page => page.slug !== 'home'))
const cmsNavPages = computed(() => cmsPages.value.filter(page => !LEGAL_SLUGS.includes(page.slug)))
const cmsLegalPages = computed(() => cmsPages.value.filter(page => LEGAL_SLUGS.includes(page.slug)))

interface NavItem {
  id: string
  label: string
  to: string
  icon?: string
  planProduct?: string
}

// Registry-Einträge (gefiltert: abgeschaltet/Feature/Auth/Plan) + CMS-Seiten
// (order 60 — nach den Produkten, vor „Pricing" bei order 90), sortiert.
const navItems = computed<NavItem[]>(() => {
  const entries = Object.entries(chrome.value.nav ?? {})
    .filter((pair): pair is [string, MauiChromeNavEntry] => pair[1] !== false && !!pair[1])
    .filter(([, entry]) => featureOn(entry.featureKey))
    .filter(([, entry]) => !entry.requiresAuth || isLoggedIn.value)
    .filter(([, entry]) => !entry.planProduct || planAllows(entry.planProduct))
    .map(([id, entry]) => ({
      id,
      label: t(entry.labelKey),
      to: localePath(entry.to),
      icon: entry.icon,
      planProduct: entry.planProduct,
      order: entry.order ?? 50,
    }))
  const pages = cmsNavPages.value.map(page => ({
    id: `page-${page.slug}`,
    label: page.title,
    to: localePath(`/${page.slug}`),
    order: 60,
  }))
  return [...entries, ...pages].sort((a, b) => a.order - b.order)
})

// Überlauf (Entscheidung 1): bis 5 Einträge inline; darüber bleiben 4 stehen
// und der Rest wandert in ein „Mehr"-Dropdown.
const MAX_INLINE = 5
const hasOverflow = computed(() => navItems.value.length > MAX_INLINE)
const inlineNav = computed(() => (hasOverflow.value ? navItems.value.slice(0, MAX_INLINE - 1) : navItems.value))
const overflowNav = computed<DropdownMenuItem[]>(() =>
  hasOverflow.value
    ? navItems.value.slice(MAX_INLINE - 1).map(item => ({ label: item.label, icon: item.icon, to: item.to }))
    : [])

// Utilities (Komponenten global registriert — `.global.vue`): Zone 'menu'
// rechts im Header, Zone 'overlay' (schwebende Widgets) außerhalb.
const utilities = computed(() =>
  Object.entries(chrome.value.utilities ?? {})
    .filter((pair): pair is [string, MauiChromeUtility] => pair[1] !== false && !!pair[1])
    .filter(([, u]) => featureOn(u.featureKey))
    .filter(([, u]) => !u.requiresAuth || isLoggedIn.value)
    .map(([id, u]) => ({ id, component: u.component, order: u.order ?? 50, zone: u.zone ?? 'menu' }))
    .sort((a, b) => a.order - b.order))
const menuUtilities = computed(() => utilities.value.filter(u => u.zone === 'menu'))
const overlayUtilities = computed(() => utilities.value.filter(u => u.zone === 'overlay'))

// Footer-Rechtslinks: CMS-Seiten des Tenants zuerst, sonst der Config-
// Fallback. Absolute URLs (Demo → pukalani.app-Impressum) NICHT durch
// localePath schicken — das ist ein externer Link.
const footerLegal = computed(() => {
  if (cmsLegalPages.value.length) {
    return cmsLegalPages.value.map(page => ({ key: page.slug, label: page.title, to: localePath(`/${page.slug}`) }))
  }
  return legalLinks.value.map(link => ({
    key: link.to,
    label: t(link.labelKey),
    to: /^https?:\/\//.test(link.to) ? link.to : localePath(link.to),
  }))
})
const showChangelog = computed(() => chrome.value.changelogLink === true)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <CoreDemoBanner />
    <AuthEmailVerifyBanner />
    <header class="border-b border-default">
      <nav data-testid="main-nav" class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 items-center gap-6">
          <NuxtLink :to="localePath('/')" class="shrink-0 font-bold tracking-tight">{{ brand }}</NuxtLink>
          <div data-testid="chrome-nav" class="flex items-center gap-4 overflow-x-auto text-sm">
            <NuxtLink
              v-for="item in inlineNav"
              :key="item.id"
              :to="item.to"
              class="flex items-center gap-1.5 whitespace-nowrap text-muted hover:text-default"
            >
              {{ item.label }}
              <CorePlanBadge v-if="item.planProduct" :product="item.planProduct" />
            </NuxtLink>
            <UDropdownMenu v-if="hasOverflow" :items="overflowNav">
              <UButton
                :label="t('ui.more')"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-ph-caret-down"
                data-testid="chrome-nav-more"
              />
            </UDropdownMenu>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <component :is="u.component" v-for="u in menuUtilities" :key="u.id" />
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
        <nav v-if="footerLegal.length || showChangelog" class="flex flex-wrap gap-x-4 gap-y-1">
          <NuxtLink
            v-for="link in footerLegal"
            :key="link.key"
            :to="link.to"
            class="hover:text-default"
          >
            {{ link.label }}
          </NuxtLink>
          <NuxtLink v-if="showChangelog" :to="localePath('/changelog')" class="hover:text-default">
            {{ t('changelog.title') }}
          </NuxtLink>
        </nav>
      </div>
    </footer>

    <!-- Schwebende Widgets (z. B. FeedbackButton, fixed-positioniert) -->
    <component :is="u.component" v-for="u in overlayUtilities" :key="u.id" />

    <ConsentCookieBanner />
  </div>
</template>
