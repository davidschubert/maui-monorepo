<script setup lang="ts">
// App-Override des Core-default-Layouts: gleicher Aufbau, aber mit
// DisplaySettingsMenu (Theme/Variant/Appearance/Language) im Header.
const { t } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-default">
      <!-- Volle Breite, drei Zonen: Brand links, Seiten-Nav zentriert, Utilities rechts.
           Unter md bricht die Seiten-Nav in eine eigene, zentrierte Zeile um. -->
      <nav data-testid="main-nav" class="grid w-full grid-cols-[auto_auto] items-center gap-2 px-4 py-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <NuxtLink :to="localePath('/')" class="justify-self-start font-bold tracking-tight">Hawaii Studio</NuxtLink>
        <div class="order-last col-span-2 flex items-center justify-center gap-2 md:order-none md:col-span-1">
          <!-- Unter md nur Icons — sonst läuft der Header auf Mobile über -->
          <UButton :to="localePath('/community')" color="neutral" variant="ghost" icon="i-ph-users-three" data-testid="community-link">
            <span class="hidden md:inline">{{ t('posts.feed.title') }}</span>
          </UButton>
          <UButton :to="localePath('/events')" color="neutral" variant="ghost" icon="i-ph-calendar-dots" data-testid="events-link">
            <span class="hidden md:inline">{{ t('events.list.title') }}</span>
          </UButton>
          <UButton v-if="isLoggedIn" :to="localePath('/courses')" color="neutral" variant="ghost" icon="i-ph-graduation-cap" data-testid="courses-link">
            <span class="hidden md:inline">{{ t('courses.list.title') }}</span>
          </UButton>
          <UButton :to="localePath('/pricing')" color="neutral" variant="ghost" icon="i-ph-tag" data-testid="pricing-link">
            <span class="hidden md:inline">{{ t('billing.pricing.title') }}</span>
          </UButton>
        </div>
        <div class="flex items-center justify-self-end gap-2">
          <FeedSlideover v-if="isLoggedIn" />
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
