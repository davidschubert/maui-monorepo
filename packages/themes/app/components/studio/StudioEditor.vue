<script setup lang="ts">
/**
 * Studio-Editor (Vollseite): Dock links (Standard: Name, Farbe, Presets,
 * Zufall — alles Tiefere in EINEM „Erweitert"-Accordion), Vorschau rechts.
 * Live-Draft-Vorschau färbt zusätzlich die ganze Seite (c-draft).
 */
import type { RouteLocationNormalized } from 'vue-router'
import { customThemeAttr, SHADES } from '../../../shared/ramp'
import { FONT_PAIR_REGISTRY } from '../../utils/themeRegistry'

const props = defineProps<{ themeId?: string }>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { setTheme } = useTheme()
const customThemes = useCustomThemesState()
const { draft, busy, isDirty, openCreate, openEdit, applyPreset, randomizePrimary, addVariant, removeVariant, ramp, neutralRamp, valid, contrastChecks, save } = useThemeDraft()

const galleryPath = computed(() => localePath('/dashboard/themes'))
const isEdit = computed(() => !!props.themeId)
const advancedOpen = ref(false)

// Draft aus der Route initialisieren: ohne id = neu, mit id = bestehendes
// Custom Theme (unbekannte id → zurück zur Galerie, kein 404-Rauschen)
if (props.themeId) {
  const custom = customThemes.value.find(c => c.id === props.themeId)
  if (custom) openEdit(custom)
  else await navigateTo(galleryPath.value, { replace: true })
}
else {
  openCreate()
}

const fontItems = computed(() => [
  { label: t('themes.studio.fontDefault'), value: null },
  ...FONT_PAIR_REGISTRY.map(pair => ({ label: pair.label, value: pair.id })),
])

const contrastLabel: Record<string, string> = {
  white500: 'themes.studio.contrastWhite500',
  white600: 'themes.studio.contrastWhite600',
  white400: 'themes.studio.contrastWhite400',
  black200: 'themes.studio.contrastBlack200',
}

async function saveDraft() {
  try {
    const { created } = await save()
    toast.add({ title: t('themes.studio.saved'), color: 'success' })
    // Neu angelegt: direkt aktivieren — der Admin sieht sein Theme sofort
    if (created) setTheme(customThemeAttr(created.id))
    await navigateTo(galleryPath.value)
  }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    toast.add({ title: status === 422 ? t('themes.studio.limit') : t('themes.studio.error'), color: 'error' })
  }
}

// Ungespeicherte Änderungen: Navigation anhalten, per Modal bestätigen lassen
const pendingLeave = ref<string | null>(null)
let forceLeave = false
onBeforeRouteLeave((to: RouteLocationNormalized) => {
  if (forceLeave || !isDirty.value) return true
  pendingLeave.value = to.fullPath
  return false
})
function confirmLeave() {
  const target = pendingLeave.value
  pendingLeave.value = null
  if (!target) return
  forceLeave = true
  void navigateTo(target)
}
</script>

