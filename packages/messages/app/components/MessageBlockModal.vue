<script setup lang="ts">
/**
 * SPERREN — der Dialog mit Davids Häkchen (Entscheidung 3).
 *
 * Die Beschreibung sagt beides aus, was der Mensch wissen muss und darf: die
 * Sperre wirkt BEIDSEITIG (auch ich kann dann nicht mehr schreiben — sonst
 * wäre es eine Überraschung), und die andere Person erfährt nichts davon.
 * Warum sie nichts erfährt, steht in Konzept § 2.3; hier steht nur die
 * Tatsache, weil der Mensch mit ihr rechnen soll.
 */
const props = defineProps<{
  userId: string
  name: string
}>()

const emit = defineEmits<{ blocked: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()

const everywhere = ref(false)
const pending = ref(false)

async function submit() {
  if (!props.userId || pending.value) return
  pending.value = true
  try {
    await $fetch('/api/messages/blocks', {
      method: 'POST',
      body: { userId: props.userId, everywhere: everywhere.value },
    })
    toast.add({ title: t('messages.block.done'), color: 'success', icon: 'i-ph-prohibit' })
    open.value = false
    everywhere.value = false
    emit('blocked')
  }
  catch {
    toast.add({ title: t('messages.block.failed'), color: 'error', icon: 'i-ph-warning' })
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('messages.block.title')">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          {{ t('messages.block.description') }}
        </p>
        <p class="text-sm font-medium">
          {{ props.name }}
        </p>
        <UCheckbox
          v-model="everywhere"
          :label="t('messages.block.everywhere')"
          :description="t('messages.block.everywhereHint')"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('messages.block.cancel')" @click="open = false" />
        <UButton color="error" :label="t('messages.block.submit')" :loading="pending" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
