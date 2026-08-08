<script setup lang="ts">
// Dashboard-Shell nach Vorbild des offiziellen Nuxt-UI-Dashboard-Templates:
// UDashboardGroup + collapsible/resizable Sidebar (Brand oben, UserMenu unten),
// Command-Palette-Suche (⌘K). Die Seiten rendern in <slot/> als UDashboardPanel.
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import { isProductStateEnabled } from '../../../core/shared/types/config'
import type { Capability } from '../../../core/shared/types/authz'
import type { PukalaniSettingsTab } from '../../../core/shared/types/settings-tab'
import { resolveSettingsTabs } from '../../../core/shared/types/settings-tab'
import { configFlagEnabled, filterDashboardModules, resolveDashboardPlace, scopeVisibleAt } from '../../../core/shared/dashboardNav'

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

// TARIF-Gate (C2): Module, die der Plan dieser Community nicht enthält,
// verschwinden — ihre Routen antworten wegen `requirePlanProduct` ohnehin 404
// (Kurse/Events sind Pro). Zweites, unabhängiges Gate neben `productOn`: das
// ist der Betreiber-Schalter, das hier der Vertrag des Kunden. `planAllows`
// gibt ohne Pool-Tenant (Silo, Kontroll-Host, Playground) true zurück — dort
// bleibt das Menü unverändert. Nur UX; die Autorität sitzt an der Route.
const { planAllows } = useTenantPlan()
const planOn = (planProduct: string) => planAllows(planProduct)

// BAU-SCHALTER der App (F37): Module, deren Produkt diese App gar nicht
// angeschaltet hat, verschwinden — z.B. das Einbetter-Register des Widgets in
// einer App ohne `pukalani.comments.embed.enabled`. Drittes, unabhängiges Gate
// neben productOn (Betreiber-Schalter) und planOn (Tarif des Kunden); die
// Regel selbst ist pur und getestet (core/shared/dashboardNav.ts).
const configOn = (configFlag: string) => configFlagEnabled(appConfig.pukalani, configFlag)

// Glocke in der Betreiber-Shell (C17): dieselbe Config-Naht wie im
// core-default-Layout. Betrifft heute apps/control — dort liegen die
// kontobezogenen Meldungen (Early-Access-Anfragen an die Betreiber,
// Zahlungsprobleme des Betreiber-Kontos), und /dashboard ist die Shell, in
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

// Capability-Prüfung mit ZWEI Quellen (N1): Operator-Labels und die Community-
// Rolle dieses Mandanten (useCommunityRole, SSR-gespiegelt). Sie bleiben seit
// E9 GETRENNT, weil die Ebene eines Moduls entscheidet, welche zählt
// (moduleAllowedFor in core/shared/dashboardNav.ts): Betreiber-Module nur per
// Label, Community-Module per Rolle ODER Label (Support-Break-Glass). Die
// Zuordnung ist KONSERVATIV — sie ergibt sich vollständig aus den vorhandenen
// Capabilities der Module × der Rollen-Matrix (core/shared/communityAuthz.ts),
// hier wird keine neue Rechte-Liste gepflegt. Für einen Community-OWNER auf
// seinem Host heißt das:
//   sichtbar: Overview (dashboard.access), Kommentare (comments.moderate),
//     Beiträge (posts.moderate), Events/Kurse/Activity (events/courses/
//     activity.manage), Seiten (pages.manage), Medien (media.manage),
//     Mitglieder (team.manage), Abo (community.billing)
//   unsichtbar (Operator-only, Community-Rollen tragen die Caps nicht):
//     Themes/Embed (system.manage) — deshalb ist „Branding" für ihn heute noch
//     leer, s. Kommentar in packages/themes/app/app.config.ts
//   gar nicht am Ort (scope 'operator'): Nutzer, Admin/Audit, Speicher, System,
//     Plattform/Studio, Feedback, Board, Zahlungs-Protokolle
const { capabilities: siteCaps } = useCommunityRole()
/** Globales Operator-Label (authz.ts) — die INSTANZ-weite Rechte-Quelle. */
const canAsOperator = (capability: Capability) => userHasCapability(auth.user, capability)
/** Rolle in DIESER Community (communityAuthz.ts) — die zweite Quelle. */
const canAsMember = (capability: Capability) => siteCaps.value.has(capability)
/** Beide zusammen — für die hart verdrahteten Links und die Suche. */
const can = (capability: Capability) => canAsOperator(capability) || canAsMember(capability)

