<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()
const appConfig = useAppConfig()
// Footer-Rechtslinks aus der App-Config (Core-Default leer) — config-gated,
// damit interne Apps ohne öffentliche Seiten keinen Footer-Ballast tragen.
const legalLinks = computed(() => appConfig.maui?.legalLinks ?? [])
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AuthEmailVerifyBanner />
    <header class="border-b border-default">
      <nav data-testid="main-nav" class="mx-auto flex w-full max-w-5xl items-center justify-between p-4">
        <NuxtLink :to="localePath('/')" class="font-bold tracking-tight">Maui</NuxtLink>
        <div class="flex items-center gap-2">
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
        <span>Maui · Nuxt 4 + Appwrite</span>
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
