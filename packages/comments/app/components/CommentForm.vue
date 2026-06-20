<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createCommentSchema } from '../../schemas/comment'

const props = defineProps<{
  /** Gesetzt = Antwort-Formular, sonst Top-Level-Kommentar */
  parentId?: string
}>()

const emit = defineEmits<{ created: [] }>()

const { t } = useI18n()
const store = useCommentStore()
const toast = useToast()
const loading = ref(false)

// Formular validiert nur den Text — Target/parentId kommen aus Store/Props
const schema = computed(() => createCommentSchema(t).pick({ content: true }))
type FormInput = z.infer<typeof schema.value>

const state = reactive<FormInput>({ content: '' })

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  loading.value = true
  try {
    // Optimistic im Store — erscheint sofort, Rollback bei Fehler
    await store.addComment(event.data.content, props.parentId)
    state.content = ''
    emit('created')
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    const key = code === 'maintenance'
      ? 'comments.disabled.maintenanceToast'
      : code === 'comments_disabled' ? 'comments.disabled.toast' : 'comments.form.error'
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :validate-on="[]" :state="state" class="space-y-2" @submit="onSubmit">
    <UFormField name="content">
      <UTextarea
        v-model="state.content"
        :rows="parentId ? 2 : 3"
        :placeholder="parentId ? t('comments.form.replyPlaceholder') : t('comments.form.placeholder')"
        class="w-full"
      />
    </UFormField>
    <UButton type="submit" size="sm" :loading="loading">
      {{ parentId ? t('comments.form.replySubmit') : t('comments.form.submit') }}
    </UButton>
  </UForm>
</template>
