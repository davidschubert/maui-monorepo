<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createGuestCommentSchema } from '../../schemas/comment'

/**
 * Gast-Kommentar-Formular (Embed E4): Kommentieren ohne Account — Name, E-Mail
 * und Text. Nur im iframe-Embed sichtbar, wenn maui.comments.embed.guests an
 * ist und niemand eingeloggt ist. Postet an /api/comments/guest (store.
 * addGuestComment); die E-Mail wird nur gesendet, nie im Client gehalten.
 */
const props = defineProps<{
  /** Gesetzt = Antwort-Formular, sonst Top-Level */
  parentId?: string
}>()
const emit = defineEmits<{ created: [] }>()

const { t } = useI18n()
const store = inject(commentStoreKey)!
const toast = useToast()
const loading = ref(false)

// Validierung: dieselbe Factory wie der Server (Name/E-Mail/Content).
const schema = computed(() => createGuestCommentSchema(t).pick({ guestName: true, guestEmail: true, content: true }))
type FormInput = z.infer<typeof schema.value>
const state = reactive<FormInput>({ guestName: '', guestEmail: '', content: '' })

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  loading.value = true
  try {
    await store.addGuestComment(event.data.content, event.data.guestName, event.data.guestEmail, props.parentId)
    state.content = ''
    // Name/E-Mail für Folgekommentare stehen lassen — bequemer, kein PII-Leak
    // (bleibt im lokalen Formularzustand dieses Tabs).
    emit('created')
    toast.add({ title: t('comments.guest.posted'), color: 'success' })
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    const status = (error as { statusCode?: number, status?: number })?.statusCode ?? (error as { status?: number })?.status
    const key = code === 'maintenance'
      ? 'comments.disabled.maintenanceToast'
      : code === 'comments_disabled'
        ? 'comments.disabled.toast'
        : status === 429 ? 'comments.guest.rateLimited' : 'comments.form.error'
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-2" data-guest-form @submit="onSubmit">
    <div class="grid gap-2 sm:grid-cols-2">
      <UFormField name="guestName">
        <UInput v-model="state.guestName" :placeholder="t('comments.guest.namePlaceholder')" class="w-full" autocomplete="name" />
      </UFormField>
      <UFormField name="guestEmail">
        <UInput v-model="state.guestEmail" type="email" :placeholder="t('comments.guest.emailPlaceholder')" class="w-full" autocomplete="email" />
      </UFormField>
    </div>
    <UFormField name="content">
      <UTextarea
        v-model="state.content"
        :rows="parentId ? 2 : 3"
        autoresize
        :placeholder="parentId ? t('comments.form.replyPlaceholder') : t('comments.form.placeholder')"
        class="w-full"
        data-comment-input
      />
    </UFormField>
    <div class="flex items-center justify-between gap-2">
      <UButton type="submit" size="sm" :loading="loading">
        {{ parentId ? t('comments.form.replySubmit') : t('comments.form.submit') }}
      </UButton>
      <span class="text-xs text-dimmed">{{ t('comments.guest.emailHint') }}</span>
    </div>
  </UForm>
</template>
