<script setup lang="ts">
import type { CommunityProductEntry } from '../../../../server/api/community/products.get'

/**
 * COMMUNITY-EINSTELLUNGEN → PRODUKTE: was der TARIF dieser Community
 * freischaltet (F51 Paket 2, 2026-08-07 — Davids Ebenen-Entscheidung,
 * DECISION-LOG „Community-Settings-Hub": Pool-Owner sehen die Community-Sicht,
 * wo sinnvoll).
 *
 * ── KEIN EINZIGER SCHALTER, UND DAS IST DIE GANZE SEITE ────────────────────
 * Die Betreiber-Seite /dashboard/admin/products sieht ähnlich aus und hat je
 * Zeile einen `USwitch` — sie gehört aber einer anderen Ebene: dort entscheidet
 * der BETREIBER, welche Produkte diese INSTANZ überhaupt anbietet
 * (`app_config.products`, instanzweit, live an alle). Hier sieht der OWNER
 * seiner Community, was sein TARIF davon enthält. Er schaltet nichts — er
 * stuft hoch. Ein Schalter hier wäre ein Versprechen, das die Route nicht
 * halten kann (`requirePlanProduct` antwortet 404 wie eine Datentür), und
 * zugleich eine Betreiber-Befugnis in einer Kunden-Oberfläche.
 *
 * ── DREI QUELLEN, KEINE VIERTE ─────────────────────────────────────────────
 *  1. `/api/community/products` — Katalog-Texte + Mindest-Plan je Produkt.
 *     Die Texte stehen in den `product.manifest.ts` der Layer; die Route ist
 *     nur die Projektion für `team.manage`. (Warum nicht
 *     `/api/platform/products`: die gibt bewusst nur Schlüssel heraus —
 *     Begründung im Kopf der Route.)
 *  2. `useTenantPlan().planAllows(key)` — dieselbe UI-Regel, die schon
 *     entscheidet, ob ein Produkt im Menü steht. Die Autorität bleibt der
 *     Server.
 *  3. `CorePlanBadge` — der VORHANDENE „Ab Personal/Pro"-Baustein, hier mit
 *     `always`, weil sein Default (nur auf Demo-Hosts) für die Preisseite
 *     gedacht ist und nicht für die Auskunft an den eigenen Owner.
 *
 * Nichts davon wird hier nachgerechnet. Ein zweiter Plan-Vergleich in dieser
 * Datei wäre die Stelle, an der die Seite eines Tages etwas anderes behauptet
 * als das Menü daneben.
 *
 * ── DER UPGRADE-VERWEIS ────────────────────────────────────────────────────
 * Dezent und EINMAL, nicht je Zeile: ein Knopf „Tarif ansehen" an der Karte
 * mit den nicht enthaltenen Produkten, Ziel `/dashboard/community/plan`
 * (derselbe Reiter, auf den auch die Domain-Seite verweist). Wer den Reiter
 * „Plan" nicht sehen darf (`community.billing` trägt nur der Owner), bekommt
 * den Knopf trotzdem — er führt an dieselbe Stelle wie das Menü und scheitert
 * dort an derselben Capability. Ein zweiter Rechte-Check hier wäre eine dritte
 * Kopie der Regel für einen Link.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('onboarding.communityProducts.title') })

const lang = computed(() => (locale.value === 'de' ? 'de' : 'en'))

const { plan, planAllows } = useTenantPlan()
/** null = kein Pool-Mandant (Silo, Kontroll-Host) — dort gibt es keinen Tarif. */
const isTenantHost = computed(() => plan.value !== null)

const { data, status } = await useFetch<{ products: CommunityProductEntry[] }>('/api/community/products', {
  // Auf einem Nicht-Mandanten-Host antwortet die Route 404 — kein Fehler,
  // sondern die richtige Antwort. Der Hinweis unten fängt den Fall ab.
  default: () => ({ products: [] }),
})

const included = computed(() => (data.value?.products ?? []).filter(p => planAllows(p.key)))
const locked = computed(() => (data.value?.products ?? []).filter(p => !planAllows(p.key)))
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="!isTenantHost"
      icon="i-ph-info"
      color="neutral"
      variant="subtle"
      :title="t('onboarding.communityProducts.noTenantTitle')"
      :description="t('onboarding.communityProducts.noTenantDesc')"
    />

    <template v-else>
      <UPageCard
        :title="t('onboarding.communityProducts.includedTitle')"
        :description="t('onboarding.communityProducts.includedDesc')"
        variant="subtle"
      >
        <CoreEmptyState
          v-if="status !== 'pending' && !included.length"
          icon="i-ph-puzzle-piece"
          :title="t('onboarding.communityProducts.emptyTitle')"
          :description="t('onboarding.communityProducts.emptyDesc')"
        />
        <!--
          BEWUSST KEINE UTable (B6): das ist keine Datenliste, sondern ein
          Katalog — der Erklärtext IST der Inhalt, nicht ein Feld in einer
          Spalte. Gleiche Bauart wie die Betreiber-Seite /dashboard/admin/
          products, damit beide Ebenen sich gleich anfühlen.
        -->
        <div v-else class="divide-y divide-default">
          <div
            v-for="product in included"
            :key="product.key"
            class="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
            :data-community-product="product.key"
          >
            <UIcon :name="product.icon ?? 'i-ph-puzzle-piece'" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium">{{ product.title[lang] }}</p>
                <UBadge color="success" variant="subtle" size="sm">
                  {{ t('onboarding.communityProducts.included') }}
                </UBadge>
              </div>
              <p class="text-sm text-muted">{{ product.description[lang] }}</p>
            </div>
          </div>
        </div>
      </UPageCard>

      <UPageCard
        v-if="locked.length"
        :title="t('onboarding.communityProducts.lockedTitle')"
        :description="t('onboarding.communityProducts.lockedDesc')"
        variant="subtle"
      >
        <div class="divide-y divide-default">
          <div
            v-for="product in locked"
            :key="product.key"
            class="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
            :data-community-product="product.key"
          >
            <UIcon :name="product.icon ?? 'i-ph-puzzle-piece'" class="mt-0.5 size-5 shrink-0 text-muted" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium text-muted">{{ product.title[lang] }}</p>
                <!-- Der vorhandene „Ab Personal/Pro"-Baustein, s. Kopf. -->
                <CorePlanBadge :product="product.key" always />
              </div>
              <p class="text-sm text-muted">{{ product.description[lang] }}</p>
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            :to="localePath('/dashboard/community/plan')"
            color="primary"
            variant="subtle"
            icon="i-ph-credit-card"
          >
            {{ t('onboarding.communityProducts.upgradeCta') }}
          </UButton>
        </template>
      </UPageCard>
    </template>
  </div>
</template>
