<script setup lang="ts">
// Produkt-Katalog (F7-Vorstufe, M2): einkompilierte Produkte aus der
// Laufzeit-Registry als Karten, optionale per Toggle schaltbar — wirkt ohne
// Deploy (app_config.products, Realtime-Push an alle Clients). Daten bleiben
// beim Abschalten IMMER erhalten.
import type { AdminProductEntry } from '../../../../server/api/admin/products/index.get'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t, locale } = useI18n()
const toast = useToast()

const { data, refresh } = await useFetch<{ products: AdminProductEntry[] }>('/api/admin/products')

const lang = computed(() => (locale.value === 'de' ? 'de' : 'en'))

const pending = ref<string | null>(null)
async function toggle(entry: AdminProductEntry, enabled: boolean) {
  pending.value = entry.manifest.key
  try {
    await $fetch(`/api/admin/products/${entry.manifest.key}`, { method: 'PATCH', body: { enabled } })
    toast.add({
      title: t(enabled ? 'admin.products.enabled' : 'admin.products.disabled', { name: entry.manifest.title[lang.value] }),
      color: 'success',
    })
  }
  catch (error) {
    const statusText = (error as { statusMessage?: string })?.statusMessage ?? ''
    toast.add({ title: t('admin.products.toggleFailed'), description: statusText, color: 'error' })
  }
  finally {
    pending.value = null
    await refresh()
  }
}
</script>

<template>
  <div class="mx-auto w-full lg:max-w-3xl">
    <UPageCard :title="t('admin.products.title')" :description="t('admin.products.description')" variant="subtle">
      <div class="divide-y divide-default">
        <div
          v-for="entry in data?.products"
          :key="entry.manifest.key"
          class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
          :data-product-card="entry.manifest.key"
        >
          <div class="flex min-w-0 items-start gap-3">
            <UIcon :name="entry.manifest.icon ?? 'i-ph-puzzle-piece'" class="mt-0.5 size-5 shrink-0" :class="entry.state.enabled ? 'text-primary' : 'text-muted'" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium">{{ entry.manifest.title[lang] }}</p>
                <UBadge v-if="entry.manifest.tier === 'foundation'" color="neutral" variant="subtle" size="sm">
                  {{ t('admin.products.foundation') }}
                </UBadge>
                <UBadge v-if="!entry.state.enabled" color="warning" variant="subtle" size="sm">
                  {{ t('admin.products.inactive') }}
                </UBadge>
              </div>
              <p class="text-sm text-muted">{{ entry.manifest.description[lang] }}</p>
              <p v-if="entry.manifest.requires?.length" class="mt-0.5 text-xs text-muted">
                {{ t('admin.products.requires', { list: entry.manifest.requires.join(', ') }) }}
              </p>
              <p class="mt-0.5 text-xs text-muted">{{ t('admin.products.dataKept') }}</p>
            </div>
          </div>
          <!-- Grundgerüst: bewusst KEIN Schalter (nicht abschaltbar — u. a.
               Lockout-Schutz: diese Seite lebt selbst im Admin-Dashboard) -->
          <UBadge v-if="!entry.toggleable" color="neutral" variant="soft" icon="i-ph-lock-simple" class="shrink-0">
            {{ t('admin.products.alwaysOn') }}
          </UBadge>
          <USwitch
            v-else
            :model-value="entry.state.enabled"
            :disabled="pending === entry.manifest.key"
            :data-product-toggle="entry.manifest.key"
            @update:model-value="(value: boolean) => toggle(entry, value)"
          />
        </div>
      </div>
    </UPageCard>
  </div>
</template>
