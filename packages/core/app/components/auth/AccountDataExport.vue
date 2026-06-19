<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()
const loading = ref(false)

async function exportData() {
  loading.value = true
  try {
    const data = await $fetch('/api/auth/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'my-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  catch {
    toast.add({ title: t('account.export.failed'), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard :title="t('account.export.title')" :description="t('account.export.description')" variant="subtle">
    <template #footer>
      <UButton :loading="loading" icon="i-ph-download-simple" color="neutral" variant="subtle" @click="exportData">
        {{ t('account.export.button') }}
      </UButton>
    </template>
  </UPageCard>
</template>
