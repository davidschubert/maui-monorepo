<script setup lang="ts">
// Dashboard-Shell nach Vorbild des offiziellen Nuxt-UI-Dashboard-Templates:
// UDashboardGroup + collapsible/resizable Sidebar (Brand oben, UserMenu unten),
// Command-Palette-Suche (⌘K). Die Seiten rendern in <slot/> als UDashboardPanel.
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import { isFeatureStateEnabled } from '../../../core/shared/types/config'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const appConfig = useAppConfig()

// Laufzeit-Feature-Gates (F2): Module deaktivierter Features verschwinden
// aus der Nav — live über den Realtime-Config-Kanal (useRuntimeFlags).
// Nur UX; die Autorität bleibt die Server-Middleware (Routen 404en).
const runtimeFlags = useRuntimeFlags()
const featureOn = (featureKey?: string) =>
  !featureKey || isFeatureStateEnabled(runtimeFlags.value.features[featureKey])

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

const close = () => { open.value = false }
const route = useRoute()

const canManageUsers = computed(() => userHasCapability(auth.user, 'users.manage'))

// Hauptnavigation oben — je Eintrag nach Capability gefiltert (RBAC). Overview
// sieht jeder mit dashboard.access; der Rest nur mit der jeweiligen Capability.
const links = computed<NavigationMenuItem[]>(() => {
  const u = auth.user
  const items: NavigationMenuItem[] = [
    { label: t('admin.nav.overview'), icon: 'i-ph-gauge', to: localePath('/dashboard'), exact: true, onSelect: close },
  ]
  if (canManageUsers.value) {
    items.push({ label: t('admin.nav.people'), icon: 'i-ph-users', to: localePath('/dashboard/users'), onSelect: close })
  }
  // Von Feature-Layern registrierte Dashboard-Module (z.B. comments-Moderation),
  // capability-gefiltert — admin kennt sie nicht hart (Modul-Registry, A14).
  // Mit children wird der Eintrag zum aufklappbaren Abschnitt (Unterpunkte
  // erben die Capability des Moduls, sofern keine eigene gesetzt ist).
  // group 'products' rendert unter einem Abschnitts-Label; placement
  // 'userMenu' gehört ins Account-Menü (DashboardUserMenu), nicht hierher.
  const toItem = (m: MauiAdminModule): NavigationMenuItem => {
    const children = (m.children ?? [])
      .filter(child => userHasCapability(u, child.requiredCapability ?? m.requiredCapability))
      .map(child => ({ label: t(child.labelKey), icon: child.icon, to: localePath(child.to), exact: child.exact, onSelect: close }))
    return children.length
      ? { label: t(m.labelKey), icon: m.icon, defaultOpen: route.path.startsWith(localePath(m.to)), children }
      : { label: t(m.labelKey), icon: m.icon, to: localePath(m.to), onSelect: close }
  }
  const modules = ((appConfig.maui?.admin?.modules ?? []) as MauiAdminModule[])
    .filter(m => (m.placement ?? 'nav') === 'nav' && userHasCapability(u, m.requiredCapability) && featureOn(m.featureKey))
  for (const m of modules.filter(m => !m.group)) items.push(toItem(m))
  // Gruppen in fester Reihenfolge; innerhalb sortiert 'order' (sonst Registry-
  // Reihenfolge). Label-Abstand kommt einheitlich über :ui der UNavigationMenu.
  for (const group of ['products', 'management', 'design'] as const) {
    const grouped = modules
      .filter(m => m.group === group)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    if (!grouped.length) continue
    items.push({ label: t(`admin.nav.groups.${group}`), type: 'label' })
    for (const m of grouped) items.push(toItem(m))
  }
  // Settings bewusst nicht hier — sitzt schon im User-Menü unten (DashboardUserMenu)
  return items
})

// Admin/System unten — knapp über dem User-Menü, ebenfalls capability-gefiltert
const bottomLinks = computed<NavigationMenuItem[]>(() => {
  const u = auth.user
  const items: NavigationMenuItem[] = []
  if (userHasCapability(u, 'audit.read')) items.push({ label: t('admin.nav.admin'), icon: 'i-ph-shield-check', to: localePath('/dashboard/admin'), onSelect: close })
  // Storage sitzt bei der Infrastruktur (selten gebraucht), nicht bei den Produkten
  if (userHasCapability(u, 'storage.manage')) items.push({ label: t('admin.nav.storage'), icon: 'i-ph-folder', to: localePath('/dashboard/storage'), onSelect: close })
  if (userHasCapability(u, 'system.manage')) items.push({ label: t('admin.nav.system'), icon: 'i-ph-cpu', to: localePath('/dashboard/system'), onSelect: close })
  // Raus aus dem Dashboard: zurück zur Startseite (ohne Capability — jeder)
  items.push({ label: t('admin.nav.homepage'), icon: 'i-ph-house', to: localePath('/'), onSelect: close })
  return items
})

