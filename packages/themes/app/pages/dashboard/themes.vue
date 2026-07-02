<script setup lang="ts">
/**
 * Theme-Studio (Admin): Galerie aller Themes (Built-ins + eigene) mit
 * Live-Wechsel, Nuxt-UI-Showcase darunter, und CRUD für eigene Themes
 * (Ramp aus Basisfarbe generiert, Kontrast-Check, CSS-Export).
 * Registriert via maui.admin.modules (Layer-Vertrag, A14).
 */
import type { CustomThemeDto } from '../../../shared/ramp'
import { contrastRatio, customThemeAttr, customThemeCss, generateRamp, HEX_COLOR_RE, SHADES, wcagLevel } from '../../../shared/ramp'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t } = useI18n()
const toast = useToast()
const colorMode = useColorMode()
const localePath = useLocalePath()
const { themes, theme, variant, setTheme, setVariant, neutrals, neutral, setNeutral } = useTheme()
const customThemes = useCustomThemesState()

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

// ── Galerie ────────────────────────────────────────────────────────────────
const customById = computed(() => new Map(customThemes.value.map(c => [customThemeAttr(c.id), c])))

function isActive(id: string): boolean {
  return theme.value.id === id
}
function rampFor(themeId: string): string[] {
  const custom = customById.value.get(themeId)
  if (!custom) return []
  const ramp = generateRamp(custom.primary)
  return ramp ? SHADES.map(s => ramp[s]) : []
}

// ── Editor (anlegen + bearbeiten) ──────────────────────────────────────────
const editor = ref<{ id: string | null, name: string, primary: string } | null>(null)
const busy = ref(false)

function openCreate() {
  editor.value = { id: null, name: '', primary: '#2f7fee' }
}
function openEdit(custom: CustomThemeDto) {
  editor.value = { id: custom.id, name: custom.name, primary: custom.primary }
}

const editorRamp = computed(() => {
  if (!editor.value || !HEX_COLOR_RE.test(editor.value.primary)) return null
  return generateRamp(editor.value.primary)
})

// Kontrast-Checks der kritischen Kombinationen (Button-Text auf primary)
const contrastChecks = computed(() => {
  const ramp = editorRamp.value
  if (!ramp) return []
  return [
    { label: t('themes.studio.contrastWhite500'), bg: ramp[500], fg: '#ffffff' },
    { label: t('themes.studio.contrastWhite600'), bg: ramp[600], fg: '#ffffff' },
    { label: t('themes.studio.contrastBlack200'), bg: ramp[200], fg: '#000000' },
  ].map((check) => {
    const ratio = contrastRatio(check.bg, check.fg) ?? 0
    return { ...check, ratio, level: wcagLevel(ratio) }
  })
})

const editorValid = computed(() =>
  !!editor.value && editor.value.name.trim().length > 0 && HEX_COLOR_RE.test(editor.value.primary),
)

