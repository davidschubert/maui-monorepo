<script setup lang="ts">
const { t } = useI18n()
const { isLoggedIn } = useCurrentUser()
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-default">
      <nav data-testid="main-nav" class="mx-auto flex w-full max-w-5xl items-center justify-between p-4">
        <NuxtLink to="/" class="font-bold tracking-tight">Maui</NuxtLink>
        <div class="flex items-center gap-2">
          <UserMenu v-if="isLoggedIn" />
          <UButton v-else to="/login" color="neutral" variant="ghost">{{ t('auth.login.title') }}</UButton>
        </div>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 p-4">
      <slot />
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto w-full max-w-5xl p-4 text-sm text-muted">
        Maui · Nuxt 4 + Appwrite
      </div>
    </footer>

    <ConsentCookieBanner />
  </div>
</template>
