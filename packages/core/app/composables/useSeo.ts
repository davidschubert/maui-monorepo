export interface SeoOptions {
  title?: string
  description?: string
  /** Absolute URL — OG-Image braucht eine volle URL */
  image?: string
}

/**
 * SEO-Defaults: setzt Title/Description einmal und spiegelt sie in
 * OG- und Twitter-Tags. Apps rufen es pro Page mit ihren Werten auf.
 */
export function useSeo(options: SeoOptions = {}) {
  useSeoMeta({
    title: options.title,
    description: options.description,
    ogTitle: options.title,
    ogDescription: options.description,
    ogImage: options.image,
    twitterCard: 'summary_large_image',
    twitterTitle: options.title,
    twitterDescription: options.description,
    twitterImage: options.image,
  })
}
