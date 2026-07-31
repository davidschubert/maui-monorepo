<script setup lang="ts">
// Dashboard-Shell nach Vorbild des offiziellen Nuxt-UI-Dashboard-Templates:
// UDashboardGroup + collapsible/resizable Sidebar (Brand oben, UserMenu unten),
// Command-Palette-Suche (⌘K). Die Seiten rendern in <slot/> als UDashboardPanel.
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import { isProductStateEnabled } from '../../../core/shared/types/config'
import type { Capability } from '../../../core/shared/types/authz'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const appConfig = useAppConfig()

// Laufzeit-Produkt-Gates (F2): Module deaktivierter Produkte verschwinden
// aus der Nav — live über den Realtime-Config-Kanal (useRuntimeFlags).
// Nur UX; die Autorität bleibt die Server-Middleware (Routen 404en).
const runtimeFlags = useRuntimeFlags()
const productOn = (productKey?: string) =>
  !productKey || isProductStateEnabled(runtimeFlags.value.products[productKey])

// Glocke in der Betreiber-Shell (C17): dieselbe Config-Naht wie im
// core-default-Layout. Betrifft heute apps/control — dort liegen die
// kontobezogenen Meldungen (Early-Access-Anfragen an die Betreiber,
// Zahlungsprobleme der Workspace-Kunden), und /dashboard ist die Shell, in
// der ein Betreiber sie liest. Core-Default aus: eine Community-Shell soll
// nicht ungefragt eine zweite Glocke bekommen.
const accountBell = computed(() =>
  (appConfig.pukalani as { chrome?: { accountBell?: boolean } }).chrome?.accountBell === true)

const open = ref(false)

// Sidebar-Optik umschaltbar: sidebar | floating | inset. Nuxt UI hat diese
// Varianten nicht nativ — floating/inset bilden wir per CSS nach. Default floating.
const sidebarVariant = useCookie<'sidebar' | 'floating' | 'inset'>('pukalani-sidebar-variant', { default: () => 'floating' })

const sidebarClass = computed(() => {
  switch (sidebarVariant.value) {
    case 'floating': return 'm-2 h-[calc(100svh-1rem)] min-h-[calc(100svh-1rem)] rounded-xl border border-default bg-elevated shadow-lg'
    case 'inset': return 'border-0 bg-transparent'
    default: return 'bg-elevated/25'
  }
})

const close = () => { open.value = false }
const route = useRoute()

// Capability-Prüfung mit ZWEI Quellen (N1): Operator-Labels ODER die Site-
// Rolle dieses Mandanten (useSiteRole, SSR-gespiegelt). Die Zuordnung ist
// KONSERVATIV, weil sie sich vollständig aus den vorhandenen Capabilities der
// Module × der Rollen-Matrix (core/shared/tenantAuthz.ts) ergibt — hier wird
// keine neue Rechte-Liste gepflegt. Für einen Site-OWNER heißt das:
//   sichtbar: Overview (dashboard.access), Kommentare (comments.moderate),
//     Beiträge (posts.moderate), Events/Kurse/Activity (events/courses/
//     activity.manage), Seiten (pages.manage), Medien (media.manage),
//     Einstellungen inkl. Community-Registrierung (team.manage via Page-Meta)
//   unsichtbar (Operator-only, Site-Rollen tragen die Caps nicht):
//     People (users.manage), Admin/Audit (audit.read), Storage
//     (storage.manage), System/Themes/Config/Produkte/Embed (system.manage),
//     Sites/Control (sites.manage), Billing (billing.manage), Feedback/
//     Tickets (feedback/tickets.manage)
const { capabilities: siteCaps } = useSiteRole()
const can = (capability: Capability) =>
  userHasCapability(auth.user, capability) || siteCaps.value.has(capability)

const canManageUsers = computed(() => can('users.manage'))
// Kommentar-Treffer der Palette springen in die Moderations-Warteschlange
// (Davids Entscheidung, Befund B7) — die verlangt `comments.moderate`.
const canModerateComments = computed(() => can('comments.moderate'))

