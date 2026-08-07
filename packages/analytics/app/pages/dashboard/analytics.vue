<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { analyticsEventKey } from '../../../../core/shared/analyticsEvents'
import { plausibleScriptUrl } from '../../../../core/shared/analyticsScript'
import { createAnalyticsSettingsSchema } from '../../../schemas/analytics'
import type { AnalyticsConfigResponse, AnalyticsStatsResponse } from '../../../shared/types/analytics'

/**
 * DIE EINE FLÄCHE für die Besucherstatistik einer Community.
 *
 * `community.analytics` trägt der Owner (und über ALL_CAPABILITIES der
 * Operator-Admin im Silo) — dieselbe Klasse wie das Einbetter-Register:
 * hier wird fremder Code in jede Seite geladen. Die Autorität bleibt die
 * Route (`server/api/analytics/settings.patch.ts`); die Middleware prüft
 * beide Quellen (globales Label ODER Community-Rolle, N1).
 *
 * ZWEI GESICHTER, EINE SEITE (v2, 2026-08-04) — welches gilt, entscheidet
 * allein, ob dieses Deployment eine SAMMEL-SITE hat:
 *  - MIT (Pool): das Hauptelement ist ein Schalter. Der Owner soll nirgends
 *    eine Id herbekommen müssen — die Registrierung auf unserer
 *    Plausible-Instanz ist zu, und die CE hat keine Sites-API, mit der wir ihm
 *    eine Site anlegen könnten. Das Id-Feld wandert unter „Erweitert".
 *  - OHNE (Silo, lokale Entwicklung): es bleibt beim Formular der v1 — ein
 *    Schalter ohne Sammel-Site wäre ein Knopf ohne Wirkung.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.analytics' })

const { t, locale } = useI18n()
const toast = useToast()
const appConfig = useAppConfig() as {
  pukalani?: { analytics?: { instance?: string, shared?: { scriptId?: string, siteId?: string } } }
}

useHead({ title: () => t('analytics.admin.title') })

/**
 * Die Basis-Adresse kommt AUS DER CONFIG, nie aus der Eingabe (Begründung in
 * core/shared/analyticsScript.ts). Fehlt sie, ist die Selbstbedienung in
 * dieser App gar nicht eingerichtet — dann ist ein Eingabefeld eine Lüge.
 */
const instance = computed(() => appConfig.pukalani?.analytics?.instance ?? '')

/** Hat dieses Deployment eine Sammel-Site? Das entscheidet die ganze Ansicht. */
const sharedConfigured = computed(() => Boolean(appConfig.pukalani?.analytics?.shared?.scriptId))

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
watch(data, (value) => { state.plausibleScriptId = value?.ownScriptId ?? '' }, { immediate: true })

/** Der Schalter ist UNGEBUNDEN: die Wahrheit kommt nach dem PATCH zurück (K9). */
const enabled = computed(() => data.value?.enabled === true)
/** Wird auf dieser Community überhaupt gemessen? (Eigene Site ODER Schalter.) */
const measuring = computed(() => Boolean(data.value?.scriptId))
/** Eigene Site gesetzt — dann hat der Schalter oben keine Wirkung mehr. */
const ownOverrides = computed(() => Boolean(data.value?.ownScriptId))

const previewUrl = computed(() => plausibleScriptUrl(instance.value, state.plausibleScriptId.trim()))

const saving = ref(false)

/** Der EINE Speicherweg — beide Bedienelemente schicken nur ihr eigenes Feld. */
async function patch(body: { plausibleScriptId?: string, enabled?: boolean }): Promise<AnalyticsConfigResponse | null> {
  saving.value = true
  try {
    const result = await $fetch<AnalyticsConfigResponse>('/api/analytics/settings', { method: 'PATCH', body })
    await refresh()
    /**
     * Die Zahlen NACH jeder Änderung neu holen, nicht nur wenn sich „wird
     * gemessen?" umdreht: ein Wechsel von der Sammel-Site auf eine eigene Site
     * lässt `measuring` unverändert, die Zahlen kommen danach aber aus einer
     * anderen Quelle. Der Server hat seinen 120-s-Cache beim Speichern selbst
     * verworfen, hier steht also nichts Altes mehr im Weg.
     */
    if (planOk.value && measuring.value) await refreshStats()
    return result
  }
  catch {
    // Kunden-Dashboard: der rohe Statustext der Route sagt dem Owner nichts
    // (und fällt unter HTTP/2 ohnehin weg) — siehe Audit-Befund C12.
    toast.add({
      title: t('analytics.admin.saveFailed'),
      description: t('analytics.admin.saveFailedHint'),
      color: 'error',
    })
    return null
  }
  finally {
    saving.value = false
  }
}

