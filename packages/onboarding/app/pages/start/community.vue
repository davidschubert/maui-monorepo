<script setup lang="ts">
import {
  SITE_CATEGORIES,
  SITE_GOALS,
  SITE_MEMBER_RANGES,
  SITE_PURPOSES,
  isEarlyAccessGoal,
  type SiteVibeId,
} from '../../../../control/shared/onboarding'
import { OPERATOR_APEX, nameToSubdomain } from '../../../../control/schemas/tenant'
import {
  WIZARD_STEPS,
  isStepComplete,
  nextStep,
  normalizeStep,
  previousStep,
  stepIndex,
  type SlugCheck,
  type WizardStep,
} from '../../../shared/wizardSteps'
import type { Choice } from '../../components/OnboardingChoices.vue'

/**
 * Der Setup-Flow (SAAS-ROADMAP #1, Davids Schrittfolge 1–7).
 *
 * EINE Seite, sieben Schritte, Schritt im URL (`?step=`): der Browser-Zurück-
 * Knopf tut damit das Erwartbare, und ein geteilter Link landet nicht mitten
 * im Formular eines anderen. Der Entwurf lebt in sessionStorage — bis Schritt 7
 * ist NICHTS angelegt, ein Abbruch hinterlässt also keine halbe Community.
 *
 * Angelegt wird genau EINMAL, am Ende: ein Aufruf, alle Antworten. Die
 * Idempotenz liegt serverseitig am Hostnamen, ein Doppelklick kann also nichts
 * doppelt erzeugen.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const STEPS = WIZARD_STEPS

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const draft = useOnboardingDraft()
const auth = useAuthStore()

// ── Schritt aus der URL (fehlerhafte Werte → erster Schritt) ────────────────
const step = computed<WizardStep>(() => normalizeStep(route.query.step))
const index = computed(() => stepIndex(step.value))

function goTo(next: WizardStep) {
  router.push({ query: { ...route.query, step: next } })
}

// ── Kataloge als Auswahlkarten (Beschriftungen aus i18n, Ids aus dem Vertrag) ─
const purposeOptions = computed<Choice[]>(() => SITE_PURPOSES.map(id => ({
  value: id, label: t(`onboarding.purposes.${id}.label`), hint: t(`onboarding.purposes.${id}.hint`),
})))
const sizeOptions = computed<Choice[]>(() => SITE_MEMBER_RANGES.map(id => ({
  value: id, label: t(`onboarding.sizes.${id}`),
})))
const categoryOptions = computed<Choice[]>(() => SITE_CATEGORIES.map(id => ({
  value: id, label: t(`onboarding.categories.${id}.label`), hint: t(`onboarding.categories.${id}.hint`),
})))
const goalOptions = computed<Choice[]>(() => SITE_GOALS.map(goal => ({
  value: goal.id,
  label: t(`onboarding.goals.${goal.id}.label`),
  hint: t(`onboarding.goals.${goal.id}.hint`),
  // Ehrlich gekennzeichnet: das Ziel ist wählbar (wertvolles Signal), der
  // Baustein dazu ist aber noch nicht allgemein verfügbar (G0-Entscheidung).
  ...(isEarlyAccessGoal(goal.id) ? { badge: t('onboarding.earlyAccessBadge') } : {}),
})))

// ── Adresse: Vorschlag aus dem Namen, bis der Nutzer selbst tippt ───────────
watch(() => draft.value.name, (name) => {
  if (draft.value.slugTouched) return
  draft.value.slug = nameToSubdomain(name ?? '')
})

const host = computed(() => draft.value.slug ? `${draft.value.slug}.${OPERATOR_APEX}` : '')

const slugState = ref<SlugCheck>('idle')
const aiAvailable = ref(false)
let slugTimer: ReturnType<typeof setTimeout> | undefined

async function checkSlug() {
  const slug = (draft.value.slug ?? '').trim()
  if (slug.length < 3) {
    slugState.value = 'idle'
    return
  }
  slugState.value = 'checking'
  try {
    const result = await $fetch<{ slugAvailable?: boolean, aiAvailable?: boolean }>('/api/onboarding/precheck', {
      method: 'POST',
      body: { slug },
    })
    aiAvailable.value = result.aiAvailable === true
    slugState.value = result.slugAvailable ? 'free' : 'taken'
  }
  catch {
    // Netz-/Serverproblem darf nicht wie „belegt" aussehen — sonst sucht
    // jemand einen neuen Namen, obwohl der alte frei ist.
    slugState.value = 'error'
  }
}

// Entprellt: jeder Tastendruck wäre eine Anfrage.
watch(() => draft.value.slug, () => {
  slugState.value = 'idle'
  clearTimeout(slugTimer)
  slugTimer = setTimeout(checkSlug, 450)
})
onMounted(() => {
  if (!draft.value.inviteCode) {
    // Ohne Code gibt es keinen Wizard (das Tor steht in /start).
    navigateTo(localePath('/start'))
    return
  }
  if (draft.value.slug) checkSlug()
})
onBeforeUnmount(() => clearTimeout(slugTimer))

// ── KI-Vorschlag (Schritt 4) ────────────────────────────────────────────────
const suggesting = ref(false)
const suggestFailed = ref(false)

async function suggest() {
  if (suggesting.value) return
  suggesting.value = true
  suggestFailed.value = false
  try {
    const result = await $fetch<{ suggestion: string }>('/api/onboarding/suggest', {
      method: 'POST',
      body: {
        name: draft.value.name,
        category: draft.value.category,
        memberRange: draft.value.memberRange,
        locale: locale.value,
      },
    })
    draft.value.description = result.suggestion
  }
  catch {
    suggestFailed.value = true
  }
  finally {
    suggesting.value = false
  }
}

// ── Weiter-Bedingung je Schritt (Regel + Tests: shared/wizardSteps.ts) ──────
const canContinue = computed(() => isStepComplete(step.value, draft.value, slugState.value))

function next() {
  if (!canContinue.value) return
  const target = nextStep(step.value)
  if (target) goTo(target)
}
function back() {
  const target = previousStep(step.value)
  if (target) goTo(target)
  else navigateTo(localePath('/start'))
}

// ── Anlegen ─────────────────────────────────────────────────────────────────
const creating = ref(false)
const createError = ref('')

async function create() {
  if (creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const site = await $fetch<{ communityId: string, host: string, url: string, trialEndsAt: string | null }>('/api/onboarding/site', {
      method: 'POST',
      body: {
        name: (draft.value.name ?? '').trim(),
        slug: draft.value.slug,
        purpose: draft.value.purpose,
        memberRange: draft.value.memberRange,
        category: draft.value.category,
        goal: draft.value.goal,
        ...(draft.value.description?.trim() ? { description: draft.value.description.trim() } : {}),
        vibe: draft.value.vibe,
        inviteCode: draft.value.inviteCode,
        locale: locale.value,
      },
    })
    await navigateTo({ path: localePath('/start/done'), query: { site: site.communityId, host: site.host } })
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number }).status
      ?? (error as { statusCode?: number }).statusCode
    // Jede Ablehnung bekommt einen Satz, der sagt, was JETZT zu tun ist.
    createError.value = status === 409
      ? t('onboarding.errors.hostTaken')
      : status === 403
        ? t('onboarding.errors.notAllowed')
        : status === 400
          ? t('onboarding.errors.invalid')
          : t('onboarding.errors.unavailable')
  }
  finally {
    creating.value = false
  }
}

const summaryRows = computed(() => [
  { label: t('onboarding.summary.name'), value: draft.value.name ?? '' },
  { label: t('onboarding.summary.address'), value: host.value },
  { label: t('onboarding.summary.purpose'), value: draft.value.purpose ? t(`onboarding.purposes.${draft.value.purpose}.label`) : '' },
  { label: t('onboarding.summary.size'), value: draft.value.memberRange ? t(`onboarding.sizes.${draft.value.memberRange}`) : '' },
  { label: t('onboarding.summary.category'), value: draft.value.category ? t(`onboarding.categories.${draft.value.category}.label`) : '' },
  { label: t('onboarding.summary.goal'), value: draft.value.goal ? t(`onboarding.goals.${draft.value.goal}.label`) : '' },
  { label: t('onboarding.summary.vibe'), value: draft.value.vibe ? t(`onboarding.vibes.${draft.value.vibe}.label`) : '' },
].filter(row => row.value))

useHead({ title: () => `${t(`onboarding.steps.${step.value}.title`)} · ${t('onboarding.gate.title')}` })
</script>

<template>
  <div class="space-y-8">
    <OnboardingProgress
      :current="index + 1"
      :total="STEPS.length"
      :label="t('onboarding.progress', { step: index + 1, total: STEPS.length })"
    />

    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ step === 'basics' ? t('onboarding.steps.basics.heading', { name: auth.user?.name || t('onboarding.gate.fallbackName') }) : t(`onboarding.steps.${step}.title`) }}
      </h1>
      <p class="text-muted">{{ t(`onboarding.steps.${step}.intro`) }}</p>
    </div>

    <form class="space-y-8" @submit.prevent="step === 'summary' ? create() : next()">
      <!-- 1 · Name, Adresse, Zweck -->
      <template v-if="step === 'basics'">
        <div class="space-y-6">
          <UFormField :label="t('onboarding.fields.name')" :description="t('onboarding.fields.nameHint')">
            <UInput
              v-model="draft.name"
              :placeholder="t('onboarding.fields.namePlaceholder')"
              size="lg"
              class="w-full"
              autofocus
            />
          </UFormField>

          <UFormField :label="t('onboarding.fields.address')">
            <div class="flex items-stretch">
              <UInput
                v-model="draft.slug"
                :placeholder="t('onboarding.fields.addressPlaceholder')"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-e-none' }"
                @input="draft.slugTouched = true"
              />
              <span class="flex select-none items-center rounded-e-md border border-s-0 border-accented bg-elevated px-3 text-sm text-muted">
                .{{ OPERATOR_APEX }}
              </span>
            </div>
            <template #help>
              <span v-if="slugState === 'checking'" class="text-muted">{{ t('onboarding.fields.addressChecking') }}</span>
              <span v-else-if="slugState === 'free'" class="text-success">{{ t('onboarding.fields.addressFree', { host }) }}</span>
              <span v-else-if="slugState === 'taken'" class="text-error">{{ t('onboarding.fields.addressTaken') }}</span>
              <span v-else-if="slugState === 'error'" class="text-warning">{{ t('onboarding.fields.addressUnknown') }}</span>
              <span v-else class="text-dimmed">{{ t('onboarding.fields.addressHint') }}</span>
            </template>
          </UFormField>

          <div class="space-y-3">
            <p class="text-sm font-medium">{{ t('onboarding.fields.purpose') }}</p>
            <OnboardingChoices
              v-model="draft.purpose"
              name="purpose"
              :options="purposeOptions"
              :legend="t('onboarding.fields.purpose')"
              :columns="1"
            />
          </div>
        </div>
      </template>

      <!-- 2 · Größe -->
      <OnboardingChoices
        v-else-if="step === 'size'"
        v-model="draft.memberRange"
        name="memberRange"
        :options="sizeOptions"
        :legend="t('onboarding.steps.size.title')"
      />

      <!-- 3 · Kategorie -->
      <OnboardingChoices
        v-else-if="step === 'category'"
        v-model="draft.category"
        name="category"
        :options="categoryOptions"
        :legend="t('onboarding.steps.category.title')"
      />

      <!-- 4 · Beschreibung (überspringbar, optionaler KI-Vorschlag) -->
      <template v-else-if="step === 'description'">
        <div class="space-y-3">
          <UFormField :label="t('onboarding.fields.description')" :description="t('onboarding.fields.descriptionHint')">
            <UTextarea
              v-model="draft.description"
              :rows="5"
              :maxlength="600"
              :placeholder="t('onboarding.fields.descriptionPlaceholder')"
              class="w-full"
              autofocus
            />
          </UFormField>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <UButton
              v-if="aiAvailable"
              type="button"
              icon="i-ph-sparkle"
              color="neutral"
              variant="subtle"
              :loading="suggesting"
              @click="suggest"
            >
              {{ t('onboarding.fields.suggest') }}
            </UButton>
            <p class="text-xs text-dimmed">{{ (draft.description ?? '').length }}/600</p>
          </div>
          <p v-if="suggestFailed" class="text-sm text-warning">{{ t('onboarding.fields.suggestFailed') }}</p>
          <p v-if="aiAvailable" class="text-xs text-dimmed">{{ t('onboarding.fields.suggestNote') }}</p>
        </div>
      </template>

      <!-- 5 · Ziel -->
      <OnboardingChoices
        v-else-if="step === 'goal'"
        v-model="draft.goal"
        name="goal"
        :options="goalOptions"
        :legend="t('onboarding.steps.goal.title')"
      />

      <!-- 6 · Vibe -->
      <OnboardingVibePicker
        v-else-if="step === 'vibe'"
        :model-value="draft.vibe"
        @update:model-value="(value: SiteVibeId) => draft.vibe = value"
      />

      <!-- 7 · Zusammenfassung -->
      <template v-else-if="step === 'summary'">
        <div class="space-y-6">
          <dl class="divide-y divide-default overflow-hidden rounded-xl border border-default">
            <div v-for="row in summaryRows" :key="row.label" class="flex flex-wrap gap-1 px-4 py-3 sm:flex-nowrap sm:gap-4">
              <dt class="w-40 shrink-0 text-sm text-muted">{{ row.label }}</dt>
              <dd class="min-w-0 break-words text-sm font-medium">{{ row.value }}</dd>
            </div>
          </dl>

          <p v-if="draft.description" class="rounded-xl bg-elevated/60 p-4 text-sm">
            {{ draft.description }}
          </p>

          <div class="flex items-start gap-3 rounded-xl border border-default p-4">
            <UIcon name="i-ph-clock-countdown" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="space-y-1 text-sm">
              <p class="font-medium">{{ t('onboarding.summary.trialTitle') }}</p>
              <p class="text-muted">{{ t('onboarding.summary.trialBody') }}</p>
            </div>
          </div>

          <p v-if="createError" class="flex items-start gap-2 text-sm text-error">
            <UIcon name="i-ph-warning-circle" class="mt-0.5 size-4 shrink-0" />
            {{ createError }}
          </p>
        </div>
      </template>

      <!-- Steuerung -->
      <div class="flex items-center justify-between gap-3 border-t border-default pt-6">
        <UButton type="button" color="neutral" variant="ghost" icon="i-ph-arrow-left" @click="back">
          {{ t('onboarding.back') }}
        </UButton>

        <UButton
          v-if="step === 'summary'"
          type="submit"
          size="lg"
          :loading="creating"
          trailing-icon="i-ph-check"
        >
          {{ t('onboarding.create') }}
        </UButton>
        <UButton
          v-else
          type="submit"
          size="lg"
          :disabled="!canContinue"
          trailing-icon="i-ph-arrow-right"
        >
          {{ step === 'description' && !draft.description ? t('onboarding.skip') : t('onboarding.next') }}
        </UButton>
      </div>
    </form>
  </div>
</template>
