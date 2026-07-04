<script setup lang="ts">
/**
 * Theme-Studio (Admin): Galerie aller Themes (Built-ins + eigene) mit
 * Live-Wechsel, Nuxt-UI-Showcase darunter. Anlegen/Bearbeiten auf der
 * Studio-Editor-Seite (/dashboard/themes/new bzw. /:id).
 * Registriert via maui.admin.modules (Layer-Vertrag, A14).
 */
import type { CustomThemeDto, ThemeSettings } from '../../../../shared/ramp'
import { THEME_REGISTRY } from '../../../utils/themeRegistry'
import { customThemeAttr, customThemeCss, generateRamp, SHADES } from '../../../../shared/ramp'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t } = useI18n()
const toast = useToast()
const colorMode = useColorMode()
const localePath = useLocalePath()
const { theme, variant, setTheme, setVariant, neutrals, neutral, setNeutral } = useTheme()
const customThemes = useCustomThemesState()
const settings = useThemeSettingsState()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

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
    toast.add({ title: t('themes.studio.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

function setDefaultTheme(id: string) {
  void saveSettings({ ...settings.value, defaultThemeId: id })
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
function rampFor(themeId: string): string[] {
  const custom = customById.value.get(themeId)
  if (!custom) return []
  const ramp = generateRamp(custom.primary, custom.config ?? {})
  return ramp ? SHADES.map(s => ramp[s]) : []
}

const busy = ref(false)

// ── Löschen ────────────────────────────────────────────────────────────────
const pendingDelete = ref<CustomThemeDto | null>(null)

async function executeDelete() {
  if (!pendingDelete.value) return
  busy.value = true
  try {
    // `as string`: die typisierte Route bietet an diesem Literal nur PATCH an
    // (Nitro-Typegen-Kante mit settings.patch im selben Segment)
    await $fetch(`/api/admin/themes/${pendingDelete.value.id}` as string, { method: 'DELETE' })
    // War das gelöschte Theme aktiv, zurück auf den Default
    if (theme.value.id === customThemeAttr(pendingDelete.value.id)) setTheme('default')
    await refreshCustomThemes()
    toast.add({ title: t('themes.studio.deleted'), color: 'success' })
    pendingDelete.value = null
  }
  catch {
    toast.add({ title: t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
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
    toast.add({ title: t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// ── CSS-Export ─────────────────────────────────────────────────────────────
async function copyCss(custom: CustomThemeDto) {
  try {
    await navigator.clipboard.writeText(customThemeCss(custom))
    toast.add({ title: t('themes.studio.exportCopied'), color: 'success' })
  }
  catch { /* Clipboard nicht verfügbar */ }
}

</script>

<template>
  <UDashboardPanel id="theme-studio" :ui="{ body: 'lg:py-8' }">
    <template #header>
      <UDashboardNavbar :title="t('themes.studio.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-list-magnifying-glass" color="neutral" variant="ghost" :to="localePath('/styleguide')" target="_blank">
            {{ t('themes.studio.styleguideLink') }}
          </UButton>
          <UButton icon="i-ph-plus" color="primary" :to="localePath('/dashboard/themes/new')">
            {{ t('themes.studio.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 sm:gap-6">
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
                @click="colorMode.preference = mode"
              />
            </div>
            <div class="flex min-w-0 items-center gap-2">
              <span class="text-sm text-muted">{{ t('themes.neutralLabel') }}</span>
              <div class="flex flex-wrap items-center gap-1">
                <button
                  v-for="n in neutrals"
                  :key="n.id"
                  type="button"
                  class="size-5 rounded-full ring-offset-2 ring-offset-default transition"
                  :class="neutral === n.id ? 'ring-2 ring-primary' : 'ring-1 ring-default hover:ring-2'"
                  :style="{ backgroundColor: n.color }"
                  :title="capitalize(n.id)"
                  :aria-label="capitalize(n.id)"
                  @click="setNeutral(n.id)"
                />
              </div>
            </div>
          </div>
        </UPageCard>

        <!-- Galerie -->
        <section>
          <h2 class="mb-3 font-semibold">{{ t('themes.studio.gallery') }}</h2>
          <div class="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <UPageCard
              v-for="entry in galleryThemes"
              :key="entry.id"
              variant="subtle"
              class="cursor-pointer transition"
              :class="[isActive(entry.id) ? 'ring-2 ring-primary' : 'hover:ring-accented', entry.hidden ? 'opacity-50' : '']"
              :ui="{ container: 'min-w-0 p-4 sm:p-4' }"
              @click="setTheme(entry.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="size-4 shrink-0 rounded-full ring-1 ring-default" :style="{ backgroundColor: entry.color }" />
                  <span class="truncate font-medium">{{ entry.name }}</span>
                  <UBadge v-if="entry.isCustom" color="neutral" variant="subtle" size="sm">{{ t('themes.studio.customBadge') }}</UBadge>
                  <UBadge v-if="effectiveDefaultId === entry.id" color="info" variant="subtle" size="sm">{{ t('themes.studio.defaultBadge') }}</UBadge>
                  <UIcon v-if="entry.hidden" name="i-ph-eye-slash" class="size-4 shrink-0 text-muted" />
                </div>
                <UBadge v-if="isActive(entry.id)" color="primary" variant="subtle" size="sm">{{ t('themes.studio.active') }}</UBadge>
              </div>

              <!-- Custom: komplette generierte Ramp · Built-in: Varianten-Punkte -->
              <div v-if="rampFor(entry.id).length" class="mt-3 flex h-6 w-full overflow-hidden rounded-md ring-1 ring-default">
                <span v-for="(color, i) in rampFor(entry.id)" :key="i" class="flex-1" :style="{ backgroundColor: color }" />
              </div>
              <div v-if="entry.variants.length" class="mt-3 flex items-center gap-1.5" @click.stop>
                <button
                  type="button"
                  class="size-5 rounded-full transition"
                  :class="isActive(entry.id) && variant === null ? 'ring-2 ring-primary ring-offset-2 ring-offset-default' : 'ring-1 ring-default hover:ring-2'"
                  :style="{ backgroundColor: entry.color }"
                  :title="t('themes.variantDefault')"
                  :aria-label="t('themes.variantDefault')"
                  @click="setTheme(entry.id)"
                />
                <button
                  v-for="v in entry.variants"
                  :key="v.id"
                  type="button"
                  class="size-5 rounded-full transition"
                  :class="isActive(entry.id) && variant === v.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-default' : 'ring-1 ring-default hover:ring-2'"
                  :style="{ backgroundColor: v.color }"
                  :title="capitalize(v.id)"
                  :aria-label="capitalize(v.id)"
                  @click="() => { setTheme(entry.id); setVariant(v.id) }"
                />
              </div>

              <!-- Aktionen: Customs (bearbeiten/sortieren/export/löschen) · Built-ins (umbenennen/sortieren/ausblenden) · beide: als Default setzen -->
              <div class="mt-3 flex items-center gap-1" @click.stop>
                <template v-if="entry.isCustom">
                  <UButton icon="i-ph-pencil-simple" size="xs" color="neutral" variant="ghost" :aria-label="t('themes.studio.edit')" :to="localePath(`/dashboard/themes/${customById.get(entry.id)!.id}`)" />
                  <UButton icon="i-ph-arrow-up" size="xs" color="neutral" variant="ghost" :disabled="busy" :aria-label="t('themes.studio.moveUp')" @click="move(customById.get(entry.id)!, -1)" />
                  <UButton icon="i-ph-arrow-down" size="xs" color="neutral" variant="ghost" :disabled="busy" :aria-label="t('themes.studio.moveDown')" @click="move(customById.get(entry.id)!, 1)" />
                  <UButton icon="i-ph-code" size="xs" color="neutral" variant="ghost" :aria-label="t('themes.studio.export')" @click="copyCss(customById.get(entry.id)!)" />
                </template>
                <template v-else>
                  <UButton icon="i-ph-pencil-simple" size="xs" color="neutral" variant="ghost" :aria-label="t('themes.studio.rename')" @click="builtinRename = { id: entry.id, name: entry.name }" />
                  <UButton icon="i-ph-arrow-up" size="xs" color="neutral" variant="ghost" :disabled="busy" :aria-label="t('themes.studio.moveUp')" @click="moveBuiltin(entry.id, -1)" />
                  <UButton icon="i-ph-arrow-down" size="xs" color="neutral" variant="ghost" :disabled="busy" :aria-label="t('themes.studio.moveDown')" @click="moveBuiltin(entry.id, 1)" />
                  <UButton
                    :icon="entry.hidden ? 'i-ph-eye' : 'i-ph-eye-slash'"
                    size="xs" color="neutral" variant="ghost" :disabled="busy"
                    :aria-label="entry.hidden ? t('themes.studio.show') : t('themes.studio.hide')"
                    @click="toggleBuiltinHidden(entry.id)"
                  />
                </template>
                <UButton
                  :icon="effectiveDefaultId === entry.id ? 'i-ph-star-fill' : 'i-ph-star'"
                  size="xs"
                  :color="effectiveDefaultId === entry.id ? 'info' : 'neutral'"
                  variant="ghost" :disabled="busy || effectiveDefaultId === entry.id"
                  :aria-label="t('themes.studio.setDefault')" :title="t('themes.studio.setDefault')"
                  @click="setDefaultTheme(entry.id)"
                />
                <UButton v-if="entry.isCustom" icon="i-ph-trash" size="xs" color="error" variant="ghost" class="ms-auto" :aria-label="t('themes.studio.delete')" @click="pendingDelete = customById.get(entry.id)!" />
              </div>
            </UPageCard>
          </div>
          <p class="mt-2 text-xs text-muted">{{ t('themes.studio.galleryHint') }}</p>
        </section>

        <!-- Live-Showcase (Nuxt UI) — geteilte Szene, auch im Studio-Editor -->
        <section>
          <h2 class="mb-3 font-semibold">{{ t('themes.studio.showcase') }}</h2>
          <StudioSceneComponents />
        </section>
      </div>

      <!-- Built-in umbenennen (Instanz-Override) -->
      <UModal
        :open="builtinRename !== null"
        :title="t('themes.studio.rename')"
        @update:open="(value: boolean) => { if (!value) builtinRename = null }"
      >
        <template #body>
          <UFormField v-if="builtinRename" :label="t('themes.studio.name')">
            <UInput v-model="builtinRename.name" :maxlength="64" class="w-full" />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="builtinRename = null">{{ t('ui.cancel') }}</UButton>
            <UButton color="primary" :loading="busy" @click="saveBuiltinRename">{{ t('ui.save') }}</UButton>
          </div>
        </template>
      </UModal>

      <!-- Lösch-Bestätigung -->
      <UModal
        :open="pendingDelete !== null"
        :title="t('themes.studio.deleteConfirmTitle')"
        @update:open="(value: boolean) => { if (!value) pendingDelete = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('themes.studio.deleteConfirmText', { name: pendingDelete?.name ?? '' }) }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="pendingDelete = null">{{ t('ui.cancel') }}</UButton>
            <UButton color="error" :loading="busy" @click="executeDelete">{{ t('themes.studio.delete') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
