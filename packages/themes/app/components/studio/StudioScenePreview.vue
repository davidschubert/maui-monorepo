<script setup lang="ts">
/**
 * Szenen-Vorschau (Tabs Komponenten/Dashboard/Inhalt + Rahmen) — geteilt
 * zwischen Studio-Editor und Galerie. Hell/Dunkel folgt dem App-Modus;
 * gefärbt wird über das jeweils aktive Theme (bzw. c-draft im Editor).
 */
const { t } = useI18n()

const SCENES = ['branding', 'components', 'dashboard', 'content'] as const
const scene = ref<typeof SCENES[number]>('branding')
</script>

<template>
  <div class="min-w-0 space-y-4">
    <div class="flex items-center gap-1">
      <UButton
        v-for="s in SCENES"
        :key="s"
        size="xs"
        :color="scene === s ? 'primary' : 'neutral'"
        :variant="scene === s ? 'subtle' : 'ghost'"
        @click="scene = s"
      >
        {{ t(`themes.studio.scenes.${s}`) }}
      </UButton>
    </div>

    <div class="min-w-0 rounded-lg bg-default p-4 ring-1 ring-default">
      <StudioSceneBranding v-if="scene === 'branding'" />
      <StudioSceneComponents v-else-if="scene === 'components'" />
      <StudioSceneDashboard v-else-if="scene === 'dashboard'" />
      <StudioSceneContent v-else />
    </div>
  </div>
</template>