// Hauptnavigation oben — je Eintrag nach Capability gefiltert (RBAC). Overview
// sieht jeder mit dashboard.access; der Rest nur mit der jeweiligen Capability.
const links = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: t('admin.nav.overview'), icon: 'i-ph-gauge', to: localePath('/dashboard'), exact: true, onSelect: close },
  ]
  if (canManageUsers.value) {
    items.push({ label: t('admin.nav.people'), icon: 'i-ph-users', to: localePath('/dashboard/users'), onSelect: close })
  }
  // Von Produkt-Layern registrierte Dashboard-Module (z.B. comments-Moderation),
  // capability-gefiltert — admin kennt sie nicht hart (Modul-Registry, A14).
  // Mit children wird der Eintrag zum aufklappbaren Abschnitt (Unterpunkte
  // erben die Capability des Moduls, sofern keine eigene gesetzt ist).
  // group 'products' rendert unter einem Abschnitts-Label; placement
  // 'userMenu' gehört ins Account-Menü (DashboardUserMenu), nicht hierher.
  const toItem = (m: PukalaniAdminModule): NavigationMenuItem => {
    const children = (m.children ?? [])
      .filter(child => can(child.requiredCapability ?? m.requiredCapability))
      .map(child => ({ label: t(child.labelKey), icon: child.icon, to: localePath(child.to), exact: child.exact, onSelect: close }))
    return children.length
      ? { label: t(m.labelKey), icon: m.icon, defaultOpen: route.path.startsWith(localePath(m.to)), children }
      : { label: t(m.labelKey), icon: m.icon, to: localePath(m.to), onSelect: close }
  }
  const modules = ((appConfig.pukalani?.admin?.modules ?? []) as PukalaniAdminModule[])
    .filter(m => (m.placement ?? 'nav') === 'nav' && can(m.requiredCapability) && productOn(m.productKey))
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
  const items: NavigationMenuItem[] = []
  // Operator-Infrastruktur: Site-Rollen tragen diese Caps nicht — can() fällt
  // für reine Site-Mitglieder automatisch auf „unsichtbar" zurück.
  if (can('audit.read')) items.push({ label: t('admin.nav.admin'), icon: 'i-ph-shield-check', to: localePath('/dashboard/admin'), onSelect: close })
  // Storage sitzt bei der Infrastruktur (selten gebraucht), nicht bei den Produkten
  if (can('storage.manage')) items.push({ label: t('admin.nav.storage'), icon: 'i-ph-folder', to: localePath('/dashboard/storage'), onSelect: close })
  if (can('system.manage')) items.push({ label: t('admin.nav.system'), icon: 'i-ph-cpu', to: localePath('/dashboard/system'), onSelect: close })
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
    // Nutzer-Treffer führen auf /dashboard/users/:id — die Seite verlangt
    // `users.manage`. Ohne die Capability wäre der Treffer ein Knopf in ein
    // 403, deshalb erscheint die Gruppe nur mit ihr (im Pool ist sie ohnehin
    // leer, Audit B2 — das trifft den Silo/Einzelbetrieb).
    if (res.users.length && canManageUsers.value) {
      groups.push({
        id: 'users',
        label: t('dashboard.search.users'),
        ignoreFilter: true,
        items: res.users.map(u => ({ label: u.name, suffix: u.email, icon: 'i-ph-user', to: localePath(`/dashboard/users/${u.$id}`), onSelect: () => { open.value = false } })),
      })
    }
    // Kommentar-Treffer führen per Deeplink in die Moderations-Warteschlange
    // auf genau diesen Eintrag (Befund B7, Davids Entscheidung) — NICHT mehr
    // auf die Nutzer-Detailseite des Autors, die `users.manage` verlangt und
    // dieselben Aufrufer mit 403 abwies. Query hinter den lokalisierten Pfad
    // gehängt: localePath bekommt reine Pfade, sonst geht der Prefix verloren.
    if (res.comments.length && canModerateComments.value) {
      const queue = localePath('/dashboard/comments')
      groups.push({
        id: 'comments',
        label: t('dashboard.search.comments'),
        ignoreFilter: true,
        items: res.comments.map(c => ({ label: c.content, suffix: c.authorName, icon: 'i-ph-chat-circle', to: `${queue}?comment=${encodeURIComponent(c.$id)}`, onSelect: () => { open.value = false } })),
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
        <!-- Suche + Glocke in EINER Reihe (C17). Die Glocke gehört bewusst in
             die Sidebar und nicht in eine schwebende Ecke: oben rechts sitzen
             die Aktionen der Seiten-Kopfzeilen („Neuer Code", „Nachfüllen"),
             dort verdeckt ein fixes Widget echte Knöpfe. Eingeklappt stapelt
             die Reihe (flex-col), damit die schmale Leiste nicht überläuft. -->
        <div class="flex items-center gap-1.5" :class="collapsed ? 'flex-col' : ''">
          <!-- label explizit — der Nuxt-UI-Default ist englisch ("Search...") -->
          <UDashboardSearchButton :collapsed="collapsed" :label="t('dashboard.search.button')" class="grow bg-transparent ring-default" />
          <NotificationBell v-if="accountBell && auth.user" />
        </div>
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
