<script setup lang="ts">
/**
 * Avatar-Upload: Nuxt UI UFileUpload als Dropzone (Klick + Drag-&-Drop). Der
 * Avatar wird über den #leading-Slot eingesetzt — NICHT über den Default-Slot,
 * der sonst das klickbare base-Element samt open()/dropzoneRef ersetzen würde.
 * UFileUpload liefert nur die Datei (v-model); der Upload läuft über useStorage()
 * in den Appwrite-Bucket, gespeichert wird die optimierte Preview-URL (WebP 256²).
 */
const props = defineProps<{
  /** aktuelle Avatar-URL (leer/undefined = Initialen-Fallback) */
  modelValue?: string
  /** für Initialen + alt-Text */
  name?: string
  /** Appwrite Storage Bucket */
  bucketId: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const toast = useToast()

const MAX_BYTES = 5 * 1024 * 1024
const file = ref<File | null>(null)
const uploading = ref(false)

watch(file, async (selected) => {
  if (!selected) return
  if (selected.size > MAX_BYTES) {
    toast.add({ title: t('profile.photoTooLarge'), color: 'error' })
    file.value = null
    return
  }

  uploading.value = true
  try {
    const { upload, fileUrl } = useStorage(props.bucketId)
    const uploaded = await upload(selected)
    emit('update:modelValue', fileUrl(uploaded.$id, { width: 256, height: 256, quality: 85 }))
  }
  catch {
    toast.add({ title: t('profile.photoUploadFailed'), color: 'error' })
  }
  finally {
    uploading.value = false
    file.value = null
  }
})

function removePhoto() {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="space-y-2">
    <UFileUpload
      v-model="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      :label="t('profile.photoLabel')"
      :description="t('profile.photoHint')"
      :interactive="!uploading"
      :preview="false"
      :ui="{ base: 'p-6', label: 'text-sm font-medium', description: 'text-xs' }"
    >
      <template #leading>
        <div class="relative">
          <UAvatar :src="modelValue || undefined" :alt="name" size="2xl" icon="i-ph-user" />
          <div v-if="uploading" class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
            <UIcon name="i-ph-spinner" class="size-5 animate-spin text-white" />
          </div>
        </div>
      </template>
    </UFileUpload>

    <UButton
      v-if="modelValue"
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
