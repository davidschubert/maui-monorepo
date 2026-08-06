<script setup lang="ts">
import {
  HANDLE_CHANGE_INTERVAL_DAYS,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  handleRejection,
  normalizeHandle,
} from '../../../shared/handles'

/**
 * Der eigene @name in DIESER Community — anzeigen und ändern.
 *
 * ── DIE REGELN KOMMEN AUS DERSELBEN DATEI WIE AUF DEM SERVER ───────────────
 * `handleRejection` ist genau die Funktion, die auch `PATCH /api/handles/me`
 * benutzt. Hier sagt sie sofort, was stört; dort setzt sie es durch. Zwei
 * Regelwerke für eine Frage laufen auseinander — deshalb eines.
 *
 * ── WARUM IN DEN NACHRICHTEN KEIN EINZIGES `@` STEHT ───────────────────────
 * nuxt-i18n hält spitze Klammern für HTML und `@` für seinen eigenen
 * Verweis-Operator; beides bringt den Nachrichten-Compiler IM CLIENT zum
 * Absturz, während SSR noch richtig aussieht (2026-08-04 live erwischt). Man
 * KÖNNTE `{'@'}` schreiben — aber die Falle ist genau die, dass man es
 * irgendwann vergisst. Hier steht das `@` deshalb im TEMPLATE, als
 * Eingabefeld-Präfix, und die Übersetzungen bleiben davon frei.
 */
const { t, te, locale } = useI18n()
const toast = useToast()

interface HandleState {
  handle: string | null
  changedAt: string | null
  canChange: boolean
  availableAt: number | null
  /**
   * Gehört dieser Mensch zu der Community DIESES Hosts? (H1, 2026-08-05.)
   *
   * OPTIONAL im Typ, und das ist Betrieb statt Bequemlichkeit: Kontoseite und
   * API werden getrennt ausgeliefert, und eine ältere Antwort ohne das Feld
   * darf nicht dazu führen, dass ein Mitglied plötzlich „du gehörst nicht
   * dazu" liest. Fehlt es, gilt wie bisher „gehört dazu".
   */
  member?: boolean
}

// `server: false` mit Absicht: die Route VERGIBT beim ersten Aufruf einen
// Namen — das ist ein Schreibvorgang und gehört nicht in einen SSR-Durchlauf,
// den ein Crawler auslösen kann.
const { data, refresh } = await useFetch<HandleState>('/api/handles/me', {
  lazy: true,
  server: false,
  default: () => ({ handle: null, changedAt: null, canChange: true, availableAt: null }),
})

/** Nur `false` heisst „nicht dazugehörig" — `undefined` ist keine Aussage. */
const isMember = computed(() => data.value?.member !== false)

const draft = ref('')
const saving = ref(false)
const touched = ref(false)

watch(() => data.value?.handle, (value) => {
  if (value && !touched.value) draft.value = value
}, { immediate: true })

const current = computed(() => data.value?.handle ?? '')
const canChange = computed(() => data.value?.canChange !== false)
const unchanged = computed(() => normalizeHandle(draft.value) === current.value.toLowerCase())

/** Sofortige Rückmeldung — dieselbe Regel wie auf dem Server. */
const rejection = computed(() => (draft.value.trim() ? handleRejection(draft.value) : null))

const availableDate = computed(() => {
  const at = data.value?.availableAt
  if (!at) return ''
  return new Date(at).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
})

/** Ablehnungsgründe von Regel UND Server teilen sich die Textbausteine. */
function reasonText(code: string): string {
  const key = `account.handle.errors.${code}`
  return te(key) ? t(key) : t('account.handle.errors.generic')
}

async function save() {
  if (saving.value || rejection.value || unchanged.value) return
  saving.value = true
  try {
    await $fetch('/api/handles/me', { method: 'PATCH', body: { handle: draft.value } })
    touched.value = false
    await refresh()
    toast.add({ title: t('account.handle.saved'), color: 'success' })
  }
  catch (error) {
    // Fachliche Gründe reisen als `reason` im Envelope (core/server/error.ts).
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: t('account.handle.saveFailed'),
      description: reason ? reasonText(reason) : undefined,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="text-sm font-medium text-highlighted">{{ t('account.handle.title') }}</p>
      <p class="text-sm text-muted">{{ t('account.handle.description') }}</p>
    </div>

    <!-- H1: kein Mitglied, kein Name. Ein Eingabefeld, das jede Eingabe mit
         403 quittiert, wäre eine Attrappe — deshalb steht hier ein Satz
         statt eines abgeblendeten Formulars. -->
    <p v-if="!isMember" class="text-sm text-muted" data-handle-not-member>
      {{ t('account.handle.notAMember') }}
    </p>

    <template v-else>
      <UFormField
        :label="t('account.handle.label')"
        :help="t('account.handle.hint', { min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH })"
        :error="rejection ? reasonText(rejection) : undefined"
      >
        <UInput
          v-model="draft"
          :disabled="!canChange || saving"
          :maxlength="HANDLE_MAX_LENGTH"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          data-handle-input
          @update:model-value="touched = true"
        >
          <!-- Das `@` lebt hier, nicht in den Übersetzungen (siehe Kopf). -->
          <template #leading>
            <span class="text-dimmed">@</span>
          </template>
        </UInput>
      </UFormField>

      <!-- Die Sperrfrist als Satz, mit Datum — „geht nicht" allein beantwortet
           nicht, ab wann es wieder geht. -->
      <p v-if="!canChange" class="text-xs text-warning" data-handle-locked>
        {{ t('account.handle.lockedUntil', { date: availableDate, days: HANDLE_CHANGE_INTERVAL_DAYS }) }}
      </p>

      <div class="flex justify-end">
        <UButton
          size="sm"
          :loading="saving"
          :disabled="!canChange || !!rejection || unchanged"
          data-handle-save
          @click="save"
        >
          {{ t('account.handle.save') }}
        </UButton>
      </div>
    </template>
  </div>
</template>
