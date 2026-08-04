<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { plausibleScriptUrl } from '../../../../core/shared/analyticsScript'
import { createAnalyticsSettingsSchema } from '../../../schemas/analytics'
import type { AnalyticsConfigResponse } from '../../../shared/types/analytics'

/**
 * DIE EINE FLÄCHE für die Besucherstatistik einer Community.
 *
 * `community.analytics` trägt der Owner (und über ALL_CAPABILITIES der
 * Operator-Admin im Silo) — dieselbe Klasse wie das Einbetter-Register:
 * hier wird fremder Code in jede Seite geladen. Die Autorität bleibt die
 * Route (`server/api/analytics/settings.patch.ts`); die Middleware prüft
 * beide Quellen (globales Label ODER Community-Rolle, N1).
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.analytics' })

const { t } = useI18n()
const toast = useToast()
const appConfig = useAppConfig() as { pukalani?: { analytics?: { instance?: string } } }

useHead({ title: () => t('analytics.admin.title') })

/**
 * Die Basis-Adresse kommt AUS DER CONFIG, nie aus der Eingabe (Begründung in
 * core/shared/analyticsScript.ts). Fehlt sie, ist die Selbstbedienung in
 * dieser App gar nicht eingerichtet — dann ist ein Eingabefeld eine Lüge.
 */
const instance = computed(() => appConfig.pukalani?.analytics?.instance ?? '')

/**
 * TARIF (P4): nur Sichtbarkeit. Die Route antwortet ohne den Plan ohnehin 404
 * (`requirePlanProduct`) — der Hinweis hier erspart dem Owner, das als Fehler
 * zu erleben. Ohne Pool-Tenant (Silo, Kontroll-Host) gibt `planAllows` true.
 */
const { planAllows } = useTenantPlan()
const planOk = computed(() => planAllows('analytics'))

const schema = computed(() => createAnalyticsSettingsSchema(t))
const state = reactive({ plausibleScriptId: '' })

/**
 * Startwert aus derselben öffentlichen Route, die auch der Head liest — eine
 * zweite Leseroute nur fürs Dashboard wäre eine zweite Wahrheit.
 * `server: false`, weil die Seite hinter der Anmeldung liegt und nichts davon
 * ins SSR-HTML muss.
 */
const { data, refresh } = await useFetch<AnalyticsConfigResponse>('/api/analytics/config', {
  lazy: true,
  server: false,
})
watch(data, (value) => { state.plausibleScriptId = value?.scriptId ?? '' }, { immediate: true })

const previewUrl = computed(() => plausibleScriptUrl(instance.value, state.plausibleScriptId.trim()))

const saving = ref(false)

async function save(event: FormSubmitEvent<{ plausibleScriptId: string }>) {
  saving.value = true
  try {
    const result = await $fetch<AnalyticsConfigResponse>('/api/analytics/settings', {
      method: 'PATCH',
      body: { plausibleScriptId: event.data.plausibleScriptId.trim() },
    })
    state.plausibleScriptId = result.scriptId
    // Ein leeres Feld ist eine ANDERE Nachricht als ein gesetztes — „Gespeichert"
    // allein ließe offen, ob gerade an- oder abgeschaltet wurde.
    toast.add({
      title: t(result.scriptId ? 'analytics.admin.saved' : 'analytics.admin.savedOff'),
      description: t(result.scriptId ? 'analytics.admin.savedHint' : 'analytics.admin.savedOffHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    // Kunden-Dashboard: der rohe Statustext der Route sagt dem Owner nichts
    // (und fällt unter HTTP/2 ohnehin weg) — siehe Audit-Befund C12.
    toast.add({
      title: t('analytics.admin.saveFailed'),
      description: t('analytics.admin.saveFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="analytics">
    <template #header>
      <UDashboardNavbar :title="t('analytics.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <p class="text-sm text-muted">{{ t('analytics.admin.subtitle') }}</p>

        <UAlert
          v-if="!instance"
          color="neutral"
          variant="subtle"
          icon="i-ph-info"
          :title="t('analytics.admin.unavailableTitle')"
          :description="t('analytics.admin.unavailableHint')"
        />

        <template v-else>
          <UAlert
            v-if="!planOk"
            color="warning"
            variant="subtle"
            icon="i-ph-seal-check"
            :title="t('analytics.admin.planTitle')"
            :description="t('analytics.admin.planHint')"
            data-analytics-plan-hint
          />

          <UPageCard :title="t('analytics.admin.section')" :description="t('analytics.admin.intro')" variant="subtle">
            <p class="text-sm text-muted">{{ t('analytics.admin.howTo') }}</p>

            <UButton
              :to="instance"
              target="_blank"
              rel="noopener noreferrer"
              color="neutral"
              variant="subtle"
              size="xs"
              icon="i-ph-arrow-square-out"
              class="self-start"
              :label="t('analytics.admin.openInstance')"
            />

            <UForm
              :schema="schema"
              :state="state"
              class="flex flex-col gap-4 border-t border-default pt-4"
              @submit="save"
            >
              <UFormField
                name="plausibleScriptId"
                :label="t('analytics.admin.scriptId')"
                :help="t('analytics.admin.scriptIdHelp')"
              >
                <UInput
                  v-model="state.plausibleScriptId"
                  class="w-full font-mono"
                  :disabled="!planOk"
                  :placeholder="t('analytics.admin.scriptIdPlaceholder')"
                  data-analytics-script-id
                />
              </UFormField>

              <!-- Die Vorschau baut dieselbe Funktion wie der Head-Eintrag
                   (core/shared/analyticsScript.ts) — sie kann also gar nicht
                   etwas anderes zeigen, als später geladen wird. -->
              <div class="flex flex-col gap-1">
                <p class="text-sm font-medium">{{ t('analytics.admin.preview') }}</p>
                <p v-if="previewUrl" class="break-all font-mono text-sm text-muted" data-analytics-preview>{{ previewUrl }}</p>
                <p v-else class="text-sm text-muted" data-analytics-preview>{{ t('analytics.admin.previewEmpty') }}</p>
              </div>

              <div class="flex justify-end">
                <UButton
                  type="submit"
                  :loading="saving"
                  :disabled="!planOk"
                  data-analytics-save
                  :label="t('analytics.admin.save')"
                />
              </div>
            </UForm>
          </UPageCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
