<script setup lang="ts">
// Szene 1 — Cold Open (§6.4): starkes Bild + Versprechen, bevor erklärt wird.
// Der Gegenspieler-Raum ist noch „bewölkt" (kühles Grau), aber die puka bricht
// oben rechts bereits durch — das Leitmotiv setzt sofort ein.
const { t } = useI18n()
const { start, demo } = useProductLinks()

const links = computed(() => [
  { to: start, color: 'primary' as const, label: t('marketing.hero.ctaPrimary') },
  {
    to: demo,
    color: 'neutral' as const,
    variant: 'outline' as const,
    icon: 'i-ph-play-circle',
    label: t('marketing.hero.ctaSecondary'),
  },
])

const trust = computed(() => [
  { icon: 'i-ph-flag-bold', label: t('marketing.hero.trust.hosting') },
  { icon: 'i-ph-shield-check-bold', label: t('marketing.hero.trust.tracking') },
  { icon: 'i-ph-lock-key-bold', label: t('marketing.hero.trust.privacy') },
  { icon: 'i-ph-puzzle-piece-bold', label: t('marketing.hero.trust.modular') },
])
</script>

<template>
  <!--
    Der Startseiten-Hero ist der einzige ZWEISPALTIGE (`horizontal`): links die
    Botschaft, rechts das Produktbild. Alle Maße kommen aus dem `pageHero`-
    Vertrag in app/app.config.ts; die drei Abweichungen dieses einen Heros
    stehen als Variablen-Überschreibung direkt an der Wurzel — größere
    Polsterung oben, KEINE unten (die Refrain-Zeile im `#bottom`-Slot trägt sie)
    und die große Display-Schrift der Startseite.
    `data-reveal` ist hier entfallen: die Hülle IST jetzt die Sektion, und eine
    ausgeblendete Sektion nähme den `tone-cloud`-Grund mit — der Bestand hängte
    das Attribut an einen inneren Textblock, den es nicht mehr gibt.
  -->
  <UPageHero
    as="section"
    orientation="horizontal"
    class="hero tone-cloud [--mkt-hero-pb:0px] [--mkt-hero-pt:clamp(4rem,8vw,7rem)] [--mkt-hero-title:clamp(2.4rem,6vw,4.2rem)] [--mkt-lead:clamp(1.1rem,1.7vw,1.35rem)]"
    :title="t('marketing.hero.title')"
    :description="t('marketing.hero.sub')"
    :ui="{
      // Bestand `.hero-inner`: `1.05fr 0.95fr` — die Botschaft bekommt etwas
      // mehr Raum als das Bild. Mit den gleichen Hälften der Vorgabe brach
      // der Lead eine Zeile früher um (gemessen: Spalte 496px statt 542px).
      container: 'lg:grid-cols-[1.05fr_0.95fr]',
      wrapper: 'max-w-none',
      title: 'leading-[1.03] tracking-[-0.025em]',
    }"
  >
    <template #top>
      <!-- die puka: warmes Licht bricht durch die Wolken (leichter Parallax) -->
      <div class="hero-puka puka-glow" data-parallax="0.12" aria-hidden="true" />
    </template>

    <template #headline>
      <p class="mkt-kicker">{{ t('marketing.hero.eyebrow') }}</p>
    </template>

    <!--
      Der `#footer`-Slot statt der `links`-Eigenschaft, weil die Vertrauens-
      Zeile UNTER den Knöpfen steht: zwischen `footer` und dem Ende des
      Textblocks gibt es keinen weiteren Slot, und `#body` läge davor. Die
      Knopf-Liste bleibt trotzdem Daten (`links`), nicht handgeschriebenes
      Markup.
    -->
    <template #footer>
      <div class="flex flex-wrap gap-3.5">
        <UButton v-for="link in links" :key="link.label" size="xl" v-bind="link" />
      </div>

      <!--
        Vertrauens-Zeile = dieselbe Bauform wie die Häkchen-Listen der
        Unterseiten (UPageFeature: Icon + Zeile), nur waagerecht umbrechend
        statt gestapelt. Ein eigener Bauklotz war sie im Bestand nur, weil es
        die Bauform noch nicht gab; `title` ist ein <div>, die vier Zeilen
        stören die Überschriften-Gliederung also nicht.
      -->
      <ul class="mt-7 flex flex-wrap gap-x-6 gap-y-2.5">
        <UPageFeature
          v-for="item in trust" :key="item.label"
          as="li" :icon="item.icon" :title="item.label"
          :ui="{
            root: 'items-center gap-1.5',
            leading: 'p-0',
            leadingIcon: 'size-[1.05rem] text-primary-600',
            title: 'text-[0.9rem] font-medium text-toned',
          }"
        />
      </ul>
    </template>

    <!-- Produkt-Visual: eine abstrahierte Community-Heimat (Feed · Kurs ·
         Event) — bewusst KEIN erfundener Screenshot, sondern eine ruhige
         Andeutung der Bausteine. Zweite Rasterspalte = Standard-Slot. -->
    <div class="hero-visual" aria-hidden="true">
      <div class="mock">
        <div class="mock-bar">
          <PukaMark :size="18" />
          <span class="mock-name">deine-community</span>
        </div>
        <div class="mock-body">
          <div class="mock-card mock-post">
            <div class="mock-avatar" />
            <div class="mock-lines"><span /><span class="short" /></div>
          </div>
          <div class="mock-card mock-course">
            <div class="mock-thumb" />
            <div class="mock-lines"><span class="mid" /><span class="short" /></div>
          </div>
          <div class="mock-card mock-event">
            <div class="mock-date"><b>24</b><small>JUL</small></div>
            <div class="mock-lines"><span class="mid" /><span class="short" /></div>
          </div>
        </div>
      </div>
    </div>

    <template #bottom>
      <p class="relative pb-[clamp(3rem,6vw,5rem)] pt-14 text-center text-[1.05rem] italic text-primary-600">
        {{ t('marketing.hero.refrain') }}
      </p>
    </template>
  </UPageHero>
