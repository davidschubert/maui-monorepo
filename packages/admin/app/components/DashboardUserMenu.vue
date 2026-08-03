<script setup lang="ts">
// Account-Menü unten links in der Sidebar (Vorbild: UserMenu des Nuxt-UI-Templates),
// angepasst an unser Theme-System (Pukalani-Themes + Varianten), Appearance, Sprache, Logout.
import type { DropdownMenuItem } from '@nuxt/ui'
import { isProductStateEnabled } from '../../../core/shared/types/config'
import { configFlagEnabled, filterDashboardModules, resolveDashboardPlace } from '../../../core/shared/dashboardNav'

defineProps<{ collapsed?: boolean }>()

// Eigene Felder für den getönten Swatch-Icon-Slot (Theme-/Variant-Farbe)
type SwatchItem = DropdownMenuItem & { swatchIcon?: string, swatchColor?: string }

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const colorMode = useColorMode()
const auth = useAuthStore()
const appConfig = useAppConfig()
const runtimeFlags = useRuntimeFlags()
const { planAllows } = useTenantPlan()
const { themes, theme, variant, setTheme, setVariant, neutrals, neutral, setNeutral, canChooseTheme, canChooseNeutral } = useTheme()
const localeOptions = useLocaleOptions()
const { capabilities: siteCaps } = useCommunityRole()

// Dieselbe Ebenen-Regel wie in der Sidebar (E9, core/shared/dashboardNav.ts):
// das Account-Menü ist ein zweiter Ausgang der GLEICHEN Registry — ohne den
// Filter stünde ein Betreiber-Eintrag (Zahlungs-Protokolle) auf einem
// Mandanten-Host bloß woanders.
const place = resolveDashboardPlace(
  (appConfig.pukalani as { tenancy?: { enabled?: boolean } }).tenancy?.enabled === true,
  useIsTenantHost(),
)

// Sidebar-Optik (sidebar | floating | inset) — geteilt mit dem Dashboard-Layout via Cookie
const sidebarVariant = useCookie<'sidebar' | 'floating' | 'inset'>('pukalani-sidebar-variant', { default: () => 'floating' })

const displayName = computed(() => auth.user?.name || t('ui.account'))
const avatar = computed(() => {
  const src = typeof auth.user?.prefs?.avatarUrl === 'string' ? auth.user.prefs.avatarUrl : undefined
  return { src, alt: displayName.value }
})

const { logout } = useLogout()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

// Theme + optionale Variante in einem Schritt setzen (setTheme resettet die Variante)
function selectTheme(id: string, variantId: string | null) {
  setTheme(id)
  if (variantId) setVariant(variantId)
}