/**
 * DER ORT (E9, docs/plans/DASHBOARD-IA.md): Betreiber-Einträge verschwinden
 * auf einem Mandanten-Host, Community-Einträge erscheinen nur dort — und im
 * Silo-/Einzelbetrieb bleibt alles wie vorher, weil es dort keine zweite Ebene
 * gibt. Die Regel selbst ist pur und getestet (core/shared/dashboardNav.ts);
 * hier steht nur, woher ihre zwei Eingaben kommen.
 *
 * Beides ist eine Tatsache des REQUESTS (Config + Host), keine reaktive
 * Größe — SSR und Client kommen zwangsläufig zum selben Ergebnis, also gibt
 * es keinen Hydration-Bruch.
 */
const place = resolveDashboardPlace(
  (appConfig.pukalani as { tenancy?: { enabled?: boolean } }).tenancy?.enabled === true,
  useIsTenantHost(),
)
/** Nur für die HART verdrahteten Links unten (Nutzer, Admin, Speicher, System). */
const operatorHere = scopeVisibleAt('operator', place)

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
  // Von Produkt-Layern registrierte Dashboard-Module (z.B. comments-Moderation),
  // nach EBENE und Capability gefiltert — admin kennt sie nicht hart
  // (Modul-Registry, A14). Mit children wird der Eintrag zum aufklappbaren
  // Abschnitt (Unterpunkte erben die Capability des Moduls, sofern keine
  // eigene gesetzt ist). placement 'bottom' rendert unten, 'userMenu' im
  // Account-Menü (DashboardUserMenu) — beides nicht hier.
  const toItem = (m: PukalaniAdminModule): NavigationMenuItem => {
    const children = (m.children ?? [])
      .filter(child => can(child.requiredCapability ?? m.requiredCapability))
      .map(child => ({ label: t(child.labelKey), icon: child.icon, to: localePath(child.to), exact: child.exact, onSelect: close }))
    return children.length
      ? { label: t(m.labelKey), icon: m.icon, defaultOpen: route.path.startsWith(localePath(m.to)), children }
      : { label: t(m.labelKey), icon: m.icon, to: localePath(m.to), onSelect: close }
  }
  const modules = filterDashboardModules(
    (appConfig.pukalani?.admin?.modules ?? []) as PukalaniAdminModule[],
    { place, placement: 'nav', canAsOperator, canAsMember, productOn, planOn, configOn },
  )
  for (const m of modules.filter(m => !m.group)) items.push(toItem(m))
  // Gruppen in fester Reihenfolge (Davids Struktur, E9): erst die Betreiber-
  // Ebene (Plattform · Studio · Management), dann die Community-Ebene
  // (Website · Produkte · Branding · Einstellungen). Am Ort schließt sich
  // ohnehin immer eine der beiden Hälften aus — die eine Liste genügt.
  // Innerhalb sortiert 'order' (sonst Registry-Reihenfolge); Label-Abstand
  // kommt einheitlich über :ui der UNavigationMenu.
  for (const group of ['platform', 'studio', 'management', 'website', 'products', 'branding', 'settings'] as const) {
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

/**
 * Der INSTANZ-Unterbau, knapp über dem User-Menü: Nutzer · (registrierte
 * 'bottom'-Module, z. B. die interne Doku) · Admin · Speicher · System.
 * Davids Struktur (E9) stellt genau diese selten gebrauchten Betreiber-
 * Einträge nach unten.
 *
 * ZWEI Filter, und beide sind nötig: die Capabilities hier trägt zwar keine
 * Community-Rolle (N1-Vertrag, communityAuthz.test.ts) — aber der BETREIBER
 * trägt sie überall, auch wenn er den Host einer Kundencommunity aufruft.
 * `operatorHere` ist das, was ihn dort davor bewahrt, die Instanz-Verwaltung
 * im Kunden-Dashboard vor sich zu haben.
 */
/**
 * Der EINE Einstieg in die Community-Einstellungen (F51, 2026-08-07 — Davids
 * Community-Settings-Hub). Er steht ganz oben im Unterbau, weil ihn der Owner
 * einer Kunden-Community regelmäßig braucht, während darunter die selten
 * gebrauchte Instanz-Verwaltung des BETREIBERS folgt.
 *
 * SICHTBAR NUR MIT INHALT: gerechnet wird dieselbe Liste, die die Hülle
 * rendert (`resolveSettingsTabs` über `pukalani.admin.communityTabs`) — Ort ×
 * Capability × Produkt-Gates. Damit erledigt der Ort-Filter Davids
 * Ebenen-Entscheidung von selbst: auf einem Kontroll-Host bleibt von den
 * Community-Reitern nichts übrig, also gibt es den Punkt dort nicht; eine App
 * ohne registrierende Layer (photos, control) hat ihn nie. Kein zweites
 * Regelwerk, keine Liste, die man mitpflegen muss — und kein Menüpunkt, der
 * in den 404 der Hülle führt.
 */
const communityTabsHere = computed(() => resolveSettingsTabs(
  (appConfig.pukalani?.admin?.communityTabs ?? []) as PukalaniSettingsTab[],
  { place, canAsOperator, canAsMember, productOn, planOn, configOn },
))

const bottomLinks = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = []
  // Ziel ist der ERSTE sichtbare Reiter, nicht fest `/dashboard/community`:
  // den Index der Hülle bringt der onboarding-Layer mit (Reiter „Allgemein"),
  // und den hat eine SILO-App nicht. Dort beginnt der Hub bei „Eigene Domain"
  // oder was sonst zuerst kommt — ein Menüpunkt auf eine Adresse ohne Kind
  // führte in eine leere Fläche.
  const firstCommunityTab = communityTabsHere.value[0]
  if (firstCommunityTab) {
    items.push({ label: t('admin.nav.communitySettings'), icon: 'i-ph-users-three', to: localePath(firstCommunityTab.to), onSelect: close })
  }
  if (operatorHere && canManageUsers.value) {
    items.push({ label: t('admin.nav.people'), icon: 'i-ph-users', to: localePath('/dashboard/users'), onSelect: close })
  }
  for (const m of filterDashboardModules(
    (appConfig.pukalani?.admin?.modules ?? []) as PukalaniAdminModule[],
    { place, placement: 'bottom', canAsOperator, canAsMember, productOn, planOn, configOn },
  ).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))) {
    items.push({ label: t(m.labelKey), icon: m.icon, to: localePath(m.to), onSelect: close })
  }
  if (operatorHere && can('audit.read')) items.push({ label: t('admin.nav.admin'), icon: 'i-ph-shield-check', to: localePath('/dashboard/admin'), onSelect: close })
  // Storage sitzt bei der Infrastruktur (selten gebraucht), nicht bei den Produkten
  if (operatorHere && can('storage.manage')) items.push({ label: t('admin.nav.storage'), icon: 'i-ph-folder', to: localePath('/dashboard/storage'), onSelect: close })
  if (operatorHere && can('system.manage')) items.push({ label: t('admin.nav.system'), icon: 'i-ph-cpu', to: localePath('/dashboard/system'), onSelect: close })
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
