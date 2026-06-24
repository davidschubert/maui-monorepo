<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

useSeoMeta({
  title: () => t('home.title'),
  description: () => t('home.subtitle'),
})

// Demo-Target — echte Posts/Spaces liefert später die Community-Plattform
const DEMO_TARGET = { id: 'demo-post', type: 'post' } as const

// SSR-geladen: Online-Pill + Statistik stehen schon im ersten HTML → kein
// Layout-Shift. useFetch überträgt den Server-Wert via Payload, daher kein
// Hydration-Mismatch trotz dynamischer Zahlen.
const { data: presence } = useFetch<{ count: number }>('/api/presence/count', {
  query: { scope: 'global' },
})
const { data: stats } = useFetch<{ comments: number, members: number }>('/api/stats')
const online = computed(() => presence.value?.count ?? 0)

const features = computed(() => [
  { icon: 'i-ph-lightning', key: 'realtime' },
  { icon: 'i-ph-palette', key: 'themes' },
  { icon: 'i-ph-globe', key: 'i18n' },
  { icon: 'i-ph-shield-check', key: 'admin' },
])

const demo = ref<HTMLElement>()
function scrollToDemo() {
  demo.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString()
</script>

<template>
  <div class="space-y-12 py-4 sm:space-y-16 sm:py-8">
    <!-- Hero -->
    <section class="flex flex-col items-center text-center">
      <UBadge v-if="online > 0" color="success" variant="subtle" class="mb-4">
        <span class="relative flex size-2">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        {{ t('home.onlineBadge', { count: online }) }}
      </UBadge>

      <h1 class="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        {{ t('home.title') }}
      </h1>
      <p class="mt-4 max-w-xl text-balance text-muted">{{ t('home.subtitle') }}</p>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <UButton size="lg" icon="i-ph-arrow-down" @click="scrollToDemo">{{ t('home.tryDemo') }}</UButton>
        <UButton
          size="lg"
          color="neutral"
          variant="subtle"
          :to="isLoggedIn ? localePath('/dashboard') : localePath('/login')"
          :icon="isLoggedIn ? 'i-ph-gauge' : 'i-ph-sign-in'"
        >
          {{ isLoggedIn ? t('home.toDashboard') : t('home.signIn') }}
        </UButton>
      </div>
    </section>

    <!-- Feature-Karten -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UCard v-for="f in features" :key="f.key" :ui="{ body: 'sm:p-5' }">
        <UIcon :name="f.icon" class="size-7 text-primary" />
        <h3 class="mt-3 font-semibold">{{ t(`home.features.${f.key}.title`) }}</h3>
        <p class="mt-1 text-sm text-muted">{{ t(`home.features.${f.key}.desc`) }}</p>
      </UCard>
    </section>

    <!-- Live-Statistik -->
    <section class="grid grid-cols-3 gap-4">
      <div
        v-for="item in [
          { label: t('home.stats.comments'), value: stats?.comments },
          { label: t('home.stats.members'), value: stats?.members },
          { label: t('home.stats.online'), value: online },
        ]"
        :key="item.label"
        class="rounded-lg bg-elevated p-4 text-center"
      >
        <p class="text-2xl font-bold tabular-nums sm:text-3xl">{{ fmt(item.value) }}</p>
        <p class="mt-1 text-sm text-muted">{{ item.label }}</p>
      </div>
    </section>

    <!-- Live-Demo -->
    <section ref="demo" class="scroll-mt-20 space-y-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-ph-chats-circle" class="size-5 text-primary" />
        <h2 class="text-lg font-semibold">{{ t('home.demoTitle') }}</h2>
        <span class="text-sm text-dimmed">— {{ t('home.demoHint') }}</span>
      </div>
      <CommentSection :target-id="DEMO_TARGET.id" :target-type="DEMO_TARGET.type" />
    </section>
  </div>
</template>
