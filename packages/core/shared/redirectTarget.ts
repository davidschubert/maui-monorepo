/**
 * Wohin nach der Anmeldung? (`?redirect=`)
 *
 * Anlass (2026-07-25): der Direktlink in der Einladungs-Mail ist
 * `https://start.pukalani.app?code=MAUI-…`. Der Eingeladene ist dabei
 * naturgemäß NICHT angemeldet — ohne diesen Mechanismus schickt ihn der
 * Auth-Guard zur Anmeldung und der Code ist weg. Die Mail verspricht dann
 * „direkt loslegen" und hält es nicht.
 *
 * SICHERHEIT: ein `?redirect=` ist die klassische Open-Redirect-Lücke —
 * `…/login?redirect=https://phishing.example` mit unserer Domain im Link.
 * Deshalb wird NUR ein Pfad auf DIESEM Host akzeptiert. Alles andere fällt
 * still auf `null` zurück (der Aufrufer nimmt dann sein Standardziel).
 */

/** PURE (unit-getestet). */
export function safeRedirectTarget(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  // Muss ein absoluter Pfad auf diesem Host sein.
  if (!value.startsWith('/')) return null
  // `//host` ist protokollrelativ und zeigt nach AUSSEN — sieht aus wie ein
  // Pfad, ist aber eine fremde Domain.
  if (value.startsWith('//')) return null
  // `/\evil.example` wird von manchen Browsern wie `//` behandelt.
  if (value.startsWith('/\\')) return null
  // Steuerzeichen (auch kodiert eingeschmuggelt) haben in einem Ziel nichts zu
  // suchen — und `\n` erlaubt Header-Spielereien.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return null

  // Keine Endlosschleife: zurück auf eine Anmeldeseite zu schicken hilft
  // niemandem.
  const path = value.split(/[?#]/)[0] ?? ''
  const withoutLocale = path.replace(/^\/(de|en)(?=\/|$)/, '') || '/'
  if (/^\/(login|register|forgot-password|reset-password)(\/|$)/.test(withoutLocale)) return null

  return value
}
