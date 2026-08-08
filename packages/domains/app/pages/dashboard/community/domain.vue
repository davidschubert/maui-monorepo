<script setup lang="ts">
/**
 * EINSTELLUNGEN → EIGENE DOMAIN, Silo-Fassung (control-036, 2026-08-07).
 *
 * Bewusst DIESELBE Fläche wie im Pool (`onboarding/…/settings/domain.vue`):
 * Feld, DNS-Anleitung zum Abschreiben, „Prüfen", Statuskette. Wer beide Welten
 * kennt, soll nichts Neues lernen müssen — und wer nur eine kennt, soll die
 * andere später wiedererkennen.
 *
 * Es gibt auch hier KEINEN Hintergrund-Job: die Wartezeiten hängen an fremden
 * Uhren (DNS-Verbreitung, Let's Encrypt), und ein Knopf, der jederzeit ehrlich
 * sagt, wo es hängt, ist verständlicher als ein Fortschrittsbalken, der etwas
 * verspricht.
 *
 * ── WAS HIER FEHLT, UND WARUM ────────────────────────────────────────────
 *  · KEIN Plan-Gate. Silos sind das Studio-Angebot; Pläne sind Pool-Sache
 *    (CLAUDE.md). Die Frage stellt sich nicht — sie wird nicht mit „ja"
 *    beantwortet, sie wird nicht gestellt.
 *  · KEIN „kein Mandanten-Host"-Zweig. Diese Seite existiert nur in Apps, die
 *    den `domains`-Layer ziehen, und das sind genau die Silos.
 *
 * ── WAS HIER DAZUKOMMT ───────────────────────────────────────────────────
 * Der Hinweis, wenn bei dieser Website keine ploi-Site hinterlegt ist
 * (`ploiConfigured: false`). Ohne ihn stünde der Ablauf in `pending_cert` mit
 * einem Text über ploi, und niemand wüsste, dass die Lösung eine Zeile im
 * Website-Register ist — nicht DNS, nicht Geduld.
 *
 * DIE ANLEITUNG KOMMT VOM SERVER, nicht aus dieser Datei: Server-IP und
 * CNAME-Ziel stehen in der Runtime-Config des Control Plane und sind dort
 * env-überschreibbar. Sie hier zu wiederholen hieße, bei einem Server-Umzug
 * eine Kunden-Anleitung zu vergessen.
 *
 * Der Zustandstyp steht ABSICHTLICH lokal und wird nicht aus core importiert —
 * dasselbe Vorgehen wie in der Pool-Fassung. Er ist die Form EINER Antwort,
 * die diese Seite liest; ein geteilter Typ würde eine Kopplung behaupten, die
 * es zwischen einer .vue und einem Fundament-Layer nicht geben soll.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.domain' })

interface SiteDomainState {
  domain: string
  status: 'none' | 'pending_dns' | 'pending_cert' | 'pending_platform' | 'active' | 'error'
  error: string
  forms: string[]
  verifiedAt: string | null
  activatedAt: string | null
  canonicalHost: string
  fallbackHost: string
  knownHosts: string[]
  ploiConfigured: boolean
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
const confirm = useConfirm()

useHead({ title: () => t('siteDomain.title') })

const state = ref<SiteDomainState | null>(null)
const loading = ref(true)
/** '' = nichts läuft; sonst der Name der laufenden Aktion (ein Knopf zeigt
 *  seinen Spinner, alle anderen sind gesperrt). */
const busy = ref('')
/** Die Naht ist nicht konfiguriert (503) — das ist etwas anderes als „keine
 *  Domain" und muss auch so dastehen. */
const unreachable = ref(false)

async function load() {
  try {
    state.value = await $fetch<SiteDomainState>('/api/site/domain')
    unreachable.value = false
  }
  catch (error) {
    state.value = null
    unreachable.value = (error as { status?: number, statusCode?: number })?.status === 503
      || (error as { statusCode?: number })?.statusCode === 503
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
    'domain_operator_domain', 'domain_taken', 'domain_missing', 'domain_not_ready',
  ]
  return known.includes(reason)
    ? t(`siteDomain.errors.${reason}`)
    : t('siteDomain.errors.generic')
}