async function saveEditor() {
  if (!editor.value || !editorValid.value) return
  busy.value = true
  try {
    const body = { name: editor.value.name.trim(), primary: editor.value.primary.toLowerCase() }
    if (editor.value.id) {
      await $fetch(`/api/admin/themes/${editor.value.id}`, { method: 'PATCH', body })
    }
    else {
      const created = await $fetch<CustomThemeDto>('/api/admin/themes', { method: 'POST', body })
      // Direkt aktivieren — der Admin sieht sein neues Theme sofort
      await refreshCustomThemes()
      setTheme(customThemeAttr(created.id))
      toast.add({ title: t('themes.studio.saved'), color: 'success' })
      editor.value = null
      return
    }
    await refreshCustomThemes()
    toast.add({ title: t('themes.studio.saved'), color: 'success' })
    editor.value = null
  }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    toast.add({ title: status === 422 ? t('themes.studio.limit') : t('themes.studio.error'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// ── Löschen ────────────────────────────────────────────────────────────────
const pendingDelete = ref<CustomThemeDto | null>(null)

async function executeDelete() {
  if (!pendingDelete.value) return
  busy.value = true
  try {
    await $fetch(`/api/admin/themes/${pendingDelete.value.id}`, { method: 'DELETE' })
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

// ── Showcase-Daten ─────────────────────────────────────────────────────────
const showcaseColors = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
const showcaseVariants = ['solid', 'outline', 'soft', 'subtle'] as const
const demoText = ref('')
const demoSelect = ref('a')
const demoCheck = ref(true)
const demoSwitch = ref(true)
const demoRange = ref(60)
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
          <UButton icon="i-ph-plus" color="primary" @click="openCreate">
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
              v-for="entry in themes"
              :key="entry.id"
              variant="subtle"
              class="cursor-pointer transition"
              :class="isActive(entry.id) ? 'ring-2 ring-primary' : 'hover:ring-accented'"
              :ui="{ container: 'min-w-0 p-4 sm:p-4' }"
              @click="setTheme(entry.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="size-4 shrink-0 rounded-full ring-1 ring-default" :style="{ backgroundColor: entry.color }" />
                  <span class="truncate font-medium">{{ entry.name }}</span>
                  <UBadge v-if="customById.has(entry.id)" color="neutral" variant="subtle" size="sm">{{ t('themes.studio.customBadge') }}</UBadge>
                </div>
                <UBadge v-if="isActive(entry.id)" color="primary" variant="subtle" size="sm">{{ t('themes.studio.active') }}</UBadge>
              </div>

              <!-- Custom: komplette generierte Ramp · Built-in: Varianten-Punkte -->
              <div v-if="rampFor(entry.id).length" class="mt-3 flex h-6 w-full overflow-hidden rounded-md ring-1 ring-default">
                <span v-for="(color, i) in rampFor(entry.id)" :key="i" class="flex-1" :style="{ backgroundColor: color }" />
              </div>
              <div v-else-if="entry.variants.length" class="mt-3 flex items-center gap-1.5" @click.stop>
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

              <!-- Aktionen für eigene Themes -->
              <div v-if="customById.has(entry.id)" class="mt-3 flex items-center gap-1" @click.stop>
                <UButton icon="i-ph-pencil-simple" size="xs" color="neutral" variant="ghost" :aria-label="t('themes.studio.edit')" @click="openEdit(customById.get(entry.id)!)" />
                <UButton icon="i-ph-arrow-up" size="xs" color="neutral" variant="ghost" :disabled="busy" :aria-label="t('themes.studio.moveUp')" @click="move(customById.get(entry.id)!, -1)" />
                <UButton icon="i-ph-arrow-down" size="xs" color="neutral" variant="ghost" :disabled="busy" :aria-label="t('themes.studio.moveDown')" @click="move(customById.get(entry.id)!, 1)" />
                <UButton icon="i-ph-code" size="xs" color="neutral" variant="ghost" :aria-label="t('themes.studio.export')" @click="copyCss(customById.get(entry.id)!)" />
                <UButton icon="i-ph-trash" size="xs" color="error" variant="ghost" class="ms-auto" :aria-label="t('themes.studio.delete')" @click="pendingDelete = customById.get(entry.id)!" />
              </div>
            </UPageCard>
          </div>
          <p class="mt-2 text-xs text-muted">{{ t('themes.studio.galleryHint') }}</p>
        </section>

        <!-- Live-Showcase (Nuxt UI) -->
        <section>
          <h2 class="mb-3 font-semibold">{{ t('themes.studio.showcase') }}</h2>
          <div class="grid min-w-0 gap-4 lg:grid-cols-2">
            <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
              <div class="space-y-2">
                <div v-for="v in showcaseVariants" :key="v" class="flex flex-wrap gap-1.5">
                  <UButton v-for="c in showcaseColors" :key="c" :color="c" :variant="v" size="sm">{{ capitalize(c) }}</UButton>
                </div>
                <div class="flex flex-wrap gap-1.5 pt-1">
                  <UBadge v-for="c in showcaseColors" :key="c" :color="c" variant="subtle">{{ capitalize(c) }}</UBadge>
                </div>
              </div>
            </UPageCard>
            <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
              <div class="space-y-3">
                <UInput v-model="demoText" :placeholder="t('themes.studio.demo.placeholder')" icon="i-ph-magnifying-glass" class="w-full" />
                <USelect v-model="demoSelect" :items="[{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }]" class="w-full" />
                <div class="flex flex-wrap items-center gap-4">
                  <UCheckbox v-model="demoCheck" :label="t('themes.studio.demo.checkbox')" />
                  <USwitch v-model="demoSwitch" :label="t('themes.studio.demo.switch')" />
                </div>
                <USlider v-model="demoRange" />
                <UProgress :model-value="demoRange" />
                <UAlert icon="i-ph-info" color="primary" variant="subtle" :title="t('themes.studio.demo.alertTitle')" :description="t('themes.studio.demo.alertText')" />
              </div>
            </UPageCard>
          </div>
        </section>
      </div>

      <!-- Editor-Modal -->
      <UModal
        :open="editor !== null"
        :title="editor?.id ? t('themes.studio.edit') : t('themes.studio.create')"
        @update:open="(value: boolean) => { if (!value) editor = null }"
      >
        <template #body>
          <div v-if="editor" class="space-y-4">
            <UFormField :label="t('themes.studio.name')" required>
              <UInput v-model="editor.name" :maxlength="64" class="w-full" />
            </UFormField>
            <UFormField :label="t('themes.studio.color')" required>
              <div class="flex items-center gap-2">
                <input
                  v-model="editor.primary"
                  type="color"
                  class="size-9 cursor-pointer rounded-md border border-default bg-transparent p-0.5"
                  :aria-label="t('themes.studio.color')"
                >
                <UInput v-model="editor.primary" placeholder="#2f7fee" class="w-32 font-mono" :maxlength="7" />
              </div>
            </UFormField>

            <div v-if="editorRamp" class="space-y-2">
              <p class="text-sm text-muted">{{ t('themes.studio.rampPreview') }}</p>
              <div class="flex h-8 w-full overflow-hidden rounded-md ring-1 ring-default">
                <span v-for="shade in SHADES" :key="shade" class="flex-1" :style="{ backgroundColor: editorRamp[shade] }" :title="`${shade}`" />
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="check in contrastChecks"
                  :key="check.label"
                  :color="check.level === 'fail' ? 'error' : check.level === 'AA18' ? 'warning' : 'success'"
                  variant="subtle"
                  size="sm"
                  :title="t('themes.studio.contrastHint')"
                >
                  {{ check.label }}: {{ check.ratio.toFixed(1) }} · {{ check.level === 'fail' ? t('themes.studio.contrastFail') : check.level }}
                </UBadge>
              </div>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="editor = null">{{ t('ui.cancel') }}</UButton>
            <UButton color="primary" :disabled="!editorValid" :loading="busy" @click="saveEditor">{{ t('ui.save') }}</UButton>
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
