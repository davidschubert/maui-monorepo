<script setup lang="ts">
/**
 * Passwort-Stärke-Indikator — dieselben 6 Kriterien, die createRegisterFormSchema /
 * createPasswordChangeSchema erzwingen (Live-Feedback). Wird sowohl bei Registrierung
 * als auch bei der Passwort-Änderung genutzt.
 */
const props = defineProps<{ password: string, passwordConfirm: string }>()

const { t } = useI18n()

const checks = computed(() => {
  const pw = props.password ?? ''
  return [
    { label: t('auth.password.min'), valid: pw.length >= 8 },
    { label: t('auth.password.upper'), valid: /[A-Z]/.test(pw) },
    { label: t('auth.password.lower'), valid: /[a-z]/.test(pw) },
    { label: t('auth.password.number'), valid: /[0-9]/.test(pw) },
    { label: t('auth.password.special'), valid: /[^A-Za-z0-9]/.test(pw) },
    { label: t('auth.password.match'), valid: pw.length > 0 && pw === props.passwordConfirm },
  ]
})
const score = computed(() => checks.value.filter(check => check.valid).length)
const color = computed(() => {
  if (score.value === 0) return 'neutral' as const
  if (score.value <= 2) return 'error' as const
  if (score.value <= 4) return 'warning' as const
  return 'success' as const
})
</script>

<template>
  <div class="space-y-2">
    <UProgress :model-value="score" :max="6" :color="color" size="sm" />
    <ul class="space-y-1">
      <li
        v-for="(check, index) in checks"
        :key="index"
        class="flex items-center gap-1.5 text-xs"
        :class="check.valid ? 'text-success' : 'text-muted'"
      >
        <UIcon :name="check.valid ? 'i-ph-check-circle' : 'i-ph-circle-dashed'" class="size-4 shrink-0" />
        <span>{{ check.label }}</span>
      </li>
    </ul>
  </div>
</template>
