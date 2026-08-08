<script setup lang="ts">
/**
 * DIE COMMUNITY-HÜLLE (F51, 2026-08-07 — Davids Entscheidung, DECISION-LOG
 * „Community-Settings-Hub").
 *
 * EIN Menüpunkt unten links, dahinter alle Einstellungen, die der COMMUNITY
 * gehören, als Reiter: Allgemein · Branding · Mitglieder · Domain · Plan ·
 * Private Nachrichten · Aktivitätsprotokoll · Analytics. Die vier KONTO-Reiter
 * (Allgemein, Benachrichtigungen, Sitzungen, Sicherheit) bleiben nebenan unter
 * /dashboard/settings — zwei Ebenen, zwei Hüllen, und keine Seite, die beides
 * gleichzeitig behauptet.
 *
 * ── KEIN EINZIGER REITER STEHT HIER FEST ──────────────────────────────────
 * Anders als die Konto-Hülle (packages/admin/app/pages/dashboard/settings.vue),
 * die ihre vier eigenen Reiter verdrahtet hat und nur die FREMDEN aus der
 * Registry zieht, besitzt der admin-Layer hier GAR NICHTS: er hat weder die
 * Routen (`/api/community/*` liegen in onboarding, messages, activity,
 * analytics) noch die Tabellen. Er bringt nur die Hülle mit. Jeder Reiter kommt
 * deshalb aus `pukalani.admin.communityTabs` — wer die Routen besitzt,
 * registriert den Einstieg (A14, dieselbe Lehre wie F24).
 *
 * Praktische Folge: eine App ohne einen einzigen registrierenden Layer
 * (apps/photos, apps/control) hat hier NICHTS zu zeigen — und bekommt deshalb
 * 404 statt einer leeren Fläche. Ebenso hat eine SILO-App keinen INDEX
 * (`/dashboard/community` selbst): den Reiter „Allgemein" bringt der
 * onboarding-Layer mit, den es dort nicht gibt. Deshalb zeigt der Menüpunkt
 * unten links auf den ERSTEN sichtbaren Reiter statt fest auf diese Adresse. Dasselbe gilt auf einem KONTROLL-Host der
 * Platform-App: dort filtert `scopeVisibleAt` alle Community-Reiter weg, weil
 * es an diesem Ort keine Community gibt, deren Einstellungen das wären. Ein
 * fail-closed 404 ist hier richtig, weil die Kinder ohnehin jeweils an ihrer
 * eigenen Capability hängen — die Hülle verschließt nichts, was sonst offen
 * wäre, sie hört nur auf, ein Versprechen ins Leere zu machen.
 *
 * Gefiltert wird mit DERSELBEN puren Regel wie Sidebar und Konto-Hülle
 * (`resolveSettingsTabs`): Ort × Capability × die drei Produkt-Gates. Die
 * Gates sind hier Pflicht und nicht Kür — Aktivitätsprotokoll und Analytics
 * waren vor F51 Sidebar-Module und trugen `productKey`/`planProduct` schon;
 * ohne Durchreichen wäre der Umzug ein stiller Rechte-Verlust.
 *
 * NUR UX. Die Autorität bleibt `requiredCapability` in der Page-Meta jedes
 * Kindes und `requireCommunityPermission` auf den Routen dahinter.
 */
import type { NavigationMenuItem } from '@nuxt/ui'
import { isProductStateEnabled } from '../../../../core/shared/types/config'
import type { Capability } from '../../../../core/shared/types/authz'
import type { PukalaniSettingsTab } from '../../../../core/shared/types/settings-tab'
import { resolveSettingsTabs } from '../../../../core/shared/types/settings-tab'
import { configFlagEnabled, resolveDashboardPlace } from '../../../../core/shared/dashboardNav'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const auth = useAuthStore()
const appConfig = useAppConfig()

useHead({ title: () => t('dashboard.communitySettings.title') })

const place = resolveDashboardPlace(
  (appConfig.pukalani as { tenancy?: { enabled?: boolean } }).tenancy?.enabled === true,
  useIsTenantHost(),
)
const { capabilities: siteCaps } = useCommunityRole()
const canAsOperator = (capability: Capability) => userHasCapability(auth.user, capability)
const canAsMember = (capability: Capability) => siteCaps.value.has(capability)

// Dieselben drei Gates wie in der Sidebar (packages/admin/app/layouts/
// dashboard.vue) — und aus denselben drei Quellen: Betreiber-Schalter zur
// Laufzeit, Tarif dieser Community, Bau-Schalter der App.
const runtimeFlags = useRuntimeFlags()
const productOn = (productKey?: string) =>
  !productKey || isProductStateEnabled(runtimeFlags.value.products[productKey])
const { planAllows } = useTenantPlan()
const planOn = (planProduct: string) => planAllows(planProduct)
const configOn = (configFlag: string) => configFlagEnabled(appConfig.pukalani, configFlag)

const tabs = computed<PukalaniSettingsTab[]>(() => resolveSettingsTabs(
  (appConfig.pukalani as { admin?: { communityTabs?: PukalaniSettingsTab[] } }).admin?.communityTabs,
  { place, canAsOperator, canAsMember, productOn, planOn, configOn },
))

if (!tabs.value.length) {
  throw createError({ status: 404, statusText: 'Not found' })
}

/**
 * DIE HÜLLE HAT NICHT ÜBERALL EIN INDEX-KIND. Den Reiter „Allgemein"
 * (`/dashboard/community` selbst) bringt der onboarding-Layer mit; eine
 * SILO-App hat ihn nicht und beginnt bei „Eigene Domain". Wer die Adresse
 * dort dennoch eintippt, bekäme eine Kopfzeile mit Reitern und darunter
 * nichts — deshalb geht es weiter zum ersten Reiter, den es wirklich gibt.
 *
 * `replace`, damit der Rück-Knopf nicht in dieselbe leere Adresse zurückfällt.
 * Der Menüpunkt in der Seitenleiste zeigt ohnehin schon dorthin; das hier ist
 * das Netz für Lesezeichen und Tippfinger.
 */
const hullPath = localePath('/dashboard/community')
const first = tabs.value[0]
if (first && route.path === hullPath && !tabs.value.some(tab => localePath(tab.to) === hullPath)) {
  await navigateTo(localePath(first.to), { replace: true })
}

const links = computed<NavigationMenuItem[]>(() => tabs.value.map(tab => ({
  label: t(tab.labelKey),
  icon: tab.icon,
  to: localePath(tab.to),
  // Der erste Reiter ist der INDEX der Hülle — ohne `exact` bliebe er auf
  // jedem Geschwister-Reiter mit hervorgehoben (sein Pfad ist deren Präfix).
  exact: tab.to === '/dashboard/community',
})))

/**
 * Zwei Breiten, ein Grund: Formularseiten lesen sich schmal besser, Tabellen
 * brauchen Platz (dieselbe Rechnung wie in der Konto-Hülle bei den Sitzungen).
 * Mitglieder und Analytics sind die beiden Reiter mit Datenlisten bzw. breiten
 * Kästen.
 */
const containerWidth = computed(() =>
  route.path.endsWith('/community/members') ? 'lg:max-w-5xl' : 'lg:max-w-3xl')
</script>

<template>
  <UDashboardPanel id="community-settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="t('dashboard.communitySettings.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:gap-12" :class="containerWidth">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
