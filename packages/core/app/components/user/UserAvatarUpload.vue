<script setup lang="ts">
/**
 * Avatar-Auswahl (Nuxt UI UFileUpload, Klick + Drag-&-Drop). Lädt bewusst NICHT
 * sofort hoch, sondern reicht die gewählte Datei via v-model:file ans Formular —
 * hochgeladen wird erst beim Speichern. So entstehen keine verwaisten Storage-
 * Dateien aus „ausgewählt, aber nie gespeichert". Vorschau läuft lokal über eine
 * Object-URL; gespeichert wird weiterhin nur die optimierte Preview-URL (WebP).
 */
const avatarUrl = defineModel<string>({ default: '' })
const file = defineModel<File | null>('file', { default: null })

defineProps<{ name?: string }>()

const { t } = useI18n()
const toast = useToast()

const MAX_BYTES = 5 * 1024 * 1024
const objectUrl = ref<string>()

watch(file, (selected) => {
  if (selected && selected.size > MAX_BYTES) {
    toast.add({ title: t('profile.photoTooLarge'), color: 'error' })
    file.value = null
    return
  }
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = selected ? URL.createObjectURL(selected) : undefined
})

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})

const previewSrc = computed(() => objectUrl.value || avatarUrl.value || undefined)
const hasPhoto = computed(() => Boolean(objectUrl.value || avatarUrl.value))

function removePhoto() {
  file.value = null
  avatarUrl.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <UFileUpload
      v-model="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      :label="t('profile.photoLabel')"
      :description="t('profile.photoHint')"
      :preview="false"
      :ui="{ base: 'p-6', label: 'text-sm font-medium', description: 'text-xs' }"
    >
      <template #leading>
        <UAvatar :src="previewSrc" :alt="name" size="2xl" icon="i-ph-user" />
      </template>
    </UFileUpload>

    <UButton
      v-if="hasPhoto"
      color="neutral"
      variant="link"
      size="xs"
      icon="i-ph-trash"
      class="px-0"
      @click="removePhoto"
    >
      {{ t('profile.photoRemove') }}
    </UButton>
  </div>
</template>
