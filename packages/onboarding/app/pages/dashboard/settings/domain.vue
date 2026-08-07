<script setup lang="ts">
/**
 * EINSTELLUNGEN → EIGENE DOMAIN (control-035, Davids Entscheidungen vom
 * 2026-08-07).
 *
 * Die Selbstbedienungs-Fläche zu Entscheidung 3: der Owner trägt seine Domain
 * ein, bekommt die DNS-Einträge zum Abschreiben und drückt „Prüfen", bis es
 * steht. Es gibt bewusst KEINEN Hintergrund-Job, der ihn irgendwann
 * benachrichtigt — die Wartezeiten hängen an fremden Uhren (DNS-Verbreitung,
 * Let's Encrypt), und ein Knopf, der jederzeit ehrlich sagt, wo es hängt, ist
 * verständlicher als ein Fortschrittsbalken, der etwas verspricht.
 *
 * WARUM IM ONBOARDING-LAYER: dieselbe Begründung wie bei Mitgliedern (S9),
 * Branding (F5), Abo (A6) und den Community-Einstellungen (F24) — die Seite
 * kann nur so weit reichen wie ihre Routen, und `/api/community/domain/*`
 * liegen hier, weil dieser Layer die Service-Naht zum Control Plane besitzt.
 * Eine Silo-App ohne onboarding bekommt so keinen Reiter ins Leere.
 *
 * DREI ZUSTÄNDE, DREI ANSICHTEN — und jeder erklärt sich selbst:
 *  1. Kein Mandanten-Host (Kontroll-Host, Silo): ein Hinweis statt toter
 *     Felder. Der Reiter ist dort zwar `scope: 'community'` und verschwindet,
 *     die URL bleibt aber erreichbar (apps/platform bedient beide Sorten Host).
 *  2. Plan reicht nicht (Davids Entscheidung 1: ab Pro): der Kasten steht da,
 *     erklärt das Merkmal und zeigt auf die Abo-Seite. Ein leeres Feld ohne
 *     Begründung wäre die schlechteste Antwort — der Owner soll wissen, dass
 *     es das gibt.
 *  3. Pro: Eingabe, DNS-Anleitung, Prüfen, Statuskette.
 *
 * DIE ANLEITUNG KOMMT VOM SERVER, nicht aus dieser Datei: Server-IP und
 * CNAME-Ziel stehen in der Runtime-Config des Control Plane
 * (`customDomainServerIps` / `customDomainCnameTarget`) und sind dort
 * env-überschreibbar. Sie hier zu wiederholen hieße, bei einem Server-Umzug
 * eine Kunden-Anleitung zu vergessen.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.domain' })

interface CustomDomainState {
  domain: string
  status: 'none' | 'pending_dns' | 'pending_cert' | 'pending_platform' | 'active' | 'error'
  error: string
  forms: string[]
  verifiedAt: string | null
  activatedAt: string | null
  canonicalHost: string
  fallbackHost: string
  plan: string
  planAllows: boolean
  instructions: {
    txtName: string
    txtValue: string
    cnameTarget: string
    serverIps: string[]
    apexForm: string | null
    wwwForm: string | null
  }
}

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()

useHead({ title: () => t('onboarding.domain.title') })

/** null = kein Pool-Mandant (Silo, Kontroll-Host) → hier gibt es keine Adresse. */
const { plan, planAllows } = useTenantPlan()
const isTenantHost = computed(() => plan.value !== null)
/**
 * Sichtbarkeits-Gate über die BESTEHENDE Plan-Mechanik. Die Autorität ist der
 * Server (das Control Plane liest den Plan aus der `communities`-Zeile und
 * antwortet 403 `plan_required`); das hier entscheidet nur, ob die Seite die
 * Eingabe anbietet oder den Hinweis.
 */
const allowed = computed(() => planAllows('customDomain'))

const state = ref<CustomDomainState | null>(null)
const loading = ref(true)
const busy = ref('')

