<script setup lang="ts">
// Dashboard-Layout (zieht laut Konzept aus dem Core hierher) —
// Sidebar-Navigation + Header mit UserMenu aus dem Core
const { t } = useI18n()

const nav = computed(() => [
  { label: t('admin.nav.overview'), icon: 'i-ph-gauge', to: '/admin' },
  { label: t('admin.nav.users'), icon: 'i-ph-users', to: '/admin/users' },
  { label: t('admin.nav.comments'), icon: 'i-ph-chat-circle', to: '/admin/comments' },
])
</script>

<template>
  <div class="flex min-h-screen" data-dashboard-layout>
    <aside class="flex w-56 shrink-0 flex-col border-r border-default p-4">
      <NuxtLink to="/" class="mb-6 font-bold tracking-tight">Maui Admin</NuxtLink>
      <nav data-testid="dashboard-nav" class="flex flex-col gap-1">
        <UButton
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          color="neutral"
          variant="ghost"
          class="justify-start"
        >
          {{ item.label }}
        </UButton>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center justify-end border-b border-default p-3">
        <UserMenu />
      </header>
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
