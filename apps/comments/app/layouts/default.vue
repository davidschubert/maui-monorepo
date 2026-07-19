<script setup lang="ts">
// App-Override des Core-default-Layouts: gleicher Aufbau, aber mit
// DisplaySettingsMenu (Theme/Variant/Appearance/Language) im Header.
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
// Laufzeit-Feature-Gates (F2): reagieren live auf den Admin-Toggle —
// nur Ausblenden; die Autorität ist die core feature-gate-Middleware.
const activityEnabled = useFeature('activity')
const coursesEnabled = useFeature('courses')
const eventsEnabled = useFeature('events')
const postsEnabled = useFeature('posts')

// Seiten-Nav mittig: Home · Products (Dropdown, vertikal mit Beschreibungen) · Pricing
const centerNav = computed<NavigationMenuItem[]>(() => [
  { label: t('app.nav.home'), icon: 'i-ph-house', to: localePath('/'), exact: true },
  {
    label: t('app.nav.products'),
    icon: 'i-ph-squares-four',
    children: [
      ...(postsEnabled.value ? [{ label: t('posts.feed.title'), icon: 'i-ph-users-three', description: t('posts.feed.description'), to: localePath('/community') }] : []),
      ...(eventsEnabled.value ? [{ label: t('events.list.title'), icon: 'i-ph-calendar-dots', description: t('events.list.description'), to: localePath('/events') }] : []),
      ...(isLoggedIn.value
        ? [
            ...(coursesEnabled.value ? [{ label: t('courses.list.title'), icon: 'i-ph-graduation-cap', description: t('courses.list.description'), to: localePath('/courses') }] : []),
            ...(activityEnabled.value ? [{ label: t('activity.title'), icon: 'i-ph-pulse', description: t('activity.description'), to: localePath('/activity') }] : []),
          ]
        : []),
    ],
  },
  { label: t('billing.pricing.title'), icon: 'i-ph-tag', to: localePath('/pricing') },
])
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AuthEmailVerifyBanner />
    <header class="border-b border-default">
      <!-- Volle Breite, drei Zonen: Brand links, Seiten-Nav zentriert, Utilities rechts.
           Unter md bricht die Seiten-Nav in eine eigene, zentrierte Zeile um. -->
      <nav data-testid="main-nav" class="grid w-full grid-cols-[auto_auto] items-center gap-2 px-4 py-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <NuxtLink :to="localePath('/')" class="justify-self-start font-bold tracking-tight">Hawaii Studio</NuxtLink>
        <div class="order-last col-span-2 flex items-center justify-center md:order-none md:col-span-1">
          <!-- contentOrientation vertical: Produkte untereinander, je mit
               Icon + zweizeiliger Beschreibung (Wunsch David) -->
          <!-- viewport MUSS die content-Breite spiegeln + shrink-0: er ist
               Flex-Kind des Wrapper (w-full der schmalen Nav-Leiste, ~300px
               sprach-/loginabhängig) — ohne beides drückt flex-shrink den
               Rahmen unter die 320px des Inhalts und schneidet rechts ab -->
          <UNavigationMenu
            :items="centerNav"
            content-orientation="vertical"
            :ui="{ viewport: 'w-80 shrink-0', content: 'w-80' }"
            data-testid="center-nav"
          />
        </div>
        <div class="flex items-center justify-self-end gap-2">
          <ActivitySlideover v-if="isLoggedIn && activityEnabled" />
          <WhatsNewButton />
          <DisplaySettingsMenu />
          <NotificationBell v-if="isLoggedIn" />
          <UserMenu v-if="isLoggedIn" />
          <UButton v-else :to="localePath('/login')" color="neutral" variant="ghost">{{ t('auth.login.title') }}</UButton>
        </div>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 p-4">
      <slot />
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 p-4 text-sm text-muted">
        <span>Hawaii Studio · Nuxt 4 + Appwrite</span>
        <NuxtLink :to="localePath('/changelog')" class="hover:text-default hover:underline">{{ t('changelog.title') }}</NuxtLink>
      </div>
    </footer>

    <!-- Feedback-Widget (feedback-Layer) — schwebt unten links -->
    <FeedbackButton />

    <ConsentCookieBanner />
  </div>
</template>
