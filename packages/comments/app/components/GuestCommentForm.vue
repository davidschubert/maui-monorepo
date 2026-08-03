<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createGuestCommentSchema } from '../../schemas/comment'

/**
 * Gast-Kommentar-Formular (Embed E4): Kommentieren ohne Account — Name und Text.
 * Nur im iframe-Embed sichtbar, wenn pukalani.comments.embed.guests an ist und
 * niemand eingeloggt ist. Postet an /api/comments/guest (store.addGuestComment).
 *
 * DAS E-MAIL-FELD IST WEG (F18, Davids Entscheidung 2026-08-02). Es war als
 * Rückfragekanal für die Moderation gedacht, aber die Gegenstelle wurde nie
 * gebaut: die Adresse landete in `guest_authors`, und diese Tabelle hatte im
 * ganzen Repo keine Lese-Stelle. Ein Pflichtfeld, dessen Inhalt niemand je
 * ansieht, ist gegenüber dem Gast eine Zumutung und gegenüber der DSGVO eine
 * Erhebung ohne Zweck. Der Name bleibt — er ist der ANZEIGENAME und steht
 * ohnehin öffentlich am Kommentar.
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

// Validierung: dieselbe Factory wie der Server (Name/Content).
const schema = computed(() => createGuestCommentSchema(t).pick({ guestName: true, content: true }))
type FormInput = z.infer<typeof schema.value>
const state = reactive<FormInput>({ guestName: '', content: '' })

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  loading.value = true
  try {
    await store.addGuestComment(event.data.content, event.data.guestName, props.parentId)
    state.content = ''
    // Den Namen für Folgekommentare stehen lassen — bequemer, kein PII-Leak
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
    // Wie im angemeldeten Formular: der Text bleibt stehen, das gehört gesagt
    toast.add({
      title: t(key),
      description: t(key === 'comments.form.error' ? 'comments.form.errorHint' : 'comments.disabled.draftKeptHint'),
      color: 'error',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-2" data-guest-form @submit="onSubmit">
    <!-- Nur noch EIN Feld (F18) — das Zweispalten-Raster hatte die E-Mail
         daneben und würde jetzt eine halbe Zeile Leere stempeln. -->
    <UFormField name="guestName">
      <UInput v-model="state.guestName" :placeholder="t('comments.guest.namePlaceholder')" class="w-full" autocomplete="name" />
    </UFormField>
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
    <!-- Der Hinweis „Deine E-Mail bleibt privat" ist mit dem Feld gefallen
         (F18). Ein Ersatzsatz „wir speichern nichts" wäre zu viel versprochen:
         die Server-Protokolle sehen weiterhin eine IP-Adresse. -->
    <div class="flex items-center gap-2">
      <UButton type="submit" size="sm" :loading="loading">
        {{ parentId ? t('comments.form.replySubmit') : t('comments.form.submit') }}
      </UButton>
    </div>
  </UForm>
</template>
