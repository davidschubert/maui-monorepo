<script setup lang="ts">
import type { BillingCompareValue } from '../../shared/types/billing'

/**
 * „Alle Funktionen im Vergleich" — rendert maui.billing.compare (Sektionen →
 * Zeilen → Wert je Plan). Werte: true = Haken, false/fehlt = nicht enthalten,
 * String = i18n-Key für einen Text-Zustand (z. B. „Eingeschränkt").
 * Die Inhalte sind bewusst App-Sache (Config + i18n) — der Layer stellt nur
 * die Darstellung.
 */
const { t } = useI18n()
const { config } = useBilling()

const sections = computed(() => config.value.compare?.sections ?? [])

function cellValue(plans: Record<string, BillingCompareValue>, planId: string): BillingCompareValue {
  return plans[planId] ?? false
}
</script>

<template>
  <div v-if="sections.length" class="overflow-x-auto" data-testid="compare-table">
    <table class="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th class="w-1/2 pb-4" />
          <th
            v-for="plan in config.plans"
            :key="plan.id"
            class="pb-4 text-center text-base font-semibold"
            :class="plan.highlight ? 'text-primary' : ''"
          >
            {{ t(plan.labelKey) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="section in sections" :key="section.labelKey">
          <tr>
            <th
              :colspan="1 + config.plans.length"
              class="pb-3 pt-8 text-left text-base font-semibold first:pt-0"
            >
              {{ t(section.labelKey) }}
            </th>
          </tr>
          <tr v-for="row in section.rows" :key="row.labelKey">
            <td class="border-t border-default py-3 pr-4 text-default">{{ t(row.labelKey) }}</td>
            <td
              v-for="plan in config.plans"
              :key="plan.id"
              class="border-t border-default px-2 py-3 text-center"
            >
              <UIcon
                v-if="cellValue(row.plans, plan.id) === true"
                name="i-ph-check"
                class="size-4 text-success"
                :aria-label="t('billing.compare.includedA11y')"
              />
              <span v-else-if="cellValue(row.plans, plan.id) === false" class="text-dimmed" aria-hidden="true">—</span>
              <span v-else class="text-xs text-muted">{{ t(cellValue(row.plans, plan.id) as string) }}</span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
