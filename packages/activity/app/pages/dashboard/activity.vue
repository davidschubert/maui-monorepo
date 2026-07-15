<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'activity.manage' })

const { t } = useI18n()

useHead({ title: () => t('activity.moderation.title') })
</script>

<template>
  <!-- UDashboardPanel liefert den Scroll-Container (#body = overflow-y-auto) —
       ohne ihn war die Seite als einzige Dashboard-Seite nicht scrollbar -->
  <UDashboardPanel id="activity-moderation">
    <template #header>
      <UDashboardNavbar :title="t('activity.moderation.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl">
        <p class="text-sm text-muted">{{ t('activity.moderation.description') }}</p>

        <ActivityFeed class="mt-6" moderate />
      </div>
    </template>
  </UDashboardPanel>
</template>
