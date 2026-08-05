<script setup lang="ts">
import { messageErrorReason, MESSAGE_RATE_CODE } from '../../shared/messageErrors'

/**
 * „NACHRICHT SCHREIBEN" NEBEN DEM NAMEN (Konzept § 1, „Einstieg und Ort").
 *
 * Davids Regel, unverändert: geteilt wird der MECHANISMUS, nie der Einstieg.
 * Die Kernhandlung „dieser Person schreiben" beginnt dort, wo die Person
 * steht — an ihrem Namen —, nicht in einem Menüpunkt, den man erst suchen
 * muss. Der Posteingang ist der Lese-Ort, nicht der Einstieg.
 *
 * ── WARUM DIESE KOMPONENTE HIER LIEGT UND NICHT IM BAUPLAN ──────────────
 * Sie GEHÖRT diesem Produkt (sie kennt seine Route, seinen Fehler-Code und
 * seine Texte). Was in den `blueprint` gehört, ist ihre VERDRAHTUNG an
 * fremden Flächen — an Autorennamen in Beiträgen und Kommentaren. A14 trennt
 * genau so: der Layer besitzt das Bauteil, die Komposition besitzt die
 * Anordnung.
 *
 * ── SIE ZEIGT SICH NUR, WENN SIE ETWAS BEWIRKEN KANN ────────────────────
 * Kein eigenes Konto, das eigene Profil, ein Konto ohne Handle: kein Knopf.
 * Ein Knopf, der immer da ist und meistens in einen Fehler führt, ist
 * schlimmer als keiner — und ausgerechnet die Fehlermeldung darf hier nichts
 * verraten (§ 2.3), er könnte den Fehlschlag also nicht einmal erklären.
 */
const props = defineProps<{
  /** Der Kurzname des Gegenübers in DIESER Community (ohne @). */
  handle?: string | null
  /** Die User-Id — nur zum Vergleich mit dem eigenen Konto, nie als Adresse. */
  userId?: string | null
  size?: 'xs' | 'sm' | 'md'
  variant?: 'ghost' | 'soft' | 'link'
  /** Nur das Symbol (für gedrängte Zeilen wie eine Kommentar-Kopfzeile). */
  iconOnly?: boolean
}>()

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const router = useRouter()
const { user, isLoggedIn } = useCurrentUser()

const open = ref(false)
const body = ref('')
const pending = ref(false)

const visible = computed(() =>
  isLoggedIn.value && !!props.handle && props.userId !== user.value?.$id)

async function submit() {
  if (!props.handle || !body.value.trim() || pending.value) return
  pending.value = true
  try {
    const result = await $fetch<{ conversationId: string }>('/api/messages', {
      method: 'POST',
      body: { handle: props.handle, body: body.value },
    })
    toast.add({ title: t('messages.thread.sent'), color: 'success', icon: 'i-ph-paper-plane-tilt' })
    open.value = false
    body.value = ''
    // In den EINEN Lese-Ort, mit vorgewählter Konversation — es gibt bewusst
    // keinen zweiten (Konzept § 1, „Zwei Einstiege, ein Ziel").
    await router.push(localePath(`/dashboard/messages?c=${result.conversationId}`))
  }
  catch (error) {
    const reason = messageErrorReason(error)
    toast.add({
      title: reason === MESSAGE_RATE_CODE ? t('messages.thread.rateLimited') : t('messages.thread.unavailable'),
      color: 'error',
      icon: 'i-ph-warning',
    })
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UButton
    v-if="visible"
    icon="i-ph-envelope-simple"
    :label="props.iconOnly ? undefined : t('messages.write.action')"
    :aria-label="t('messages.write.action')"
    :size="props.size ?? 'xs'"
    :variant="props.variant ?? 'ghost'"
    color="neutral"
    @click="open = true"
  />

  <UModal v-model:open="open" :title="t('messages.write.action')">
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          @{{ props.handle }}
        </p>
        <MessageBodyField
          v-model="body"
          :placeholder="t('messages.thread.placeholder')"
          immediate
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('messages.compose.cancel')" @click="open = false" />
        <UButton
          :label="t('messages.compose.submit')"
          icon="i-ph-paper-plane-tilt"
          :loading="pending"
          :disabled="!body.trim()"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
