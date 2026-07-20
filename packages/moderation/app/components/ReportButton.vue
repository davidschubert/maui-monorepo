<script setup lang="ts">
import type { ReportReason } from '../../shared/types/report'

/**
 * Generischer Melde-Button. Der Konsument (comments, users-Card, …) liefert
 * targetType/targetId + seinen eigenen (lokalisierten) Reason-Katalog. Der
 * Button selbst weiß nichts über die Domäne.
 */
const props = withDefaults(defineProps<{
  targetType: string
  targetId: string
  reasons: ReportReason[]
  reported?: boolean
  size?: 'xs' | 'sm' | 'md'
}>(), { reported: false, size: 'xs' })

const emit = defineEmits<{ 'update:reported': [boolean] }>()

const { t } = useI18n()
const toast = useToast()
const { isLoggedIn } = useCurrentUser()
const { pending, submit, retract } = useReport()

const open = ref(false)
const reason = ref<string | undefined>(undefined)
const note = ref('')

async function onSubmit() {
  if (!reason.value) return
  try {
    await submit({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      note: note.value || undefined,
    })
    emit('update:reported', true)
    open.value = false
    reason.value = undefined
    note.value = ''
    toast.add({ title: t('moderation.report.success'), color: 'success', icon: 'i-ph-flag' })
  }
  catch {
    toast.add({ title: t('moderation.report.error'), color: 'error' })
  }
}

async function onRetract() {
  try {
    await retract(props.targetType, props.targetId)
    emit('update:reported', false)
    toast.add({ title: t('moderation.report.retracted'), color: 'success', icon: 'i-ph-flag-banner-fold' })
  }
  catch {
    toast.add({ title: t('moderation.report.error'), color: 'error' })
  }
}
</script>

<template>
  <div v-if="isLoggedIn" class="inline-flex">
    <UButton
      v-if="reported"
      :size="size" color="neutral" variant="ghost" icon="i-ph-flag-banner-fold"
      :loading="pending"
      @click="onRetract"
    >
      {{ t('moderation.report.retract') }}
    </UButton>
    <UButton
      v-else
      :size="size" color="neutral" variant="ghost" icon="i-ph-flag"
      @click="() => { open = true }"
    >
      {{ t('moderation.report.action') }}
    </UButton>

    <UModal v-model:open="open" :title="t('moderation.report.title')">
      <template #body>
        <div class="space-y-3">
          <UFormField :label="t('moderation.report.reasonLabel')" required>
            <USelect v-model="reason" :items="reasons" class="w-full" />
          </UFormField>
          <UTextarea
            v-model="note"
            :rows="3"
            :placeholder="t('moderation.report.notePlaceholder')"
            class="w-full"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { open = false }">
            {{ t('moderation.report.cancel') }}
          </UButton>
          <UButton color="error" :loading="pending" :disabled="!reason" @click="onSubmit">
            {{ t('moderation.report.submit') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
