<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()

const confirm = useConfirm()

async function deleteAccount() {
  try {
    const ok = await confirm({
      title: t('account.delete.confirmTitle'),
      description: t('account.delete.confirmText'),
      confirmLabel: t('account.delete.confirm'),
      action: () => $fetch('/api/auth/account', { method: 'DELETE' }),
    })
    if (!ok) return
    auth.setUser(null)
    toast.add({ title: t('account.delete.success'), color: 'success', icon: 'i-ph-check-circle' })
    await navigateTo(localePath('/login'))
  }
  catch (error) {
    toast.add({ title: isNetworkError(error) ? t('auth.networkError') : t('account.delete.failed'), color: 'error' })
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
      <UButton :label="t('account.delete.button')" color="error" @click="deleteAccount" />
    </template>
  </UPageCard>
</template>