<template>
  <UDashboardPanel id="theme-studio-editor" :ui="{ body: 'lg:py-8' }">
    <template #header>
      <UDashboardNavbar :title="isEdit ? t('themes.studio.edit') : t('themes.studio.create')">
        <template #leading>
          <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" :to="galleryPath" :aria-label="t('themes.studio.back')" />
        </template>
        <template #right>
          <UButton color="primary" :disabled="!valid" :loading="busy" @click="saveDraft">
            {{ t('ui.save') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="draft" class="mx-auto w-full max-w-6xl min-w-0">
        <div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
          <!-- Dock -->
          <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
            <div class="space-y-4">
              <UFormField :label="t('themes.studio.name')" required>
                <UInput v-model="draft.name" :maxlength="64" class="w-full" />
              </UFormField>

              <UFormField :label="t('themes.studio.color')" required>
                <div class="flex items-center gap-2">
                  <input
                    v-model="draft.primary"
                    type="color"
                    class="size-9 cursor-pointer rounded-md border border-default bg-transparent p-0.5"
                    :aria-label="t('themes.studio.color')"
                  >
                  <UInput v-model="draft.primary" placeholder="#2f7fee" class="w-28 font-mono" :maxlength="7" />
                  <UButton
                    icon="i-ph-dice-five" color="neutral" variant="subtle"
                    :aria-label="t('themes.studio.random')" :title="t('themes.studio.random')"
                    @click="randomizePrimary"
                  />
                </div>
              </UFormField>

              <!-- Tinted Neutral: EIN Schalter, fixer Tönungswert (kein Regler) -->
              <div class="space-y-1.5">
                <USwitch
                  :model-value="draft.config.neutral === 'tinted'"
                  :label="t('themes.studio.tintedNeutral')"
                  @update:model-value="(on: boolean) => { draft!.config.neutral = on ? 'tinted' : null }"
                />
                <div v-if="neutralRamp" class="flex h-4 w-full overflow-hidden rounded ring-1 ring-default">
                  <span v-for="shade in SHADES" :key="shade" class="flex-1" :style="{ backgroundColor: neutralRamp[shade] }" />
                </div>
              </div>

              <!-- Schriftpaar (kuratiert, Default = App-Font) -->
              <UFormField :label="t('themes.studio.font')">
                <USelect v-model="draft.config.font" :items="fontItems" class="w-full" />
              </UFormField>

              <div v-if="!draft.id" class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm text-muted">{{ t('themes.studio.presets') }}</span>
                <UButton
                  v-for="preset in THEME_PRESETS"
                  :key="preset.name"
                  size="xs" color="neutral" variant="subtle"
                  @click="applyPreset(preset)"
                >
                  <span class="size-3 rounded-full" :style="{ backgroundColor: preset.primary }" />
                  {{ preset.name }}
                </UButton>
              </div>

              <USeparator />

              <!-- Erweitert: alles Tiefere in EINEM Accordion, gute Defaults -->
              <UCollapsible v-model:open="advancedOpen">
                <UButton
                  color="neutral" variant="ghost" block
                  :trailing-icon="advancedOpen ? 'i-ph-caret-up' : 'i-ph-caret-down'"
                  :ui="{ base: 'justify-between px-0' }"
                >
                  {{ t('themes.studio.advanced') }}
                </UButton>
                <template #content>
                  <div class="space-y-4 pt-3">
                    <div class="grid grid-cols-2 gap-3">
                      <UFormField :label="t('themes.studio.mode')">
                        <USwitch
                          :model-value="draft.config.mode === 'perceived'"
                          :label="draft.config.mode === 'perceived' ? t('themes.studio.modePerceived') : t('themes.studio.modeLinear')"
                          @update:model-value="(on: boolean) => { draft!.config.mode = on ? 'perceived' : 'linear' }"
                        />
                      </UFormField>
                      <UFormField :label="t('themes.studio.anchor')">
                        <USelect
                          v-model="draft.config.anchor"
                          :disabled="draft.config.mode === 'linear'"
                          :items="[{ label: t('themes.studio.anchorAuto'), value: 'auto' }, ...SHADES.map(s => ({ label: String(s), value: s }))]"
                          class="w-full"
                        />
                      </UFormField>
                      <UFormField :label="`${t('themes.studio.hueShift')} (${draft.config.hueShift}°)`" class="col-span-2">
                        <USlider v-model="draft.config.hueShift" :min="-180" :max="180" :step="5" :disabled="draft.config.mode === 'linear'" />
                      </UFormField>
                      <UFormField :label="`${t('themes.studio.saturation')} (${draft.config.saturation.toFixed(2)})`" class="col-span-2">
                        <USlider v-model="draft.config.saturation" :min="0" :max="2" :step="0.05" :disabled="draft.config.mode === 'linear'" />
                      </UFormField>
                      <UFormField :label="`${t('themes.studio.lightnessMax')} (${draft.config.lightnessMax}%)`">
                        <USlider v-model="draft.config.lightnessMax" :min="80" :max="100" :step="1" :disabled="draft.config.mode === 'linear'" />
                      </UFormField>
                      <UFormField :label="`${t('themes.studio.lightnessMin')} (${draft.config.lightnessMin}%)`">
                        <USlider v-model="draft.config.lightnessMin" :min="0" :max="40" :step="1" :disabled="draft.config.mode === 'linear'" />
                      </UFormField>
                      <UFormField :label="t('themes.studio.darkAlias')" class="col-span-2">
                        <div class="flex items-center gap-1.5">
                          <UButton
                            v-for="stufe in ([300, 400, 500] as const)"
                            :key="stufe"
                            size="xs"
                            :color="draft.config.darkAlias === stufe ? 'primary' : 'neutral'"
                            :variant="draft.config.darkAlias === stufe ? 'subtle' : 'ghost'"
                            @click="draft.config.darkAlias = stufe"
                          >
                            {{ stufe }}{{ stufe === 400 ? ` · ${t('themes.studio.defaultOption')}` : '' }}
                          </UButton>
                        </div>
                      </UFormField>
                      <UFormField :label="t('themes.studio.radius')" class="col-span-2">
                        <div class="flex items-center gap-1.5">
                          <UButton
                            size="xs"
                            :color="draft.config.radius === null ? 'primary' : 'neutral'"
                            :variant="draft.config.radius === null ? 'subtle' : 'ghost'"
                            @click="draft.config.radius = null"
                          >
                            {{ t('themes.studio.radiusDefault') }}
                          </UButton>
                          <UButton
                            v-for="r in [0, 0.125, 0.25, 0.375, 0.5]"
                            :key="r"
                            size="xs"
                            :color="draft.config.radius === r ? 'primary' : 'neutral'"
                            :variant="draft.config.radius === r ? 'subtle' : 'ghost'"
                            @click="draft.config.radius = r"
                          >
                            {{ r }}
                          </UButton>
                        </div>
                      </UFormField>
                    </div>

                    <!-- Kurvenverlauf der generierten Ramp (L/C/H, Anker markiert) -->
                    <div v-if="ramp && draft.config.mode === 'perceived'" class="space-y-1.5">
                      <p class="text-sm text-muted">{{ t('themes.studio.curves') }}</p>
                      <StudioCurves :ramp="ramp" :primary="draft.primary" />
                    </div>

                    <!-- Farbvarianten (wie Ocean/Teal) -->
                    <UFormField :label="t('themes.studio.variants')">
                      <div class="space-y-2">
                        <div v-for="(v, index) in draft.variants" :key="index" class="flex items-center gap-2">
                          <input
                            v-model="v.color"
                            type="color"
                            class="size-8 cursor-pointer rounded-md border border-default bg-transparent p-0.5"
                            :aria-label="`${t('themes.studio.variants')} ${v.id}`"
                          >
                          <UInput v-model="v.color" class="w-28 font-mono" :maxlength="7" />
                          <span class="text-xs text-muted">{{ v.id }}</span>
                          <UButton icon="i-ph-x" size="xs" color="neutral" variant="ghost" :aria-label="t('themes.studio.delete')" @click="removeVariant(index)" />
                        </div>
                        <UButton icon="i-ph-plus" size="xs" color="neutral" variant="subtle" :disabled="draft.variants.length >= 6" @click="addVariant">
                          {{ t('themes.studio.addVariant') }}
                        </UButton>
                      </div>
                    </UFormField>
                  </div>
                </template>
              </UCollapsible>
            </div>
          </UPageCard>

          <!-- Vorschau: geteilte Szenen-Tabs, darunter Ramp + Kontrast -->
          <div class="min-w-0 space-y-4">
            <StudioScenePreview />

            <UAlert icon="i-ph-eye" color="primary" variant="subtle" :description="t('themes.studio.draftHint')" />

            <UPageCard v-if="ramp" variant="subtle" :ui="{ container: 'min-w-0' }">
              <div class="space-y-2">
                <p class="text-sm text-muted">{{ t('themes.studio.rampPreview') }}</p>
                <div class="flex h-8 w-full overflow-hidden rounded-md ring-1 ring-default">
                  <span v-for="shade in SHADES" :key="shade" class="flex-1" :style="{ backgroundColor: ramp[shade] }" :title="`${shade}`" />
                </div>
                <div class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="check in contrastChecks"
                    :key="check.key"
                    :color="check.level === 'fail' ? 'error' : check.level === 'AA18' ? 'warning' : 'success'"
                    variant="subtle"
                    size="sm"
                    :title="t('themes.studio.contrastHint')"
                  >
                    {{ t(contrastLabel[check.key]!) }}: {{ check.ratio.toFixed(1) }} · {{ check.level === 'fail' ? t('themes.studio.contrastFail') : check.level }}
                  </UBadge>
                </div>
              </div>
            </UPageCard>
          </div>
        </div>
      </div>

      <!-- Guard: ungespeicherte Änderungen -->
      <UModal
        :open="pendingLeave !== null"
        :title="t('themes.studio.unsavedTitle')"
        @update:open="(value: boolean) => { if (!value) pendingLeave = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('themes.studio.unsavedText') }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="pendingLeave = null">{{ t('themes.studio.keepEditing') }}</UButton>
            <UButton color="error" @click="confirmLeave">{{ t('themes.studio.discard') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
