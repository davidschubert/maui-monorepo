<script setup lang="ts">
/**
 * Einladungs-Codes ausstellen (Early-Access-Tor des Self-Service-Onboardings).
 *
 * Der Klartext existiert GENAU EINMAL — in der Antwort auf das Anlegen. Danach
 * steht in der Datenbank nur noch sha256. Deshalb ist die Anzeige nach dem
 * Ausstellen kein Beiwerk, sondern der wichtigste Moment dieser Seite: sie
 * bleibt offen, bis der Betreiber sie schließt, und sagt deutlich, dass der
 * Code nicht wiederherstellbar ist.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t, locale } = useI18n()
const toast = useToast()
useHead({ title: () => t('studio.invites.title') })

interface InviteDto {
  id: string
  label: string
  maxUses: number
  uses: number
  expiresAt: string | null
  status: 'active' | 'revoked'
  createdAt: string
  state: 'free' | 'assigned' | 'redeemed' | 'expired' | 'revoked'
  boundEmail: string
  redeemedAt: string | null
}

interface StockSummary { total: number, free: number, assigned: number, redeemed: number, expired: number, revoked: number }

const { data, refresh } = await useFetch<{
  total: number
  stock: StockSummary
  truncated: boolean
  communities: number
  codes: InviteDto[]
}>('/api/studio/invites', { lazy: true, server: false })
const stock = computed(() => data.value?.stock)

/** Die Liste enthält (serverseitig gefiltert) nur Codes mit Vorgang — freie
 *  Vorrats-Plätze wären 50-mal dieselbe leere Zeile und stehen als Zahl oben. */
const codes = computed(() => data.value?.codes ?? [])

/**
 * Vorrats-Ampel: der Betreiber soll nicht erst zählen müssen, ob noch etwas
 * da ist. Unter 10 freien Plätzen wird der Nachfüll-Hinweis sichtbar — dann
 * ist noch Zeit, bevor eine Anfrage wartet.
 */
const LOW_STOCK = 10
const stockLow = computed(() => (stock.value?.free ?? 0) < LOW_STOCK)

const showCreate = ref(false)
const saving = ref(false)
const form = reactive({ label: '', maxUses: 1, expiresInDays: 30 })

const showBulk = ref(false)
const bulking = ref(false)
const bulkForm = reactive({ count: 50, expiresInDays: 90 })

