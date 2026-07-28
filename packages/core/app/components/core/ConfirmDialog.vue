<script setup lang="ts">
/**
 * Der EINE Bestätigungsdialog für destruktive Aktionen (Audit-Befund C10).
 *
 * Wird NICHT direkt im Markup verwendet, sondern ausschließlich über
 * useConfirm() (useOverlay-Instanz) — deshalb gibt es hier keine Slots und
 * keine Varianten, nur die Optionen aus ConfirmOptions.
 *
 * `open`, `update:open` und `after:leave` kommen vom UOverlayProvider und
 * fallen als Attribute an UModal durch.
 */
import type { ConfirmOptions, ConfirmResult } from '../../composables/useConfirm'

const props = defineProps<ConfirmOptions>()
const emit = defineEmits<{ close: [ConfirmResult] }>()

const { t } = useI18n()
const busy = ref(false)

async function onConfirm() {
  if (busy.value) return
  if (!props.action) {
    emit('close', { ok: true })
    return
  }
  busy.value = true
  try {
    await props.action()
    emit('close', { ok: true })
  }
  catch (error) {
    emit('close', { ok: false, error: error ?? new Error('confirm action failed') })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :title="props.title"
    :description="props.description"
    :dismissible="!busy"
    :close="!busy"
    data-confirm-dialog
  >
    <template v-if="props.warning" #body>
      <UAlert
        color="error"
        variant="subtle"
        icon="i-ph-warning-octagon"
        :title="props.warning.title"
        :description="props.warning.description"
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="busy"
          :label="t('ui.cancel')"
          data-confirm-cancel
          @click="() => emit('close', { ok: false })"
        />
        <UButton
          :color="props.color ?? 'error'"
          :loading="busy"
          :disabled="busy"
          :label="props.confirmLabel ?? t('ui.confirm.confirm')"
          data-confirm-accept
          @click="onConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
