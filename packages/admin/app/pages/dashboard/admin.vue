<script setup lang="ts">
// Admin-Bereich: bündelt Aktivitätsprotokoll + Konfiguration als Tabs (wie Settings).
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()

useHead({ title: () => t('admin.nav.admin') })

// Tabs nach Capability filtern (audit.read / changelog.manage / system.manage)
const links = computed<NavigationMenuItem[]>(() => {
  const u = auth.user
  const items: NavigationMenuItem[] = []
  if (userHasCapability(u, 'audit.read')) items.push({ label: t('admin.audit.title'), icon: 'i-ph-scroll', to: localePath('/dashboard/admin'), exact: true })
  // Roadmap-Tab entfernt — abgelöst durch das Ticket-Board (tickets-Layer, /dashboard/tickets).
  //
  // Der CHANGELOG-Tab bleibt, obwohl E10 seinen SEITENLEISTEN-Eintrag nach
  // „Management → Customer Feedback" zieht (Davids Navigation: der Changelog
  // schließt den Kreis — was in „Complete" landet, wird dort verkündet). Zwei
  // verschiedene Dinge: der Menüeintrag ist der EINSTIEG, dieser Tab ist die
  // Navigation INNERHALB der Admin-Shell, in der die Seite rendert. Ohne ihn
  // stünde man auf /dashboard/admin/changelog vor einer Tab-Reihe ohne aktiven
  // Tab — und Apps ohne den feedback-Layer (apps/comments) hätten gar keinen
  // Weg mehr zu ihrem eigenen Changelog.
  if (userHasCapability(u, 'changelog.manage')) items.push({ label: t('admin.changelog.title'), icon: 'i-ph-megaphone', to: localePath('/dashboard/admin/changelog') })
  if (userHasCapability(u, 'system.manage')) items.push({ label: t('admin.config.title'), icon: 'i-ph-toggle-left', to: localePath('/dashboard/admin/config') })
  if (userHasCapability(u, 'system.manage')) items.push({ label: t('admin.products.title'), icon: 'i-ph-puzzle-piece', to: localePath('/dashboard/admin/products') })
  if (userHasCapability(u, 'users.manage')) items.push({ label: t('admin.gdprExports.title'), icon: 'i-ph-file-lock', to: localePath('/dashboard/admin/gdpr-exports') })
  return items
})
</script>

<template>
  <UDashboardPanel id="admin">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.admin')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <NuxtPage />
    </template>
  </UDashboardPanel>
</template>