async function save() {
  const value = input.value.trim()
  if (!value || busy.value) return
  busy.value = 'save'
  try {
    // Der gültige Zustand kommt aus der ANTWORT, nicht aus dem Klick — das
    // Control Plane ist die Wahrheit.
    state.value = await $fetch<SiteDomainState>('/api/site/domain', { method: 'PUT', body: { domain: value } })
    toast.add({ title: t('siteDomain.savedTitle'), description: t('siteDomain.savedDesc'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('siteDomain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

async function verify() {
  if (busy.value) return
  busy.value = 'verify'
  try {
    const next = await $fetch<SiteDomainState>('/api/site/domain/verify', { method: 'POST' })
    state.value = next
    if (next.status === 'active') {
      toast.add({ title: t('siteDomain.activeTitle'), description: t('siteDomain.activeDesc', { domain: next.domain }), color: 'success' })
    }
    else {
      // Der Zwischenstand ist KEIN Fehler und wird auch nicht als einer
      // gemeldet: „noch nicht" ist der Normalfall, solange DNS unterwegs ist.
      toast.add({ title: t(`siteDomain.status.${next.status}`), description: next.error || t('siteDomain.checkAgain'), color: 'info' })
    }
  }
  catch (error) {
    toast.add({ title: t('siteDomain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

async function remove() {
  if (busy.value || !state.value?.domain) return
  const ok = await confirm({
    title: t('siteDomain.removeConfirmTitle'),
    description: t('siteDomain.removeConfirmText', { domain: state.value.domain, host: state.value.fallbackHost }),
    confirmLabel: t('siteDomain.remove'),
    color: 'error',
  })
  if (!ok) return
  busy.value = 'remove'
  try {
    state.value = await $fetch<SiteDomainState>('/api/site/domain', { method: 'DELETE' })
    input.value = ''
    toast.add({ title: t('siteDomain.removedTitle'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('siteDomain.saveFailed'), description: rejectionText(error), color: 'error' })
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
    { key: 'dns', label: t('siteDomain.steps.dns'), done: done(1) },
    { key: 'cert', label: t('siteDomain.steps.cert'), done: done(2) },
    { key: 'platform', label: t('siteDomain.steps.platform'), done: done(3) },
  ]
})
</script>

<template>
  <div class="space-y-6" data-site-domain>
    <UAlert
      v-if="unreachable"
      icon="i-ph-plugs"
      color="warning"
      variant="subtle"
      :title="t('siteDomain.unreachableTitle')"
      :description="t('siteDomain.unreachableDesc')"
    />

    <UPageCard
      :title="t('siteDomain.title')"
      :description="t('siteDomain.description')"
    >
      <div class="space-y-4">
        <UFormField
          :label="t('siteDomain.field')"
          :help="t('siteDomain.fieldHelp')"
        >
          <UInput
            v-model="input"
            :placeholder="t('siteDomain.placeholder')"
            :disabled="loading || unreachable || busy !== ''"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            class="w-full"
            data-site-domain-input
          />
        </UFormField>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :label="state?.domain ? t('siteDomain.replace') : t('siteDomain.save')"
            :loading="busy === 'save'"
            :disabled="loading || unreachable || busy !== '' || !input.trim() || input.trim() === state?.domain"
            data-site-domain-save
            @click="save"
          />
          <UButton
            v-if="state?.domain"
            variant="soft"
            :label="t('siteDomain.check')"
            :loading="busy === 'verify'"
            :disabled="busy !== ''"
            data-site-domain-check
            @click="verify"
          />
          <UButton
            v-if="state?.domain"
            variant="ghost"
            color="error"
            :label="t('siteDomain.remove')"
            :loading="busy === 'remove'"
            :disabled="busy !== ''"
            @click="remove"
          />
        </div>

        <p class="text-sm text-dimmed">
          {{ t('siteDomain.fallbackNote', { host: state?.fallbackHost ?? '' }) }}
        </p>
      </div>
    </UPageCard>

    <UPageCard
      v-if="state?.domain"
      :title="t('siteDomain.statusTitle')"
      :description="t(`siteDomain.status.${state.status}`)"
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

        <!-- Die Ursache steht VOR dem Symptom: ohne hinterlegte ploi-Site ist
             der Fehlertext darunter nur die Folge. -->
        <UAlert
          v-if="!state.ploiConfigured"
          icon="i-ph-wrench"
          color="warning"
          variant="subtle"
          :title="t('siteDomain.noPloiTitle')"
          :description="t('siteDomain.noPloiDesc')"
        />

        <UAlert
          v-if="state.error"
          icon="i-ph-warning"
          color="warning"
          variant="subtle"
          :title="t('siteDomain.pendingTitle')"
          :description="state.error"
        />

        <UAlert
          v-if="state.status === 'active'"
          icon="i-ph-check-circle"
          color="success"
          variant="subtle"
          :title="t('siteDomain.activeTitle')"
          :description="t('siteDomain.activeDesc', { domain: state.domain })"
        />
      </div>
    </UPageCard>

    <UPageCard
      v-if="state?.domain"
      :title="t('siteDomain.dnsTitle')"
      :description="t('siteDomain.dnsDescription')"
    >
      <div class="space-y-4 text-sm">
        <div>
          <p class="font-medium">
            {{ t('siteDomain.dns.txt') }}
          </p>
          <p class="text-dimmed">
            {{ t('siteDomain.dns.txtHelp') }}
          </p>
          <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">TXT  {{ state.instructions.txtName }}  {{ state.instructions.txtValue }}</pre>
        </div>

        <div v-if="state.instructions.apexForm">
          <p class="font-medium">
            {{ t('siteDomain.dns.a') }}
          </p>
          <p class="text-dimmed">
            {{ t('siteDomain.dns.aHelp') }}
          </p>
          <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">A  {{ state.instructions.apexForm }}  {{ state.instructions.serverIps.join(', ') }}</pre>
        </div>

        <div v-if="state.instructions.wwwForm">
          <p class="font-medium">
            {{ t('siteDomain.dns.cname') }}
          </p>
          <p class="text-dimmed">
            {{ t('siteDomain.dns.cnameHelp') }}
          </p>
          <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">CNAME  {{ state.instructions.wwwForm }}  {{ state.instructions.cnameTarget }}</pre>
        </div>

        <p class="text-dimmed">
          {{ t('siteDomain.dns.note') }}
        </p>
      </div>
    </UPageCard>
  </div>
</template>
