<script setup lang="ts">
import { createFeedbackSubmitSchema } from '../../../control/schemas/customerFeedback'
import { FEEDBACK_AREAS, MAX_FEEDBACK_MESSAGE, type FeedbackArea } from '../../../control/shared/customerFeedback'
import type { FeedbackProductOption } from '../../shared/types/feedbackProducts'

/**
 * Der schwebende Feedback-Knopf (unten links) mit kleinem Popup — bewusst
 * minimal, auch für Gäste. Er sitzt laut Plan auf JEDER Community- und
 * Website-Seite; platziert wird er von der Chrome-Registry (Zone 'overlay').
 *
 * ZWEI FELDER STATT EINER LISTE (Davids Entscheidung 5): erst „Bereich", und
 * NUR bei „Ein Produkt" die zweite Frage, welches. Die Produkt-Liste kommt aus
 * dem bestehenden Katalog dieser App (/api/feedback/products) — es gibt keine
 * zweite Liste, die getrennt veraltet.
 *
 * OHNE LOGIN HEISST WIRKLICH ANONYM (Entscheidung 4). Das steht als Hinweis im
 * Formular, BEVOR jemand tippt: keine Adresse, keine Nachverfolgung, keine
 * Rückfrage. Wer eingeloggt ist, kann sein Feedback im Dashboard verfolgen —
 * darauf zeigt der Erfolgs-Zustand.
 */
const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { isLoggedIn } = useCurrentUser()

const open = ref(false)
const busy = ref(false)
const sent = ref(false)
const errorText = ref('')

const area = ref<FeedbackArea>('core')
const productKey = ref('')
const message = ref('')

const AREA_ICON: Record<FeedbackArea, string> = {
  core: 'i-ph-cube',
  product: 'i-ph-puzzle-piece',
  billing: 'i-ph-credit-card',
  other: 'i-ph-chat-circle-dots',
}

// Der Katalog wird erst geholt, wenn er gebraucht wird — der Knopf hängt auf
// JEDER Seite, und ein Abruf pro Seitenaufruf für ein Popup, das die meisten
// nie öffnen, wäre reine Last.
const { data: catalog, execute: loadCatalog, status: catalogStatus } = await useFetch<{ products: FeedbackProductOption[] }>(
  '/api/feedback/products',
  { immediate: false, lazy: true, server: false },
)

const productItems = computed(() => (catalog.value?.products ?? []).map(product => ({
  value: product.key,
  // Produkt-Titel sind Eigennamen des Katalogs und laufen NICHT über i18n —
  // das Manifest trägt sie zweisprachig, hier wird nur ausgewählt.
  label: locale.value === 'de' ? product.title.de : product.title.en,
  icon: product.icon || undefined,
})))

watch(area, (value) => {
  if (value !== 'product') {
    productKey.value = ''
    return
  }
  if (!catalog.value && catalogStatus.value !== 'pending') void loadCatalog()
})

function reset() {
  area.value = 'core'
  productKey.value = ''
  message.value = ''
  errorText.value = ''
  sent.value = false
}

const canSend = computed(() =>
  message.value.trim().length >= 3 && (area.value !== 'product' || productKey.value !== ''))

async function submit() {
  errorText.value = ''
  const parsed = createFeedbackSubmitSchema(t).safeParse({
    area: area.value,
    productKey: productKey.value || undefined,
    message: message.value,
    page: route.path,
  })
  if (!parsed.success) {
    errorText.value = parsed.error.issues[0]?.message ?? t('feedback.form.failed')
    return
  }

  busy.value = true
  try {
    await $fetch('/api/feedback', { method: 'POST', body: parsed.data })
    sent.value = true
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    // Fachlicher Grund aus dem Envelope (core/server/error.ts hebt ihn als
    // `reason`) — „stummgeschaltet" ist eine andere Aussage als „ging schief".
    const reason = (error as { data?: { reason?: string } }).data?.reason
    errorText.value = reason === 'community_muted'
      ? t('feedback.form.muted')
      : statusCode === 429
        ? t('feedback.form.tooMany')
        : t('feedback.form.failed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed bottom-4 left-4 z-40 print:hidden">
    <UPopover v-model:open="open" :content="{ side: 'top', align: 'start' }" @update:open="(value: boolean) => { if (value) reset() }">
      <UButton
        color="neutral"
        variant="solid"
        size="sm"
        icon="i-ph-megaphone-simple"
        class="shadow-lg"
        data-testid="feedback-button"
      >
        {{ t('feedback.cta') }}
      </UButton>

      <template #content>
        <div class="w-80 p-4" data-testid="feedback-popup">
          <template v-if="sent">
            <div class="flex flex-col items-center gap-2 py-4 text-center">
              <UIcon name="i-ph-confetti" class="size-8 text-primary" />
              <p class="font-medium">{{ t('feedback.form.thanksTitle') }}</p>
              <p class="text-sm text-muted">
                {{ isLoggedIn ? t('feedback.form.thanksTracked') : t('feedback.form.thanksAnonymous') }}
              </p>
              <UButton
                v-if="isLoggedIn"
                :to="localePath('/dashboard/feedback')"
                color="neutral"
                variant="subtle"
                size="sm"
                icon="i-ph-arrow-right"
                class="mt-1"
                @click="() => { open = false }"
              >
                {{ t('feedback.form.thanksLink') }}
              </UButton>
              <UButton v-else color="neutral" variant="ghost" size="sm" class="mt-1" @click="() => { open = false }">
                {{ t('feedback.form.close') }}
              </UButton>
            </div>
          </template>

          <form v-else class="space-y-3" @submit.prevent="submit">
            <p class="font-medium">{{ t('feedback.form.title') }}</p>

            <div class="flex flex-wrap gap-1" data-testid="feedback-areas">
              <UButton
                v-for="option in FEEDBACK_AREAS"
                :key="option"
                size="sm"
                :icon="AREA_ICON[option]"
                :color="area === option ? 'primary' : 'neutral'"
                :variant="area === option ? 'soft' : 'ghost'"
                :data-feedback-area="option"
                @click="() => { area = option }"
              >
                {{ t(`feedback.areas.${option}`) }}
              </UButton>
            </div>

            <USelectMenu
              v-if="area === 'product'"
              v-model="productKey"
              :items="productItems"
              value-key="value"
              :loading="catalogStatus === 'pending'"
              :placeholder="t('feedback.form.productPlaceholder')"
              class="w-full"
              data-testid="feedback-product"
            />

            <UTextarea
              v-model="message"
              :rows="4"
              :maxlength="MAX_FEEDBACK_MESSAGE"
              :placeholder="t('feedback.form.placeholder')"
              class="w-full"
              autofocus
              data-testid="feedback-message"
            />

            <p v-if="errorText" class="text-xs text-error">{{ errorText }}</p>
            <p v-if="!isLoggedIn" class="text-xs text-dimmed">{{ t('feedback.form.guestHint') }}</p>

            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" size="sm" @click="() => { open = false }">
                {{ t('feedback.form.cancel') }}
              </UButton>
              <UButton type="submit" size="sm" :loading="busy" :disabled="!canSend" data-testid="feedback-send">
                {{ t('feedback.form.send') }}
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UPopover>
  </div>
</template>
