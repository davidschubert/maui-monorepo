<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()

const open = ref(false)
const loading = ref(false)

async function deleteAccount() {
  loading.value = true
  try {
    await $fetch('/api/auth/account', { method: 'DELETE' })
    auth.setUser(null)
    open.value = false
    toast.add({ title: t('account.delete.success'), color: 'success', icon: 'i-ph-check-circle' })
    await navigateTo(localePath('/login'))
  }
  catch (error) {
    toast.add({ title: isNetworkError(error) ? t('auth.networkError') : t('account.delete.failed'), color: 'error' })
    loading.value = false
  }
}
</script>

<template>
  <UPageCard
    :title="t('account.delete.title')"
    :description="t('account.delete.description')"
    class="bg-linear-to-tl from-error/10 from-5% to-default"
  >
    <template #footer>
      <UButton :label="t('account.delete.button')" color="error" @click="open = true" />
    </template>

    <UModal v-model:open="open" :title="t('account.delete.confirmTitle')">
      <template #body>
        <p class="text-sm">{{ t('account.delete.confirmText') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ t('account.delete.cancel') }}</UButton>
          <UButton color="error" :loading="loading" @click="deleteAccount">{{ t('account.delete.confirm') }}</UButton>
        </div>
      </template>
    </UModal>
  </UPageCard>
</template>
