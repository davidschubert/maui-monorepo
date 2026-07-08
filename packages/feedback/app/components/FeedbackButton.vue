<script setup lang="ts">
import { createFeedbackSchema } from '../../schemas/feedback'
import type { FeedbackCategory } from '../../shared/types/feedback'
import { MAX_FEEDBACK_MESSAGE } from '../../shared/types/feedback'

/**
 * Schwebender Feedback-Button (unten links) mit kleinem Popup: Kategorie,
 * Nachricht, senden — bewusst minimal, auch für Gäste. Die APP platziert
 * die Komponente in ihrem Layout (A14-Komposition).
 */
const { t } = useI18n()
const route = useRoute()
const { isLoggedIn } = useCurrentUser()

const open = ref(false)
const busy = ref(false)
const sent = ref(false)
const errorText = ref('')

const category = ref<FeedbackCategory>('idea')
const message = ref('')

const CATEGORIES: Array<{ value: FeedbackCategory, icon: string }> = [
  { value: 'idea', icon: 'i-ph-lightbulb' },
  { value: 'bug', icon: 'i-ph-bug' },
  { value: 'other', icon: 'i-ph-chat-circle-dots' },
]

function reset() {
  category.value = 'idea'
  message.value = ''
  errorText.value = ''
  sent.value = false
}

async function submit() {
  errorText.value = ''
  const parsed = createFeedbackSchema(t).safeParse({
    category: category.value,
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
    errorText.value = statusCode === 429 ? t('feedback.form.tooMany') : t('feedback.form.failed')
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
              <p class="text-sm text-muted">{{ t('feedback.form.thanksText') }}</p>
              <UButton color="neutral" variant="ghost" size="sm" class="mt-1" @click="open = false">
                {{ t('feedback.form.close') }}
              </UButton>
            </div>
          </template>

          <form v-else class="space-y-3" @submit.prevent="submit">
            <p class="font-medium">{{ t('feedback.form.title') }}</p>

            <div class="flex gap-1" data-testid="feedback-categories">
              <UButton
                v-for="option in CATEGORIES"
                :key="option.value"
                size="sm"
                :icon="option.icon"
                :color="category === option.value ? 'primary' : 'neutral'"
                :variant="category === option.value ? 'soft' : 'ghost'"
                :data-feedback-category="option.value"
                @click="category = option.value"
              >
                {{ t(`feedback.categories.${option.value}`) }}
              </UButton>
            </div>

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
              <UButton color="neutral" variant="ghost" size="sm" @click="open = false">
                {{ t('feedback.form.cancel') }}
              </UButton>
              <UButton type="submit" size="sm" :loading="busy" :disabled="message.trim().length < 3" data-testid="feedback-send">
                {{ t('feedback.form.send') }}
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UPopover>
  </div>
</template>