async function load() {
  if (!isTenantHost.value) {
    loading.value = false
    return
  }
  try {
    state.value = await $fetch<CustomDomainState>('/api/community/domain')
  }
  catch {
    state.value = null
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const input = ref('')
watch(state, (next) => { input.value = next?.domain ?? '' })

/** Fehlerschlüssel → Text. Ohne bekannten Schlüssel der allgemeine Satz —
 *  besser ein unscharfer Satz als ein roher Code auf der Seite. */
function rejectionText(error: unknown): string {
  const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
  const known = [
    'domain_empty', 'domain_too_long', 'domain_invalid', 'domain_not_a_domain',
    'domain_operator_domain', 'domain_taken', 'plan_required', 'domain_missing',
    'domain_not_ready',
  ]
  return known.includes(reason)
    ? t(`onboarding.domain.errors.${reason}`)
    : t('onboarding.domain.errors.generic')
}

async function save() {
  const value = input.value.trim()
  if (!value || busy.value) return
  busy.value = 'save'
  try {
    // Der gültige Zustand kommt aus der ANTWORT, nicht aus dem Klick — das
    // Control Plane ist die Wahrheit (Muster registration.patch.ts).
    state.value = await $fetch<CustomDomainState>('/api/community/domain', { method: 'PUT', body: { domain: value } })
    toast.add({ title: t('onboarding.domain.savedTitle'), description: t('onboarding.domain.savedDesc'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('onboarding.domain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

async function verify() {
  if (busy.value) return
  busy.value = 'verify'
  try {
    const next = await $fetch<CustomDomainState>('/api/community/domain/verify', { method: 'POST' })
    state.value = next
    if (next.status === 'active') {
      toast.add({ title: t('onboarding.domain.activeTitle'), description: t('onboarding.domain.activeDesc', { domain: next.domain }), color: 'success' })
    }
    else {
      // Der Zwischenstand ist KEIN Fehler, und er wird auch nicht als einer
      // gemeldet: „noch nicht" ist der Normalfall, solange DNS unterwegs ist.
      toast.add({ title: t(`onboarding.domain.status.${next.status}`), description: next.error || t('onboarding.domain.checkAgain'), color: 'info' })
    }
  }
  catch (error) {
    toast.add({ title: t('onboarding.domain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

const confirm = useConfirm()

async function remove() {
  if (busy.value || !state.value?.domain) return
  const ok = await confirm({
    title: t('onboarding.domain.removeConfirmTitle'),
    description: t('onboarding.domain.removeConfirmText', { domain: state.value.domain, host: state.value.fallbackHost }),
    confirmLabel: t('onboarding.domain.remove'),
    color: 'error',
  })
  if (!ok) return
  busy.value = 'remove'
  try {
    state.value = await $fetch<CustomDomainState>('/api/community/domain', { method: 'DELETE' })
    input.value = ''
    toast.add({ title: t('onboarding.domain.removedTitle'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('onboarding.domain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

/** Die Kette der Schritte — jeder Schritt weiß, ob er schon durch ist. */
const steps = computed(() => {
  const status = state.value?.status ?? 'none'
  const rank = ['none', 'pending_dns', 'pending_cert', 'pending_platform', 'active'].indexOf(status)
  const done = (needed: number) => rank > needed
  return [
    { key: 'dns', label: t('onboarding.domain.steps.dns'), done: done(1) },
    { key: 'cert', label: t('onboarding.domain.steps.cert'), done: done(2) },
    { key: 'platform', label: t('onboarding.domain.steps.platform'), done: done(3) },
  ]
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="!isTenantHost"
      icon="i-ph-info"
      color="neutral"
      variant="subtle"
      :title="t('onboarding.domain.noTenantTitle')"
      :description="t('onboarding.domain.noTenantDesc')"
    />

    <template v-else-if="!allowed">
      <UPageCard
        :title="t('onboarding.domain.title')"
        :description="t('onboarding.domain.description')"
      >
        <UAlert
          icon="i-ph-lock-simple"
          color="primary"
          variant="subtle"
          :title="t('onboarding.domain.planTitle')"
          :description="t('onboarding.domain.planDesc')"
          :actions="[{ label: t('onboarding.domain.planCta'), to: localePath('/dashboard/settings/subscription'), color: 'primary' }]"
        />
      </UPageCard>
    </template>

    <template v-else>
      <UPageCard
        :title="t('onboarding.domain.title')"
        :description="t('onboarding.domain.description')"
      >
        <div class="space-y-4">
          <UFormField
            :label="t('onboarding.domain.field')"
            :help="t('onboarding.domain.fieldHelp')"
          >
            <UInput
              v-model="input"
              :placeholder="t('onboarding.domain.placeholder')"
              :disabled="loading || busy !== ''"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              :label="state?.domain ? t('onboarding.domain.replace') : t('onboarding.domain.save')"
              :loading="busy === 'save'"
              :disabled="loading || busy !== '' || !input.trim() || input.trim() === state?.domain"
              @click="save"
            />
            <UButton
              v-if="state?.domain"
              variant="soft"
              :label="t('onboarding.domain.check')"
              :loading="busy === 'verify'"
              :disabled="busy !== ''"
              @click="verify"
            />
            <UButton
              v-if="state?.domain"
              variant="ghost"
              color="error"
              :label="t('onboarding.domain.remove')"
              :loading="busy === 'remove'"
              :disabled="busy !== ''"
              @click="remove"
            />
          </div>

          <p class="text-sm text-dimmed">
            {{ t('onboarding.domain.fallbackNote', { host: state?.fallbackHost ?? '' }) }}
          </p>
        </div>
      </UPageCard>

      <UPageCard
        v-if="state?.domain"
        :title="t('onboarding.domain.statusTitle')"
        :description="t(`onboarding.domain.status.${state.status}`)"
      >
        <div class="space-y-4">
          <ul class="space-y-2">
            <li
              v-for="step in steps"
              :key="step.key"
              class="flex items-center gap-2 text-sm"
            >
              <UIcon
                :name="step.done ? 'i-ph-check-circle-fill' : 'i-ph-circle-dashed'"
                :class="step.done ? 'text-success' : 'text-dimmed'"
              />
              <span :class="step.done ? '' : 'text-dimmed'">{{ step.label }}</span>
            </li>
          </ul>

          <UAlert
            v-if="state.error"
            icon="i-ph-warning"
            color="warning"
            variant="subtle"
            :title="t('onboarding.domain.pendingTitle')"
            :description="state.error"
          />

          <UAlert
            v-if="state.status === 'active'"
            icon="i-ph-check-circle"
            color="success"
            variant="subtle"
            :title="t('onboarding.domain.activeTitle')"
            :description="t('onboarding.domain.activeDesc', { domain: state.domain })"
          />
        </div>
      </UPageCard>

      <UPageCard
        v-if="state?.domain"
        :title="t('onboarding.domain.dnsTitle')"
        :description="t('onboarding.domain.dnsDescription')"
      >
        <div class="space-y-4 text-sm">
          <div>
            <p class="font-medium">
              {{ t('onboarding.domain.dns.txt') }}
            </p>
            <p class="text-dimmed">
              {{ t('onboarding.domain.dns.txtHelp') }}
            </p>
            <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">TXT  {{ state.instructions.txtName }}  {{ state.instructions.txtValue }}</pre>
          </div>

          <div v-if="state.instructions.apexForm">
            <p class="font-medium">
              {{ t('onboarding.domain.dns.a') }}
            </p>
            <p class="text-dimmed">
              {{ t('onboarding.domain.dns.aHelp') }}
            </p>
            <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">A  {{ state.instructions.apexForm }}  {{ state.instructions.serverIps.join(', ') }}</pre>
          </div>

          <div v-if="state.instructions.wwwForm">
            <p class="font-medium">
              {{ t('onboarding.domain.dns.cname') }}
            </p>
            <p class="text-dimmed">
              {{ t('onboarding.domain.dns.cnameHelp') }}
            </p>
            <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">CNAME  {{ state.instructions.wwwForm }}  {{ state.instructions.cnameTarget }}</pre>
          </div>

          <p class="text-dimmed">
            {{ t('onboarding.domain.dns.note') }}
          </p>
        </div>
      </UPageCard>
    </template>
  </div>
</template>