async function toggleMeasuring(next: boolean) {
  const result = await patch({ enabled: next })
  if (!result) return
  toast.add({
    title: t(next ? 'analytics.admin.saved' : 'analytics.admin.savedOff'),
    description: t(next ? 'analytics.admin.savedHint' : 'analytics.admin.savedOffHint'),
    color: 'success',
  })
}

async function save(event: FormSubmitEvent<{ plausibleScriptId?: string }>) {
  const result = await patch({ plausibleScriptId: (event.data.plausibleScriptId ?? '').trim() })
  if (!result) return
  state.plausibleScriptId = result.ownScriptId
  // Ein leeres Feld ist eine ANDERE Nachricht als ein gesetztes — „Gespeichert"
  // allein ließe offen, ob gerade an- oder abgeschaltet wurde. Im Pool kann
  // danach immer noch die Sammel-Site messen, deshalb hängt die Nachricht am
  // EFFEKTIVEN Ergebnis, nicht am eingegebenen Feld.
  toast.add({
    title: t(result.scriptId ? 'analytics.admin.saved' : 'analytics.admin.savedOff'),
    description: t(result.scriptId ? 'analytics.admin.savedHint' : 'analytics.admin.savedOffHint'),
    color: 'success',
  })
}

// ── Die Zahlen ──────────────────────────────────────────────────────────────

/**
 * `immediate: false`: erst fragen, wenn feststeht, dass überhaupt gemessen wird
 * und der Tarif es hergibt. Sonst liefe bei jedem Aufruf dieser Seite eine
 * Anfrage in ein 404 (Tarif) oder in ein `{ active: false }` — fünf
 * Plausible-Abfragen für eine Antwort, die wir schon kennen.
 */
const { data: stats, status: statsStatus, error: statsError, refresh: refreshStats } = await useFetch<AnalyticsStatsResponse>('/api/analytics/stats', {
  lazy: true,
  server: false,
  immediate: false,
})

watch([planOk, measuring], ([ok, on]) => {
  if (ok && on) refreshStats()
}, { immediate: true })

const statsVisible = computed(() => planOk.value && measuring.value)
/** Ein Fehler an dieser Stelle ist dasselbe wie „gerade nicht erreichbar". */
const statsUnavailable = computed(() => Boolean(statsError.value) || stats.value?.unavailable === true)
const statsLoading = computed(() => statsStatus.value === 'pending')

const totals = computed(() => stats.value?.totals)
const series = computed(() => stats.value?.series ?? [])
const topPages = computed(() => stats.value?.topPages ?? [])
const topSources = computed(() => stats.value?.topSources ?? [])
/** `undefined` = nur diese Teil-Abfrage fiel aus → Abschnitt gar nicht zeigen. */
const topEvents = computed(() => stats.value?.topEvents)

/**
 * Der GESPEICHERTE Name ist Datenbestand (englisch, stabil) — angezeigt wird
 * die Übersetzung über den Vokabular-Schlüssel. Ein Name außerhalb des
 * Vokabulars (sollte die Abfrage je einen liefern) erscheint roh statt gar
 * nicht: eine Zahl ohne Zeile wäre die schlechtere Auskunft.
 */
function eventLabel(name: string): string {
  const key = analyticsEventKey(name)
  return key ? t(`analytics.admin.event.${key}`) : name
}

/** Höchster Tageswert — der Maßstab der Balken (mindestens 1, sonst 0/0). */
const seriesMax = computed(() => Math.max(1, ...series.value.map(point => point.visitors)))

/**
 * „Noch keine Daten" heißt: die Abfrage lief, es steht nur nichts drin. Genau
 * so sieht eine frisch aktivierte Community aus — und für die ist der Satz
 * gedacht, nicht für einen Fehler.
 */
const statsEmpty = computed(() =>
  stats.value?.active === true
  && !statsUnavailable.value
  && (totals.value?.pageviews ?? 0) === 0
  && (stats.value?.today?.visitors ?? 0) === 0,
)

function formatCount(value: number | undefined): string {
  return (value ?? 0).toLocaleString(locale.value)
}