const items = computed<SwatchItem[][]>(() => {
  // Jedes Theme; mit Varianten → eigenes Aufklapp-Menü (Standard + Varianten)
  const themeChildren: SwatchItem[] = themes.value.map((entry) => {
    if (!entry.variants.length) {
      return {
        label: entry.name,
        slot: 'swatch',
        swatchIcon: 'i-ph-palette',
        swatchColor: entry.color,
        type: 'checkbox',
        checked: theme.value.id === entry.id,
        onSelect: (event: Event) => { event.preventDefault(); selectTheme(entry.id, null) },
      }
    }
    return {
      label: entry.name,
      slot: 'swatch',
      swatchIcon: 'i-ph-palette',
      swatchColor: entry.color,
      children: [
        {
          label: t('themes.variantDefault'),
          slot: 'swatch',
          swatchIcon: 'i-ph-swatches',
          swatchColor: entry.color,
          type: 'checkbox',
          checked: theme.value.id === entry.id && variant.value === null,
          onSelect: (event: Event) => { event.preventDefault(); selectTheme(entry.id, null) },
        },
        ...entry.variants.map(v => ({
          label: capitalize(v.id),
          slot: 'swatch',
          swatchIcon: 'i-ph-swatches',
          swatchColor: v.color,
          type: 'checkbox' as const,
          checked: theme.value.id === entry.id && variant.value === v.id,
          onSelect: (event: Event) => { event.preventDefault(); selectTheme(entry.id, v.id) },
        })),
      ],
    }
  })

  const neutralChildren: SwatchItem[] = neutrals.value.map(n => ({
    label: n.tinted ? t('themes.neutralTinted') : capitalize(n.id),
    slot: 'swatch',
    swatchIcon: 'i-ph-circle-fill',
    swatchColor: n.color,
    type: 'checkbox',
    checked: neutral.value === n.id,
    onSelect: (event: Event) => { event.preventDefault(); setNeutral(n.id) },
  }))

  const appearanceChildren: DropdownMenuItem[] = ([
    ['light', 'i-ph-sun'],
    ['dark', 'i-ph-moon'],
    ['system', 'i-ph-monitor'],
  ] as const).map(([mode, icon]) => ({
    label: t(`dashboard.appearance.${mode}`),
    icon,
    type: 'checkbox',
    checked: colorMode.preference === mode,
    onSelect: (event: Event) => { event.preventDefault(); colorMode.preference = mode },
  }))

  const sidebarChildren: DropdownMenuItem[] = (['sidebar', 'floating', 'inset'] as const).map(value => ({
    label: t(`dashboard.sidebar.${value}`),
    type: 'checkbox',
    checked: sidebarVariant.value === value,
    onSelect: (event: Event) => { event.preventDefault(); sidebarVariant.value = value },
  }))

  const languageChildren: DropdownMenuItem[] = localeOptions.value.map(option => ({
    label: option.label,
    icon: option.flag,
    type: 'checkbox',
    checked: locale.value === option.code,
    onSelect: (event: Event) => { event.preventDefault(); setLocale(option.code as typeof locale.value) },
  }))

  // Registry-Module mit placement 'userMenu' (z.B. Abos aus dem billing-Layer)
  // sitzen ÜBER den Einstellungen — Konto-nahe Bereiche gehören hierher (A14).
  // Produkt-Gate wie in der Sidebar: deaktivierte Produkte verschwinden (F2).
  // Capability aus Label ODER Site-Rolle (N1, wie Sidebar) — für Site-Rollen
  // ändert sich praktisch nichts (billing.manage & Co. tragen sie nicht).
  const userMenuModules: DropdownMenuItem[] = filterDashboardModules(
    (appConfig.pukalani?.admin?.modules ?? []) as PukalaniAdminModule[],
    {
      place,
      placement: 'userMenu',
      canAsOperator: cap => userHasCapability(auth.user, cap),
      canAsMember: cap => siteCaps.value.has(cap),
      productOn: key => !key || isProductStateEnabled(runtimeFlags.value.products[key]),
      // Tarif-Gate wie in der Sidebar (C2) — ohne Pool-Tenant immer true.
      planOn: key => planAllows(key),
      // Bau-Schalter der App (F37) — wie in der Sidebar.
      configOn: key => configFlagEnabled(appConfig.pukalani, key),
    },
  ).map(m => ({ label: t(m.labelKey), icon: m.icon, to: localePath(m.to) }))

  return [
    [{ type: 'label', label: displayName.value, avatar: avatar.value }],
    [
      ...userMenuModules,
      { label: t('dashboard.settings.title'), icon: 'i-ph-gear', to: localePath('/dashboard/settings') },
    ],
    [
      // Farbwelt nur, wo die Wahl dem Betrachter gehört (kein Mandanten-Host,
      // Entscheidung 2026-07-29/B5): auf `name.pukalani.app` gewinnt die Farbe
      // der Community, das Cookie wird dort nicht gelesen — ein Umschalter
      // ohne Wirkung gehört nicht ins Menü. Die Community-Farbe setzt der
      // Owner unter /dashboard/branding („Erscheinungsbild", seit F5).
      ...(canChooseTheme.value
        ? [{ label: t('themes.label'), icon: 'i-ph-palette', children: themeChildren }]
        : []),
      // Neutral-Palette: seit dem 2026-07-29 dieselbe Regel (Rest von B5) — auf
      // einem Mandanten-Host gehört sie der Community, also verschwindet der
      // Umschalter hier ebenfalls. Hell/Dunkel, Seitenleiste und Sprache
      // bleiben stehen: das sind Wahlmöglichkeiten DES BETRACHTERS.
      ...(canChooseNeutral.value
        ? [{ label: t('themes.neutralLabel'), icon: 'i-ph-circle-half', children: neutralChildren }]
        : []),
      { label: t('themes.modeLabel'), icon: 'i-ph-sun-horizon', children: appearanceChildren },
      { label: t('dashboard.sidebar.label'), icon: 'i-ph-sidebar-simple', children: sidebarChildren },
      { label: t('ui.language'), icon: 'i-ph-globe', children: languageChildren },
    ],
    [{ label: t('auth.logout'), icon: 'i-ph-sign-out', onSelect: () => { void logout() } }],
  ]
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :avatar="avatar"
      :label="collapsed ? undefined : displayName"
      :trailing-icon="collapsed ? undefined : 'i-ph-caret-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />

    <template #swatch-leading="{ item }">
      <UIcon
        :name="(item as SwatchItem).swatchIcon ?? ''"
        class="size-5 shrink-0"
        :style="{ color: (item as SwatchItem).swatchColor }"
      />
    </template>
  </UDropdownMenu>
</template>
