<script setup lang="ts">
/**
 * Customize theme (Admin): Galerie aller Themes (Built-ins + eigene) mit
 * Live-Wechsel, Nuxt-UI-Showcase darunter. Anlegen/Bearbeiten auf der
 * Theme-Editor-Seite (/dashboard/themes/new bzw. /:id).
 * Registriert via pukalani.admin.modules (Layer-Vertrag, A14).
 */
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { CustomThemeDto, ThemeSettings } from '../../../../shared/ramp'
import { THEME_REGISTRY } from '../../../utils/themeRegistry'
import { customThemeAttr, customThemeCss } from '../../../../shared/ramp'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t } = useI18n()
const toast = useToast()
const colorMode = useColorMode()
const localePath = useLocalePath()
const { theme, variant, setTheme, setVariant, neutrals, neutral, setNeutral, canChooseTheme, canChooseNeutral } = useTheme()
const customThemes = useCustomThemesState()
const settings = useThemeSettingsState()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

// Alle Built-in-Theme-CSS vorladen: der Live-Wechsel in der Galerie tauscht
// den Stylesheet-Link — ohne Preload wartet jeder Wechsel auf den Request
// (spürbare Verzögerung beim schnellen Durchklicken).
useHead({
  link: THEME_REGISTRY
    .filter(entry => entry.file)
    .map(entry => ({ rel: 'preload' as const, as: 'style' as const, href: entry.file! })),
})

// ── Galerie ────────────────────────────────────────────────────────────────
const customById = computed(() => new Map(customThemes.value.map(c => [customThemeAttr(c.id), c])))

// Studio zeigt ALLE Built-ins (auch ausgeblendete, gedimmt) — useTheme filtert
// sie für die normalen Menüs heraus.
interface GalleryEntry { id: string, name: string, color: string, variants: { id: string, color: string }[], hidden: boolean, isCustom: boolean }
const galleryThemes = computed<GalleryEntry[]>(() => {
  const overrides = settings.value.builtins ?? {}
  const builtins = THEME_REGISTRY
    .map((entry, index) => ({ entry, override: overrides[entry.id], index }))
    .sort((a, b) => (a.override?.order ?? a.index) - (b.override?.order ?? b.index))
    .map(({ entry, override }) => ({
      id: entry.id,
      name: override?.name ?? entry.name,
      color: entry.color,
      variants: entry.variants,
      hidden: override?.hidden === true,
      isCustom: false,
    }))
  const customs = sortedCustoms.value.map(custom => ({
    id: customThemeAttr(custom.id),
    name: custom.name,
    color: custom.primary,
    variants: custom.variants ?? [],
    hidden: false,
    isCustom: true,
  }))
  return [...builtins, ...customs]
})

const effectiveDefaultId = computed(() => settings.value.defaultThemeId ?? 'default')