/** Verweildauer als m:ss — „94 Sekunden" liest niemand als anderthalb Minuten. */
function formatDuration(seconds: number | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Datum kurz (5. Aug.) — die Balkenreihe hat für ISO-Daten keinen Platz. */
function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', timeZone: 'UTC' })
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

          <!-- POOL: ein Schalter, mehr nicht. -->
          <UPageCard
            v-if="sharedConfigured"
            :title="t('analytics.admin.measureTitle')"
            :description="t('analytics.admin.measureHint')"
            variant="subtle"
          >
            <div class="flex items-center justify-between gap-4 border-t border-default pt-4">
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('analytics.admin.measureLabel') }}</p>
                <p class="text-sm text-muted">
                  {{ measuring ? t('analytics.admin.measureOn') : t('analytics.admin.measureOff') }}
                </p>
              </div>
              <USwitch
                :model-value="enabled"
                :disabled="!planOk || saving"
                :aria-label="t('analytics.admin.measureLabel')"
                data-analytics-toggle
                @update:model-value="(value: boolean) => toggleMeasuring(value)"
              />
            </div>

            <UAlert
              v-if="ownOverrides"
              color="neutral"
              variant="subtle"
              icon="i-ph-arrow-bend-up-right"
              :title="t('analytics.admin.overrideTitle')"
              :description="t('analytics.admin.overrideHint')"
            />
          </UPageCard>

          <!-- SILO: das Formular der v1 bleibt das Hauptelement. -->
          <UPageCard
            v-else
            :title="t('analytics.admin.section')"
            :description="t('analytics.admin.intro')"
            variant="subtle"
          >
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

          <!-- DIE ZAHLEN. Sie sind der Grund, warum das Produkt überhaupt einen
               Wert hat: gemessen wurde auch vorher, nur sah der Owner nichts
               davon (Plausible ist unsere Konsole, nicht seine). -->
          <UPageCard
            v-if="statsVisible"
            :title="t('analytics.admin.statsTitle')"
            :description="t('analytics.admin.statsHint')"
            variant="subtle"
          >
            <div v-if="statsLoading && !stats" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-ph-circle-notch" class="size-4 animate-spin" />
              {{ t('analytics.admin.statsLoading') }}
            </div>

            <UAlert
              v-else-if="statsUnavailable"
              color="neutral"
              variant="subtle"
              icon="i-ph-plugs"
              :title="t('analytics.admin.statsUnavailableTitle')"
              :description="t('analytics.admin.statsUnavailableHint')"
              data-analytics-stats-unavailable
            />

            <CoreEmptyState
              v-else-if="statsEmpty"
              icon="i-ph-chart-line-up"
              :title="t('analytics.admin.statsEmptyTitle')"
              :description="t('analytics.admin.statsEmptyHint')"
            />

            <template v-else-if="stats?.active">
              <!-- Vier Kacheln. Bewusst ohne Chart-Bibliothek: eine Zahl ist
                   eine Zahl, und ein zusätzliches Paket im Client-Bundle jeder
                   Kunden-Community wäre der teuerste Weg zu vier Zahlen. -->
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-analytics-tiles>
                <UCard>
                  <p class="text-2xl font-bold tabular-nums">{{ formatCount(stats.today?.visitors) }}</p>
                  <p class="truncate text-sm text-muted">{{ t('analytics.admin.statsToday') }}</p>
                </UCard>
                <UCard>
                  <p class="text-2xl font-bold tabular-nums">{{ formatCount(totals?.visitors) }}</p>
                  <p class="truncate text-sm text-muted">{{ t('analytics.admin.statsVisitors') }}</p>
                </UCard>
                <UCard>
                  <p class="text-2xl font-bold tabular-nums">{{ formatCount(totals?.pageviews) }}</p>
                  <p class="truncate text-sm text-muted">{{ t('analytics.admin.statsPageviews') }}</p>
                </UCard>
                <UCard>
                  <p class="text-2xl font-bold tabular-nums">{{ formatDuration(totals?.visitDurationSeconds) }}</p>
                  <p class="truncate text-sm text-muted">{{ t('analytics.admin.statsDuration') }}</p>
                  <p class="truncate text-xs text-muted">
                    {{ t('analytics.admin.statsBounceRate', { percent: Math.round(totals?.bounceRate ?? 0) }) }}
                  </p>
                </UCard>
              </div>

              <!-- Die 30-Tage-Reihe: reine Flex-Höhen. Jeder Balken trägt sein
                   eigenes Label, damit die Reihe auch vorgelesen etwas aussagt
                   — eine Grafik ohne Text ist für einen Teil der Nutzer nichts. -->
              <div v-if="series.length" class="flex flex-col gap-2 border-t border-default pt-4">
                <p class="text-sm font-medium">{{ t('analytics.admin.statsChartTitle') }}</p>
                <div class="flex h-32 items-end gap-px" data-analytics-chart>
                  <div
                    v-for="point in series"
                    :key="point.date"
                    role="img"
                    :aria-label="t('analytics.admin.statsBar', { date: formatDay(point.date), count: point.visitors })"
                    class="min-w-0 flex-1 rounded-t-sm bg-primary/70"
                    :style="{ height: `${Math.max(2, Math.round((point.visitors / seriesMax) * 100))}%` }"
                  />
                </div>
                <div class="flex justify-between text-xs text-muted">
                  <span>{{ formatDay(series[0]!.date) }}</span>
                  <span>{{ formatDay(series[series.length - 1]!.date) }}</span>
                </div>
              </div>

              <div class="grid gap-6 border-t border-default pt-4 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <p class="text-sm font-medium">{{ t('analytics.admin.statsTopPages') }}</p>
                  <p v-if="!topPages.length" class="text-sm text-muted">{{ t('analytics.admin.statsListEmpty') }}</p>
                  <ul v-else class="flex flex-col gap-1" data-analytics-top-pages>
                    <li v-for="page in topPages" :key="page.name" class="flex items-baseline justify-between gap-3 text-sm">
                      <span class="truncate font-mono text-muted">{{ page.name }}</span>
                      <span class="tabular-nums">{{ formatCount(page.visitors) }}</span>
                    </li>
                  </ul>
                </div>

                <div class="flex flex-col gap-2">
                  <p class="text-sm font-medium">{{ t('analytics.admin.statsTopSources') }}</p>
                  <p v-if="!topSources.length" class="text-sm text-muted">{{ t('analytics.admin.statsListEmpty') }}</p>
                  <ul v-else class="flex flex-col gap-1" data-analytics-top-sources>
                    <li v-for="source in topSources" :key="source.name" class="flex items-baseline justify-between gap-3 text-sm">
                      <span class="truncate text-muted">{{ source.name }}</span>
                      <span class="tabular-nums">{{ formatCount(source.visitors) }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Die AKTIONEN (F47): was in der Community passiert ist —
                   Beitritte, Kommentare, Beiträge, Zu-/Absagen, Einschreibungen.
                   `undefined` (Teil-Abfrage ausgefallen) versteckt den Abschnitt,
                   leer sagt ehrlich „noch nichts" — zwei verschiedene Aussagen. -->
              <div v-if="topEvents" class="flex flex-col gap-2 border-t border-default pt-4">
                <p class="text-sm font-medium">{{ t('analytics.admin.statsEvents') }}</p>
                <p v-if="!topEvents.length" class="text-sm text-muted">{{ t('analytics.admin.statsEventsEmpty') }}</p>
                <ul v-else class="flex flex-col gap-1" data-analytics-top-events>
                  <li v-for="entry in topEvents" :key="entry.name" class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="truncate text-muted">{{ eventLabel(entry.name) }}</span>
                    <span class="tabular-nums">{{ formatCount(entry.count) }}</span>
                  </li>
                </ul>
              </div>
            </template>
          </UPageCard>

          <!-- „Erweitert" gibt es NUR im Pool: im Silo ist das Feld oben schon
               das Hauptelement, ein zweites wäre dasselbe zweimal. -->
          <UCollapsible v-if="sharedConfigured" class="rounded-lg border border-default/60 p-3">
            <UButton color="neutral" variant="ghost" block :ui="{ base: 'block w-full px-0 py-0 text-left' }">
              <span class="flex w-full items-center justify-between gap-2">
                <span class="flex min-w-0 items-center gap-2">
                  <UIcon name="i-ph-sliders" class="size-4 shrink-0 text-primary" />
                  <span class="truncate text-sm font-medium">{{ t('analytics.admin.advancedTitle') }}</span>
                </span>
                <UIcon name="i-ph-caret-down" class="size-4 shrink-0 text-muted" />
              </span>
            </UButton>

            <template #content>
              <div class="flex flex-col gap-4 pt-4">
                <p class="text-sm text-muted">{{ t('analytics.admin.advancedHint') }}</p>

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

                <UForm :schema="schema" :state="state" class="flex flex-col gap-4" @submit="save">
                  <UFormField
                    name="plausibleScriptId"
                    :label="t('analytics.admin.scriptId')"
                    :help="t('analytics.admin.scriptIdHelpShared')"
                  >
                    <UInput
                      v-model="state.plausibleScriptId"
                      class="w-full font-mono"
                      :disabled="!planOk"
                      :placeholder="t('analytics.admin.scriptIdPlaceholder')"
                      data-analytics-script-id
                    />
                  </UFormField>

                  <div class="flex flex-col gap-1">
                    <p class="text-sm font-medium">{{ t('analytics.admin.preview') }}</p>
                    <p v-if="previewUrl" class="break-all font-mono text-sm text-muted" data-analytics-preview>{{ previewUrl }}</p>
                    <p v-else class="text-sm text-muted" data-analytics-preview>{{ t('analytics.admin.previewEmptyShared') }}</p>
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
              </div>
            </template>
          </UCollapsible>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
