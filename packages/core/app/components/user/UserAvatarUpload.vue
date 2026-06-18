<script setup lang="ts">
/**
 * Avatar-Upload: runder Avatar als Drag-&-Drop-/Klick-Ziel (Nuxt UI UFileUpload).
 * UFileUpload liefert nur die ausgewählte Datei (v-model) — der eigentliche Upload
 * läuft über useStorage() in den Appwrite-Bucket; gespeichert wird die optimierte
 * Preview-URL (WebP, 256²) in modelValue.
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
    // Optimierte, quadratische Preview-URL speichern (Display-Komponenten nutzen sie direkt)
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
  <div class="flex items-center gap-4">
    <UFileUpload
      v-model="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      :interactive="!uploading"
      :preview="false"
      :ui="{ root: 'rounded-full', base: 'rounded-full size-20 p-0 border-dashed' }"
    >
      <template #default>
        <div class="group relative size-20 cursor-pointer">
          <UAvatar :src="modelValue || undefined" :alt="name" icon="i-ph-user" class="size-20 text-2xl" />
          <div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <UIcon :name="uploading ? 'i-ph-spinner' : 'i-ph-camera'" class="size-6 text-white" :class="{ 'animate-spin': uploading }" />
          </div>
        </div>
      </template>
    </UFileUpload>

    <div class="flex flex-col gap-1">
      <p class="text-sm font-medium">{{ t('profile.photoLabel') }}</p>
      <p class="text-xs text-muted">{{ t('profile.photoHint') }}</p>
      <UButton
        v-if="modelValue"
        color="neutral"
        variant="link"
        size="xs"
        icon="i-ph-trash"
        class="w-fit px-0"
        @click="removePhoto"
      >
        {{ t('profile.photoRemove') }}
      </UButton>
    </div>
  </div>
</template>