async function createStock() {
  bulking.value = true
  try {
    const result = await $fetch<{ created: number }>('/api/studio/invites/bulk', {
      method: 'POST',
      body: {
        count: Math.min(100, Math.max(1, Number(bulkForm.count) || 0)),
        ...(Number(bulkForm.expiresInDays) > 0 ? { expiresInDays: Number(bulkForm.expiresInDays) } : {}),
      },
    })
    showBulk.value = false
    toast.add({ title: t('studio.invites.stock.created', { count: result.created }), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: t('studio.invites.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    bulking.value = false
  }
}

/** Der frisch ausgestellte Code — nur im Speicher dieser Seite. */
const issued = ref<{ code: string, label: string } | null>(null)
const copied = ref(false)

function openCreate() {
  form.label = ''
  form.maxUses = 1
  form.expiresInDays = 30
  showCreate.value = true
}

async function createCode() {
  saving.value = true
  try {
    const result = await $fetch<{ code: string, label: string }>('/api/studio/invites', {
      method: 'POST',
      body: {
        ...(form.label.trim() ? { label: form.label.trim() } : {}),
        maxUses: Math.max(0, Number(form.maxUses) || 0),
        // 0/leer = ohne Ablauf (Feld weglassen)
        ...(Number(form.expiresInDays) > 0 ? { expiresInDays: Number(form.expiresInDays) } : {}),
      },
    })
    showCreate.value = false
    copied.value = false
    issued.value = { code: result.code, label: result.label }
    await refresh()
  }
  catch (error) {
    toast.add({ title: t('studio.invites.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function copyCode() {
  if (!issued.value) return
  try {
    await navigator.clipboard.writeText(issued.value.code)
    copied.value = true
  }
  catch {
    // Zwischenablage verweigert (Berechtigung/Kontext) — der Code steht
    // sichtbar da, abtippen geht immer.
    toast.add({ title: t('studio.invites.copyFailed'), color: 'warning' })
  }
}

async function setStatus(code: InviteDto, status: 'active' | 'revoked') {
  try {
    await $fetch(`/api/studio/invites/${code.id}`, { method: 'PATCH', body: { status } })
    toast.add({ title: t(status === 'revoked' ? 'studio.invites.revoked' : 'studio.invites.reactivated'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('studio.invites.updateFailed'), color: 'error' })
  }
}

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string | null): string {
  if (!value) return ''
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

/** Den Zustand rechnet der Server (eine Quelle, unit-getestet) — hier wird er
 *  nur eingefärbt. */
const STATE_COLORS: Record<InviteDto['state'], 'success' | 'primary' | 'neutral' | 'warning'> = {
  redeemed: 'success',
  assigned: 'primary',
  free: 'neutral',
  expired: 'warning',
  revoked: 'neutral',
}
</script>

<template>
  <UDashboardPanel id="invites">
    <template #header>
      <UDashboardNavbar :title="t('studio.invites.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-stack-plus"
            data-invites-bulk
            color="neutral"
            variant="subtle"
            :label="t('studio.invites.stock.fill')"
            @click="showBulk = true"
          />
          <UButton icon="i-ph-plus" data-invites-create :label="t('studio.invites.new')" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('studio.invites.subtitle') }}</p>

      <!-- Vorrat + Trichter: frei → zugewiesen → eingelöst → Community -->
      <div v-if="stock" class="mb-6 space-y-3" data-invites-stock>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="key in (['free', 'assigned', 'redeemed', 'expired'] as const)"
            :key="key"
            class="rounded-xl border border-default p-3"
            :data-stock="key"
          >
            <p class="text-2xl font-semibold tabular-nums">{{ stock[key] }}</p>
            <p class="text-sm text-muted">{{ t(`studio.invites.stock.${key}`) }}</p>
          </div>
        </div>
        <p v-if="data?.truncated" class="text-sm text-warning" data-invites-truncated>
          {{ t('studio.invites.stock.truncated') }}
        </p>
        <p class="text-sm text-muted" data-invites-funnel>
          {{ t('studio.invites.stock.funnel', {
            assigned: stock.assigned + stock.redeemed,
            redeemed: stock.redeemed,
            communities: data?.communities ?? 0,
          }) }}
        </p>
        <UAlert
          v-if="stockLow"
          icon="i-ph-warning"
          color="warning"
          variant="subtle"
          data-invites-lowstock
          :title="t('studio.invites.stock.lowTitle', { count: stock.free })"
          :description="t('studio.invites.stock.lowHint')"
        />
      </div>

      <!-- Der eine Moment, in dem der Klartext existiert -->
      <div v-if="issued" class="mb-6 space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4" data-invite-issued>
        <div class="flex items-start gap-2">
          <UIcon name="i-ph-key" class="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="min-w-0 space-y-1">
            <p class="font-medium">{{ t('studio.invites.issuedTitle') }}</p>
            <p class="text-sm text-muted">{{ t('studio.invites.issuedHint') }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <code class="select-all rounded-lg bg-elevated px-3 py-2 font-mono text-lg tracking-wider" data-invite-code>{{ issued.code }}</code>
          <UButton
            :icon="copied ? 'i-ph-check' : 'i-ph-copy'"
            :label="t(copied ? 'studio.invites.copied' : 'studio.invites.copy')"
            color="neutral"
            variant="subtle"
            @click="copyCode"
          />
          <UButton :label="t('studio.invites.done')" color="neutral" variant="ghost" @click="issued = null" />
        </div>
      </div>

      <p v-if="!codes.length" class="py-12 text-center text-sm text-muted" data-invites-empty>
        {{ stock?.free ? t('studio.invites.stock.onlyFree', { count: stock.free }) : t('studio.invites.empty') }}
      </p>
      <div v-else class="divide-y divide-default" data-invites-list>
        <div v-for="code in codes" :key="code.id" class="flex flex-wrap items-center justify-between gap-3 py-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ code.label || t('studio.invites.noLabel') }}</p>
              <UBadge :color="STATE_COLORS[code.state]" variant="subtle" size="sm">
                {{ t(`studio.invites.state.${code.state}`) }}
              </UBadge>
            </div>
            <p class="mt-0.5 text-sm text-muted">
              {{ code.maxUses === 0
                ? t('studio.invites.usesUnlimited', { uses: code.uses })
                : t('studio.invites.uses', { uses: code.uses, max: code.maxUses }) }}
              <template v-if="code.expiresAt"> · {{ t('studio.invites.until', { date: formatDate(code.expiresAt) }) }}</template>
              <template v-else> · {{ t('studio.invites.noExpiry') }}</template>
            </p>
            <!-- An wen ging er, und kam er an? -->
            <p v-if="code.boundEmail" class="mt-0.5 truncate text-sm text-muted">
              {{ code.boundEmail }}
              <template v-if="code.redeemedAt"> · {{ t('studio.invites.redeemedOn', { date: formatDate(code.redeemedAt) }) }}</template>
            </p>
          </div>
          <UButton
            :label="t(code.status === 'revoked' ? 'studio.invites.reactivate' : 'studio.invites.revoke')"
            :color="code.status === 'revoked' ? 'neutral' : 'error'"
            variant="ghost"
            size="sm"
            @click="setStatus(code, code.status === 'revoked' ? 'active' : 'revoked')"
          />
        </div>
      </div>

      <UModal v-model:open="showCreate" :title="t('studio.invites.new')">
        <template #body>
          <form class="space-y-4" @submit.prevent="createCode">
            <UFormField :label="t('studio.invites.labelField')" :description="t('studio.invites.labelHint')">
              <UInput v-model="form.label" :placeholder="t('studio.invites.labelPlaceholder')" class="w-full" autofocus />
            </UFormField>
            <UFormField :label="t('studio.invites.maxUsesField')" :description="t('studio.invites.maxUsesHint')">
              <UInput v-model.number="form.maxUses" type="number" min="0" max="100000" class="w-full" />
            </UFormField>
            <UFormField :label="t('studio.invites.expiresField')" :description="t('studio.invites.expiresHint')">
              <UInput v-model.number="form.expiresInDays" type="number" min="0" max="365" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton :label="t('ui.cancel')" color="neutral" variant="ghost" @click="showCreate = false" />
              <UButton type="submit" :loading="saving" :label="t('studio.invites.create')" />
            </div>
          </form>
        </template>
      </UModal>

      <UModal v-model:open="showBulk" :title="t('studio.invites.stock.fill')">
        <template #body>
          <form class="space-y-4" @submit.prevent="createStock">
            <p class="text-sm text-muted">{{ t('studio.invites.stock.fillHint') }}</p>
            <UFormField :label="t('studio.invites.stock.countField')">
              <UInput v-model.number="bulkForm.count" type="number" min="1" max="100" class="w-full" autofocus />
            </UFormField>
            <UFormField :label="t('studio.invites.expiresField')" :description="t('studio.invites.stock.expiresHint')">
              <UInput v-model.number="bulkForm.expiresInDays" type="number" min="1" max="365" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton :label="t('ui.cancel')" color="neutral" variant="ghost" @click="showBulk = false" />
              <UButton type="submit" :loading="bulking" :label="t('studio.invites.stock.fillAction')" />
            </div>
          </form>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
