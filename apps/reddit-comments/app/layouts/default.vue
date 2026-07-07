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
      <nav data-testid="main-nav" class="mx-auto flex w-full max-w-5xl items-center justify-between p-4">
        <NuxtLink :to="localePath('/')" class="font-bold tracking-tight">Hawaii Studio</NuxtLink>
        <div class="flex items-center gap-2">
          <UButton :to="localePath('/community')" color="neutral" variant="ghost" icon="i-ph-users-three" data-testid="community-link">
            {{ t('posts.feed.title') }}
          </UButton>
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

    <ConsentCookieBanner />
  </div>
</template>