</template>

<style scoped>
/* Nur noch das BILDMOTIV: der Lichtkreis und das Produkt-Mock. Rhythmus,
   Breite und Typografie des Heros kommen aus dem `pageHero`-Vertrag. */
.hero-puka {
  top: -14rem;
  right: -10rem;
  width: 38rem;
  height: 38rem;
  opacity: 0.75;
}

/* Produkt-Mock (abstrakt, on-brand) */
.hero-visual { display: flex; justify-content: center; }
.mock {
  width: min(100%, 26rem);
  border-radius: 1.1rem;
  background: hsl(var(--puka-paper) / 0.7);
  border: 1px solid var(--puka-card-edge);
  /* Der Schlagschatten bleibt SCHWARZ und folgt nicht --puka-ink: im Dunkeln
     ist --puka-ink hell, ein „Schatten" daraus wäre ein Leuchten. */
  box-shadow: 0 24px 60px -28px hsl(220 40% 4% / 0.5);
  overflow: hidden;
  backdrop-filter: blur(4px);
}
.mock-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--puka-card-edge);
  background: hsl(var(--puka-cloud) / 0.6);
}
.mock-name { font-size: 0.85rem; font-weight: 600; color: hsl(var(--puka-ink-soft)); }
.mock-body { display: flex; flex-direction: column; gap: 0.7rem; padding: 0.9rem; }
.mock-card {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.7rem;
  border-radius: 0.7rem;
  background: hsl(var(--puka-cloud) / 0.75);
}
.mock-avatar {
  width: 2rem; height: 2rem; border-radius: 50%;
  background: linear-gradient(135deg, hsl(var(--puka-sun)), hsl(var(--puka-sun-deep)));
  flex: none;
}
.mock-thumb {
  width: 3rem; height: 2.1rem; border-radius: 0.4rem;
  background: linear-gradient(135deg, hsl(var(--puka-thumb)), hsl(var(--puka-sky)));
  flex: none;
}
.mock-date {
  width: 2.3rem; height: 2.3rem; border-radius: 0.5rem; flex: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: hsl(var(--puka-dawn)); color: hsl(var(--puka-sun-deep));
  line-height: 1;
}
.mock-date b { font-size: 0.95rem; }
.mock-date small { font-size: 0.55rem; letter-spacing: 0.05em; }
.mock-lines { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
.mock-lines span {
  height: 0.5rem; border-radius: 0.25rem;
  background: hsl(var(--puka-ink) / 0.13);
}
.mock-lines span.mid { width: 80%; }
.mock-lines span.short { width: 52%; }
</style>