// Globale Suche: Tippen fragt serverseitig User + Kommentare ab (debounced).
// Leichte lokale Typen — der volle CommandPaletteGroup<CommandPaletteItem>-Generic
// löst bei Array-Operationen TS2589 aus (zu tiefe Instanziierung), daher bauen wir
// damit und casten einmal an der Prop.
interface PaletteItem { label: string, icon?: string, suffix?: string, to?: string, onSelect?: () => void }
interface PaletteGroup { id: string, label: string, items: PaletteItem[], ignoreFilter?: boolean }

const searchTerm = ref('')
const searchLoading = ref(false)
const searchResults = ref<PaletteGroup[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

interface SearchResponse {
  users: { $id: string, name: string, email: string }[]
  comments: { $id: string, content: string, authorId: string, authorName: string }[]
}

// Stale-Response-Guard: nur die JÜNGSTE Suche darf die Ergebnisse setzen —
// sonst überschreibt eine langsam zurückkommende ältere Antwort die neuere
// (klassisches Race bei schnellem Tippen).
let searchSeq = 0

async function runSearch(term: string) {
  const seq = ++searchSeq
  if (term.trim().length < 2) {
    searchResults.value = []
    return
  }
  searchLoading.value = true
  try {
    const res = await $fetch<SearchResponse>('/api/admin/search', { query: { q: term.trim() } })
    if (seq !== searchSeq) return // veraltete Antwort verwerfen
    const groups: PaletteGroup[] = []
    if (res.users.length) {
      groups.push({
        id: 'users',
        label: t('dashboard.search.users'),
        ignoreFilter: true,
        items: res.users.map(u => ({ label: u.name, suffix: u.email, icon: 'i-ph-user', to: localePath(`/dashboard/users/${u.$id}`), onSelect: () => { open.value = false } })),
      })
    }
    if (res.comments.length) {
      groups.push({
        id: 'comments',
        label: t('dashboard.search.comments'),
        ignoreFilter: true,
        items: res.comments.map(c => ({ label: c.content, suffix: c.authorName, icon: 'i-ph-chat-circle', to: localePath(`/dashboard/users/${c.authorId}`), onSelect: () => { open.value = false } })),
      })
    }
    searchResults.value = groups
  }
  catch {
    if (seq === searchSeq) searchResults.value = []
  }
  finally {
    // Spinner nur beenden, wenn keine neuere Suche läuft
    if (seq === searchSeq) searchLoading.value = false
  }
}

watch(searchTerm, (term) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => runSearch(term), 250)
})

const searchGroups = computed(() => {
  const navGroup: PaletteGroup = {
    id: 'links',
    label: t('dashboard.search.label'),
    items: [...links.value, ...bottomLinks.value].map(link => ({ label: String(link.label), icon: link.icon, to: String(link.to) })),
  }
  return [navGroup, ...searchResults.value] as unknown as CommandPaletteGroup<CommandPaletteItem>[]
})
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
        <!-- label explizit — der Nuxt-UI-Default ist englisch ("Search...") -->
        <UDashboardSearchButton :collapsed="collapsed" :label="t('dashboard.search.button')" class="bg-transparent ring-default" />
        <UNavigationMenu :collapsed="collapsed" :items="links" orientation="vertical" tooltip popover :ui="{ label: 'mt-4' }" />
        <div class="flex-1" />
        <UNavigationMenu :collapsed="collapsed" :items="bottomLinks" orientation="vertical" tooltip popover />
      </template>

      <template #footer="{ collapsed }">
        <DashboardUserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      v-model:search-term="searchTerm"
      :groups="searchGroups"
      :loading="searchLoading"
      :placeholder="t('dashboard.search.placeholder')"
    />

    <!-- Global: wer sonst noch auf DIESER Seite ist (Betrachtungs-Presence) -->
    <ClientOnly>
      <div class="pointer-events-none fixed end-3 top-3 z-50 flex justify-end">
        <DashboardViewers class="pointer-events-auto" />
      </div>
    </ClientOnly>

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
