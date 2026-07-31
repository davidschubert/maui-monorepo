/**
 * Das Vorschaubild DIESER Seite für geteilte Links (og:image) — der VERTRAG
 * zwischen dem Layer, der das Bild kennt, und dem Kopf, der es schreibt.
 *
 * Warum ein State und kein direkter Aufruf: `useLocaleSeoHead()` ist der
 * einzige Ort, an dem canonical/hreflang/og:url entstehen (CLAUDE.md), und
 * genau dorthin gehört og:image — sonst setzt es irgendwann jede Seite selbst
 * und die absoluten URLs laufen wieder auseinander (Audit-Befund B1). Der Kopf
 * liegt aber im CORE, und wie das Bild einer Community aussieht, weiß der
 * themes-Layer (Farbe, Name, Bildmarke). Fundament-Layer dürfen NIE von
 * Features abhängen (CONCEPT.md A14) — also sagt der Feature-Layer dem Kern
 * über diesen State, WAS zu verlinken ist, und der Kern entscheidet, WIE
 * (absolute URL auf dem richtigen Host, Maße, twitter:card).
 *
 * `null` = kein Vorschaubild (Core-Default). Silo-Apps und alle Apps ohne
 * Bildmarken-Route bleiben damit unverändert ohne og:image.
 */
export interface BrandOgImage {
  /** Pfad auf DIESEM Host, z. B. '/og/1a2b3c4.png' — absolut macht ihn der Kopf. */
  path: string
  /** Maße in Pixeln; Vorschau-Dienste reservieren daran den Platz, bevor das Bild da ist. */
  width: number
  height: number
  /** MIME-Typ — Facebook/WhatsApp/LinkedIn zeigen KEIN SVG, also nie image/svg+xml. */
  type: string
}

export function useBrandOgImage() {
  return useState<BrandOgImage | null>('pukalani-brand-og-image', () => null)
}
