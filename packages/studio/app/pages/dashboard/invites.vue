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
}

const { data, refresh } = await useFetch<{ total: number, codes: InviteDto[] }>('/api/studio/invites', { lazy: true, server: false })
const codes = computed(() => data.value?.codes ?? [])

const showCreate = ref(false)
const saving = ref(false)
const form = reactive({ label: '', maxUses: 1, expiresInDays: 30 })

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

/** Warum ein Code nicht (mehr) gilt — dieselbe Reihenfolge wie serverseitig. */
function stateOf(code: InviteDto): { key: string, color: 'success' | 'neutral' | 'warning' } {
  if ((code.status || 'active') !== 'active') return { key: 'revoked', color: 'neutral' }
  if (code.expiresAt && Date.parse(code.expiresAt) <= Date.now()) return { key: 'expired', color: 'warning' }
  if (code.maxUses > 0 && code.uses >= code.maxUses) return { key: 'used', color: 'neutral' }
  return { key: 'active', color: 'success' }
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
          <UButton icon="i-ph-plus" data-invites-create :label="t('studio.invites.new')" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('studio.invites.subtitle') }}</p>

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
        {{ t('studio.invites.empty') }}
      </p>
      <div v-else class="divide-y divide-default" data-invites-list>
        <div v-for="code in codes" :key="code.id" class="flex flex-wrap items-center justify-between gap-3 py-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ code.label || t('studio.invites.noLabel') }}</p>
              <UBadge :color="stateOf(code).color" variant="subtle" size="sm">
                {{ t(`studio.invites.state.${stateOf(code).key}`) }}
              </UBadge>
            </div>
            <p class="mt-0.5 text-sm text-muted">
              {{ code.maxUses === 0
                ? t('studio.invites.usesUnlimited', { uses: code.uses })
                : t('studio.invites.uses', { uses: code.uses, max: code.maxUses }) }}
              <template v-if="code.expiresAt"> · {{ t('studio.invites.until', { date: formatDate(code.expiresAt) }) }}</template>
              <template v-else> · {{ t('studio.invites.noExpiry') }}</template>
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
    </template>
  </UDashboardPanel>
</template>
