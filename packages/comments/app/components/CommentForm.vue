<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createCommentSchema } from '../../schemas/comment'
import type { Comment } from '../../shared/types/comment'

const props = defineProps<{
  postId: string
  parentId?: string
}>()

const emit = defineEmits<{ created: [comment: Comment] }>()

const { isLoggedIn } = useCurrentUser()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

// Formular validiert nur den Text — postId/parentId kommen aus den Props
const schema = createCommentSchema().pick({ text: true })
type FormInput = z.infer<typeof schema>

const state = reactive<FormInput>({ text: '' })

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  loading.value = true
  errorMessage.value = null

  try {
    const comment = await $fetch<Comment>('/api/comments', {
      method: 'POST',
      body: {
        postId: props.postId,
        text: event.data.text,
        parentId: props.parentId,
      },
    })
    state.text = ''
    emit('created', comment)
  }
  catch {
    errorMessage.value = 'Kommentar konnte nicht gespeichert werden.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm v-if="isLoggedIn" :schema="schema" :state="state" class="space-y-2" @submit="onSubmit">
    <UFormField name="text">
      <UTextarea v-model="state.text" :rows="3" placeholder="Dein Kommentar…" class="w-full" />
    </UFormField>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    <UButton type="submit" size="sm" :loading="loading">Kommentieren</UButton>
  </UForm>
  <p v-else class="text-sm text-muted">
    <ULink to="/login" class="font-medium text-primary">Anmelden</ULink>, um zu kommentieren.
  </p>
</template>
