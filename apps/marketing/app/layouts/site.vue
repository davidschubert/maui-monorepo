<script setup lang="ts">
// marketing.css + die Licht-Dramaturgie wirken nur unter body.marketing-site —
// so bleiben etwaige Layer-Layouts (Login etc.) unberührt.
useHead({ bodyAttrs: { class: 'marketing-site' } })
</script>

<template>
  <div>
    <MarketingHeader />
    <!--
      `UMain` statt der eigenen Flex-Schale (Paket 5). Die Schale hatte genau
      EINE Aufgabe: auf kurzen Seiten (z. B. /impressum) darf der Fuß nicht in
      der Mitte des Fensters kleben. `UMain` löst das mit
      `min-h-[calc(100vh - var(--ui-header-height))]` — dieselbe Wirkung ohne
      `min-height: 100vh` am Elternteil und ohne scoped CSS.
      Die Rechnung stimmt nur, weil BEIDE Seiten dieselbe Zahl lesen: der Kopf
      setzt --ui-header-height als `min-h` (puka-theme.css, dort auch die
      Messung). Die tone-*-Flächen stören sich daran nicht — sie liegen an den
      Sektionen INNERHALB von <main>, nicht an der Schale.
    -->
    <UMain>
      <slot />
    </UMain>
    <MarketingFooter />
  </div>
</template>
