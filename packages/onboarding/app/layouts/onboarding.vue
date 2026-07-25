<script setup lang="ts">
/**
 * Layout des Setup-Flows: eine Bühne, keine Navigation.
 *
 * Bewusst KEIN Zurück-Link wie im auth-Layout und keine Community-Nav — wer
 * hier ist, hat genau eine Aufgabe. Der einzige Ausgang ist der Fortschritt
 * (oder das Konto-Menü, sobald es mehrere Communities gibt).
 */
const { t } = useI18n()
const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen bg-default">
    <header class="flex items-center justify-between px-4 py-3 sm:px-6">
      <span class="flex items-center gap-2 font-semibold tracking-tight">
        <span class="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-ph-sun-horizon" class="size-4" />
        </span>
        Pukalani
      </span>
      <span v-if="auth.user" class="truncate text-sm text-muted" :title="auth.user.email">
        {{ auth.user.email }}
      </span>
    </header>

    <main class="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <slot />
    </main>

    <p class="pb-8 text-center text-xs text-dimmed">
      {{ t('onboarding.layout.footer') }}
    </p>
  </div>
</template>
