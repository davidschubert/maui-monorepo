<script setup lang="ts">
// Feature-Katalog (F7-Vorstufe, M2): einkompilierte Features aus der
// Laufzeit-Registry als Karten, optionale per Toggle schaltbar — wirkt ohne
// Deploy (app_config.features, Realtime-Push an alle Clients). Daten bleiben
// beim Abschalten IMMER erhalten.
import type { AdminFeatureEntry } from '../../../../server/api/admin/features/index.get'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t, locale } = useI18n()
const toast = useToast()

const { data, refresh } = await useFetch<{ features: AdminFeatureEntry[] }>('/api/admin/features')

const lang = computed(() => (locale.value === 'de' ? 'de' : 'en'))

const pending = ref<string | null>(null)
async function toggle(entry: AdminFeatureEntry, enabled: boolean) {
  pending.value = entry.manifest.key
  try {
    await $fetch(`/api/admin/features/${entry.manifest.key}`, { method: 'PATCH', body: { enabled } })
    toast.add({
      title: t(enabled ? 'admin.features.enabled' : 'admin.features.disabled', { name: entry.manifest.title[lang.value] }),
      color: 'success',
    })
  }
  catch (error) {
    const statusText = (error as { statusMessage?: string })?.statusMessage ?? ''
    toast.add({ title: t('admin.features.toggleFailed'), description: statusText, color: 'error' })
  }
  finally {
    pending.value = null
    await refresh()
  }
}
</script>

<template>
  <div class="mx-auto w-full lg:max-w-3xl">
    <UPageCard :title="t('admin.features.title')" :description="t('admin.features.description')" variant="subtle">
      <div class="divide-y divide-default">
        <div
          v-for="entry in data?.features"
          :key="entry.manifest.key"
          class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
          :data-feature-card="entry.manifest.key"
        >
          <div class="flex min-w-0 items-start gap-3">
            <UIcon :name="entry.manifest.icon ?? 'i-ph-puzzle-piece'" class="mt-0.5 size-5 shrink-0" :class="entry.state.enabled ? 'text-primary' : 'text-muted'" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium">{{ entry.manifest.title[lang] }}</p>
                <UBadge v-if="entry.manifest.tier === 'foundation'" color="neutral" variant="subtle" size="sm">
                  {{ t('admin.features.foundation') }}
                </UBadge>
                <UBadge v-if="!entry.state.enabled" color="warning" variant="subtle" size="sm">
                  {{ t('admin.features.inactive') }}
                </UBadge>
              </div>
              <p class="text-sm text-muted">{{ entry.manifest.description[lang] }}</p>
              <p v-if="entry.manifest.requires?.length" class="mt-0.5 text-xs text-muted">
                {{ t('admin.features.requires', { list: entry.manifest.requires.join(', ') }) }}
              </p>
              <p class="mt-0.5 text-xs text-muted">{{ t('admin.features.dataKept') }}</p>
            </div>
          </div>
          <!-- Grundgerüst: bewusst KEIN Schalter (nicht abschaltbar — u. a.
               Lockout-Schutz: diese Seite lebt selbst im Admin-Dashboard) -->
          <UBadge v-if="!entry.toggleable" color="neutral" variant="soft" icon="i-ph-lock-simple" class="shrink-0">
            {{ t('admin.features.alwaysOn') }}
          </UBadge>
          <USwitch
            v-else
            :model-value="entry.state.enabled"
            :disabled="pending === entry.manifest.key"
            :data-feature-toggle="entry.manifest.key"
            @update:model-value="(value: boolean) => toggle(entry, value)"
          />
        </div>
      </div>
    </UPageCard>
  </div>
</template>
