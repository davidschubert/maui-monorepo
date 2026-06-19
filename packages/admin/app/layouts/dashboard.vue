<script setup lang="ts">
// Dashboard-Shell nach Vorbild des offiziellen Nuxt-UI-Dashboard-Templates:
// UDashboardGroup + collapsible/resizable Sidebar (Brand oben, UserMenu unten),
// Command-Palette-Suche (⌘K). Die Seiten rendern in <slot/> als UDashboardPanel.
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const localePath = useLocalePath()

const open = ref(false)

// Sidebar-Optik umschaltbar: sidebar | floating | inset. Nuxt UI hat diese
// Varianten nicht nativ — floating/inset bilden wir per CSS nach. Default floating.
const sidebarVariant = useCookie<'sidebar' | 'floating' | 'inset'>('maui-sidebar-variant', { default: () => 'floating' })

const sidebarClass = computed(() => {
  switch (sidebarVariant.value) {
    case 'floating': return 'm-2 h-[calc(100svh-1rem)] min-h-[calc(100svh-1rem)] rounded-xl border border-default bg-elevated shadow-lg'
    case 'inset': return 'border-0 bg-transparent'
    default: return 'bg-elevated/25'
  }
})

const links = computed<NavigationMenuItem[]>(() => [
  { label: t('admin.nav.overview'), icon: 'i-ph-gauge', to: localePath('/dashboard'), exact: true, onSelect: () => { open.value = false } },
  { label: t('admin.nav.users'), icon: 'i-ph-users', to: localePath('/dashboard/users'), onSelect: () => { open.value = false } },
  { label: t('admin.nav.comments'), icon: 'i-ph-chat-circle', to: localePath('/dashboard/comments'), onSelect: () => { open.value = false } },
  { label: t('dashboard.settings.title'), icon: 'i-ph-gear', to: localePath('/dashboard/settings'), onSelect: () => { open.value = false } },
  { label: t('admin.nav.system'), icon: 'i-ph-pulse', to: localePath('/dashboard/system'), onSelect: () => { open.value = false } },
  { label: t('admin.nav.audit'), icon: 'i-ph-scroll', to: localePath('/dashboard/audit'), onSelect: () => { open.value = false } },
])

const searchGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [{
  id: 'links',
  label: t('dashboard.search.label'),
  items: links.value.map(link => ({ label: link.label, icon: link.icon, to: link.to })),
}])
</script>

<template>
  <UDashboardGroup unit="rem" :class="sidebarVariant === 'inset' ? 'bg-elevated/50' : undefined">
    <UDashboardSidebar
      id="dashboard"
      v-model:open="open"
      collapsible
      :resizable="sidebarVariant === 'sidebar'"
      :class="sidebarClass"
      :ui="{ footer: sidebarVariant === 'sidebar' ? 'lg:border-t lg:border-default' : '' }"
    >
      <template #header="{ collapsed }">
        <DashboardBrand :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />
        <UNavigationMenu :collapsed="collapsed" :items="links" orientation="vertical" tooltip popover />
      </template>

      <template #footer="{ collapsed }">
        <DashboardUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="searchGroups" :placeholder="t('dashboard.search.placeholder')" />

    <!-- inset: Hauptinhalt sitzt als abgesetzte Karte im gedämpften Hintergrund -->
    <div
      v-if="sidebarVariant === 'inset'"
      class="m-2 flex min-w-0 flex-1 overflow-hidden rounded-xl bg-default shadow-sm ring ring-default"
    >
      <slot />
    </div>
    <slot v-else />
  </UDashboardGroup>
</template>