// ── Instanz-Einstellungen (Default, Built-in-Overrides) ───────────────────
async function saveSettings(next: ThemeSettings) {
  busy.value = true
  try {
    await $fetch('/api/admin/themes/settings', { method: 'PATCH', body: next })
    settings.value = next
    toast.add({ title: t('themes.customize.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('themes.customize.error'), description: t('themes.customize.settingsErrorHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

function setDefaultTheme(id: string, variantId?: string) {
  const next: ThemeSettings = { ...settings.value, defaultThemeId: id }
  if (variantId) next.defaultVariantId = variantId
  else delete next.defaultVariantId
  void saveSettings(next)
}

function toggleBuiltinHidden(id: string) {
  const builtins = { ...(settings.value.builtins ?? {}) }
  builtins[id] = { ...builtins[id], hidden: !builtins[id]?.hidden }
  void saveSettings({ ...settings.value, builtins })
}

function moveBuiltin(id: string, direction: -1 | 1) {
  const ids = galleryThemes.value.filter(entry => !entry.isCustom).map(entry => entry.id)
  const index = ids.indexOf(id)
  const target = index + direction
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  const builtins = { ...(settings.value.builtins ?? {}) }
  ids.forEach((themeId, order) => { builtins[themeId] = { ...builtins[themeId], order } })
  void saveSettings({ ...settings.value, builtins })
}

// Built-in umbenennen (Instanz-weit, Override in den Settings)
const builtinRename = ref<{ id: string, name: string } | null>(null)
function saveBuiltinRename() {
  if (!builtinRename.value) return
  const { id, name } = builtinRename.value
  const builtins = { ...(settings.value.builtins ?? {}) }
  const original = THEME_REGISTRY.find(entry => entry.id === id)?.name
  builtins[id] = { ...builtins[id], name: name.trim() && name.trim() !== original ? name.trim() : undefined }
  void saveSettings({ ...settings.value, builtins })
  builtinRename.value = null
}

function isActive(id: string): boolean {
  return theme.value.id === id
}

// 3-Punkte-Menü pro Karte: alle Aktionen gebündelt (Karte selbst = Wechseln)
/**
 * Galerie als Tabelle (Davids Entscheidung 2026-07-28: EIN Konzept, überall).
 * Der visuelle Charakter bleibt in der Vorschau-Spalte: die Farbkreise sind
 * dieselben, und sie bleiben klickbar (UTable ignoriert Klicks auf Buttons
 * und Links beim Zeilen-Klick — der Zeilen-Klick wählt das Theme, der
 * Kreis-Klick zusätzlich die Variante).
 */
const galleryColumns = computed<TableColumn<GalleryEntry>[]>(() => [
  { id: 'swatches', header: () => t('themes.customize.col.preview') },
  { accessorKey: 'name', header: () => t('themes.customize.col.theme') },
  { id: 'actions', header: () => '' },
])

// Aktive Zeile hervorheben, ausgeblendete Themes dimmen — dieselbe Aussage
// wie vorher der Ring bzw. die Deckkraft an der Karte.
const galleryMeta = computed(() => ({
  class: {
    tr: (row: { original: GalleryEntry }) => [
      'cursor-pointer',
      isActive(row.original.id) ? 'bg-elevated' : '',
      row.original.hidden ? 'opacity-50' : '',
    ].filter(Boolean).join(' '),
  },
}))

function cardMenu(entry: GalleryEntry): DropdownMenuItem[][] {
  const isDefault = (variantId?: string) =>
    effectiveDefaultId.value === entry.id && (settings.value.defaultVariantId ?? undefined) === variantId
  // Mit Varianten: Untermenü — auch eine Variante kann Instanz-Default sein
  const setDefaultItem: DropdownMenuItem = entry.variants.length
    ? {
        label: t('themes.customize.setDefault'),
        icon: effectiveDefaultId.value === entry.id ? 'i-ph-star-fill' : 'i-ph-star',
        children: [
          {
            label: t('themes.variantDefault'),
            type: 'checkbox' as const,
            checked: isDefault(undefined),
            disabled: busy.value || isDefault(undefined),
            onSelect: () => setDefaultTheme(entry.id),
          },
          ...entry.variants.map(v => ({
            label: capitalize(v.id),
            type: 'checkbox' as const,
            checked: isDefault(v.id),
            disabled: busy.value || isDefault(v.id),
            onSelect: () => setDefaultTheme(entry.id, v.id),
          })),
        ],
      }
    : {
        label: t('themes.customize.setDefault'),
        icon: effectiveDefaultId.value === entry.id ? 'i-ph-star-fill' : 'i-ph-star',
        disabled: busy.value || isDefault(undefined),
        onSelect: () => setDefaultTheme(entry.id),
      }
  if (entry.isCustom) {
    const custom = customById.value.get(entry.id)!
    return [
      [
        { label: t('themes.customize.edit'), icon: 'i-ph-pencil-simple', onSelect: () => { void navigateTo(localePath(`/dashboard/themes/${custom.id}`)) } },
        { label: t('themes.customize.moveUp'), icon: 'i-ph-arrow-up', disabled: busy.value, onSelect: () => { void move(custom, -1) } },
        { label: t('themes.customize.moveDown'), icon: 'i-ph-arrow-down', disabled: busy.value, onSelect: () => { void move(custom, 1) } },
      ],
      [
        setDefaultItem,
        { label: t('themes.customize.export'), icon: 'i-ph-code', onSelect: () => { void copyCss(custom) } },
        { label: t('themes.customize.exportJson'), icon: 'i-ph-download-simple', onSelect: () => downloadJson(custom) },
      ],
      [
        { label: t('themes.customize.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void remove(custom) } },
      ],
    ]
  }
  return [
    [
      { label: t('themes.customize.rename'), icon: 'i-ph-pencil-simple', onSelect: () => { builtinRename.value = { id: entry.id, name: entry.name } } },
      { label: t('themes.customize.moveUp'), icon: 'i-ph-arrow-up', disabled: busy.value, onSelect: () => moveBuiltin(entry.id, -1) },
      { label: t('themes.customize.moveDown'), icon: 'i-ph-arrow-down', disabled: busy.value, onSelect: () => moveBuiltin(entry.id, 1) },
    ],
    [
      setDefaultItem,
      {
        label: entry.hidden ? t('themes.customize.show') : t('themes.customize.hide'),
        icon: entry.hidden ? 'i-ph-eye' : 'i-ph-eye-slash',
        disabled: busy.value,
        onSelect: () => toggleBuiltinHidden(entry.id),
      },
    ],
  ]
}

const busy = ref(false)

// ── Löschen ────────────────────────────────────────────────────────────────
const confirm = useConfirm()

async function remove(custom: CustomThemeDto) {
  try {
    const ok = await confirm({
      title: t('themes.customize.deleteConfirmTitle'),
      description: t('themes.customize.deleteConfirmText', { name: custom.name }),
      confirmLabel: t('themes.customize.delete'),
      // `as string`: die typisierte Route bietet an diesem Literal nur PATCH an
      // (Nitro-Typegen-Kante mit settings.patch im selben Segment)
      action: () => $fetch(`/api/admin/themes/${custom.id}` as string, { method: 'DELETE' }),
    })
    if (!ok) return
    // War das gelöschte Theme aktiv, zurück auf den Default
    if (theme.value.id === customThemeAttr(custom.id)) setTheme('default')
    await refreshCustomThemes()
    toast.add({ title: t('themes.customize.deleted'), color: 'success' })
  }
  catch {
    toast.add({ title: t('themes.customize.error'), description: t('themes.customize.deleteErrorHint'), color: 'error' })
  }
}

// ── Reihenfolge (Custom Themes) ────────────────────────────────────────────
const sortedCustoms = computed(() => [...customThemes.value].sort((a, b) => a.order - b.order))

async function move(custom: CustomThemeDto, direction: -1 | 1) {
  const list = sortedCustoms.value
  const index = list.findIndex(c => c.id === custom.id)
  const neighbor = list[index + direction]
  if (!neighbor) return
  busy.value = true
  try {
    // Order-Werte tauschen (zwei PATCHes, best effort)
    await $fetch(`/api/admin/themes/${custom.id}`, { method: 'PATCH', body: { order: neighbor.order } })
    await $fetch(`/api/admin/themes/${neighbor.id}`, { method: 'PATCH', body: { order: custom.order } })
    await refreshCustomThemes()
  }
  catch {
    toast.add({ title: t('themes.customize.error'), description: t('themes.customize.orderErrorHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// ── CSS-Export ─────────────────────────────────────────────────────────────
async function copyCss(custom: CustomThemeDto) {
  try {
    await navigator.clipboard.writeText(customThemeCss(custom))
    toast.add({ title: t('themes.customize.exportCopied'), color: 'success' })
  }
  catch {
    // Vorher still: der Klick tat sichtbar nichts. Die Zwischenablage gibt der
    // Browser nur im sicheren Kontext frei — der JSON-Export geht immer.
    toast.add({ title: t('themes.customize.copyFailed'), description: t('themes.customize.copyFailedHint'), color: 'error' })
  }
}

// ── JSON-Export/-Import (Theme auf andere Instanz mitnehmen) ───────────────
function downloadJson(custom: CustomThemeDto) {
  const payload = {
    format: 'pukalani-theme',
    version: 1,
    theme: { name: custom.name, primary: custom.primary, config: custom.config, variants: custom.variants },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `theme-${custom.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

const importInput = ref<HTMLInputElement | null>(null)

/** Nur bekannte Config-Felder übernehmen — die Server-Route validiert strict */
function sanitizeConfig(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const source = raw as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const key of ['mode', 'anchor', 'hueShift', 'saturation', 'lightnessMax', 'lightnessMin', 'radius', 'neutral', 'darkAlias', 'font', 'fontHeading', 'headingWeight', 'headingTracking', 'headingUppercase']) {
    if (source[key] !== undefined) picked[key] = source[key]
  }
  return Object.keys(picked).length ? picked : undefined
}

async function importTheme(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  try {
    const parsed = JSON.parse(await file.text()) as { format?: string, theme?: Record<string, unknown> }
    // Export-Hülle ODER nacktes Theme-Objekt akzeptieren
    const theme = (parsed.format === 'pukalani-theme' ? parsed.theme : parsed) as Record<string, unknown> | undefined
    if (!theme || typeof theme.name !== 'string' || typeof theme.primary !== 'string') {
      throw new Error('invalid')
    }
    await $fetch('/api/admin/themes', {
      method: 'POST',
      body: {
        name: theme.name,
        primary: theme.primary,
        config: sanitizeConfig(theme.config),
        variants: Array.isArray(theme.variants) ? theme.variants : undefined,
      },
    })
    await refreshCustomThemes()
    // Das importierte Theme wird NICHT aktiviert — sonst sucht man es in der Liste
    toast.add({ title: t('themes.customize.saved'), description: t('themes.customize.importedHint'), color: 'success' })
  }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    toast.add({
      title: status === 422 ? t('themes.customize.limit') : t('themes.customize.importError'),
      description: status === 422 ? t('themes.customize.limitHint') : t('themes.customize.importErrorHint'),
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

</script>

<template>
  <UDashboardPanel id="theme-studio" :ui="{ body: 'lg:py-8' }">
    <template #header>
      <UDashboardNavbar :title="t('themes.customize.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-tray-arrow-down" color="neutral" variant="ghost" :disabled="busy" @click="importInput?.click()">
            {{ t('themes.customize.importJson') }}
          </UButton>
          <input ref="importInput" type="file" accept=".json,application/json" class="sr-only" @change="importTheme">
          <UButton icon="i-ph-plus" color="primary" :to="localePath('/dashboard/themes/new')">
            {{ t('themes.customize.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Zweispalten-Layout wie im Control-Editor: Galerie links, Szenen rechts -->
      <div class="mx-auto grid w-full max-w-6xl min-w-0 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <div class="flex min-w-0 flex-col gap-4">
        <!-- Der Live-Umschalter der Galerie ist das THEME-COOKIE des Betrachters.
             Auf einem Mandanten-Host gewinnt seit dem 2026-07-29 die Farbwelt
             der Community (B5) — das Cookie wird dort nicht mehr gelesen, ein
             Klick färbt also nichts um. Statt still nichts zu tun, sagt die
             Seite das: Anlegen, Bearbeiten, Voreinstellung und Reihenfolge
             wirken hier weiter, nur die Vorschau gehört den Instanz-Hosts. -->
        <UAlert
          v-if="!canChooseTheme"
          color="info"
          variant="subtle"
          icon="i-ph-info"
          :title="t('themes.customize.previewLockedTitle')"
          :description="t('themes.customize.previewLockedText')"
        />
        <!-- Schnell-Umschalter: Erscheinungsbild + Neutral -->
        <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted">{{ t('themes.modeLabel') }}</span>
              <UButton
                v-for="mode in (['light', 'dark', 'system'] as const)"
                :key="mode"
                :icon="mode === 'light' ? 'i-ph-sun' : mode === 'dark' ? 'i-ph-moon' : 'i-ph-monitor'"
                size="xs"
                :color="colorMode.preference === mode ? 'primary' : 'neutral'"
                :variant="colorMode.preference === mode ? 'subtle' : 'ghost'"
                :aria-label="t(`themes.appearance.${mode}`)"
                @click="() => { colorMode.preference = mode }"
              />
            </div>
            <!-- Neutral-Palette: derselbe Grund wie beim Theme-Cookie oben —
                 auf einem Mandanten-Host bestimmt sie die Community
                 (`tenants.neutral`, Rest von B5), ein Klick färbte nichts um.
                 Der Hinweis-Alert darüber erklärt es; hier verschwindet nur der
                 wirkungslose Umschalter. Hell/Dunkel bleibt daneben stehen. -->
            <div v-if="canChooseNeutral" class="flex min-w-0 items-center gap-2">
              <span class="text-sm text-muted">{{ t('themes.neutralLabel') }}</span>
              <div class="flex flex-wrap items-center gap-1">
                <button
                  v-for="n in neutrals"
                  :key="n.id"
                  type="button"
                  class="size-5 rounded-full ring-offset-2 ring-offset-default transition"
                  :class="neutral === n.id ? 'ring-2 ring-primary' : 'ring-1 ring-default hover:ring-2'"
                  :style="{ backgroundColor: n.color }"
                  :title="n.tinted ? t('themes.neutralTinted') : capitalize(n.id)"
                  :aria-label="n.tinted ? t('themes.neutralTinted') : capitalize(n.id)"
                  @click="setNeutral(n.id)"
                />
              </div>
            </div>
          </div>
        </UPageCard>

        <!-- Galerie -->
        <section>
          <h2 class="mb-3 font-semibold">{{ t('themes.customize.gallery') }}</h2>
          <UTable
            :data="galleryThemes"
            :columns="galleryColumns"
            :meta="galleryMeta"
            data-themes-gallery
            @select="(_event: Event, row: { original: GalleryEntry }) => setTheme(row.original.id)"
          >
            <!-- Vorschau: Basis + Varianten als Farbkreise -->
            <template #swatches-cell="{ row }">
              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="size-6 rounded-full transition"
                  :class="isActive(row.original.id) && variant === null ? 'ring-2 ring-primary ring-offset-2 ring-offset-default' : 'ring-1 ring-default hover:ring-2'"
                  :style="{ backgroundColor: row.original.color }"
                  :title="t('themes.variantDefault')"
                  :aria-label="t('themes.variantDefault')"
                  @click="setTheme(row.original.id)"
                />
                <button
                  v-for="v in row.original.variants"
                  :key="v.id"
                  type="button"
                  class="size-6 rounded-full transition"
                  :class="isActive(row.original.id) && variant === v.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-default' : 'ring-1 ring-default hover:ring-2'"
                  :style="{ backgroundColor: v.color }"
                  :title="capitalize(v.id)"
                  :aria-label="capitalize(v.id)"
                  @click="() => { setTheme(row.original.id); setVariant(v.id) }"
                />
              </div>
            </template>
            <template #name-cell="{ row }">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="truncate font-medium">{{ row.original.name }}</span>
                <UBadge v-if="row.original.isCustom" color="neutral" variant="subtle" size="sm">{{ t('themes.customize.customBadge') }}</UBadge>
                <UBadge v-if="effectiveDefaultId === row.original.id" color="info" variant="subtle" size="sm">
                  {{ settings.defaultVariantId ? `${t('themes.customize.defaultBadge')} · ${capitalize(settings.defaultVariantId)}` : t('themes.customize.defaultBadge') }}
                </UBadge>
                <UIcon v-if="row.original.hidden" name="i-ph-eye-slash" class="size-4 shrink-0 text-muted" />
              </div>
            </template>
            <!-- Alle Aktionen im 3-Punkte-Menü -->
            <template #actions-cell="{ row }">
              <div class="flex justify-end">
                <UDropdownMenu :items="cardMenu(row.original)" :content="{ align: 'end' }">
                  <UButton
                    icon="i-ph-dots-three-vertical" size="xs" color="neutral" variant="ghost"
                    :aria-label="t('themes.customize.cardActions')"
                  />
                </UDropdownMenu>
              </div>
            </template>
          </UTable>
          <p class="mt-2 text-xs text-muted">{{ t('themes.customize.galleryHint') }}</p>
        </section>
        </div>

        <!-- Live-Vorschau: dieselben Szenen wie im Control-Editor, bleibt beim
             Scrollen durch die Galerie sichtbar -->
        <section class="min-w-0 lg:sticky lg:top-4">
          <h2 class="mb-3 font-semibold">{{ t('themes.customize.showcase') }}</h2>
          <CustomizeScenePreview />
        </section>
      </div>

      <!-- Built-in umbenennen (Instanz-Override) -->
      <UModal
        :open="builtinRename !== null"
        :title="t('themes.customize.rename')"
        @update:open="(value: boolean) => { if (!value) builtinRename = null }"
      >
        <template #body>
          <UFormField v-if="builtinRename" :label="t('themes.customize.name')">
            <UInput v-model="builtinRename.name" :maxlength="64" class="w-full" />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { builtinRename = null }">{{ t('ui.cancel') }}</UButton>
            <UButton color="primary" :loading="busy" @click="saveBuiltinRename">{{ t('ui.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
