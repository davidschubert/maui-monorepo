/**
 * Icon-Zuordnung für Appwrite-Client-Metadaten (Sessions, Aktivitäts-Logs):
 * Browser/OS/Gerät aus dem User-Agent-Parsing, Länderflaggen aus dem ISO-Code
 * (circle-flags-Collection). Geteilt von SessionsTable + Admin-User-Detail.
 */

export function browserIcon(clientName: string): string {
  return clientName.toLowerCase().includes('chrome') ? 'i-ph-google-chrome-logo' : 'i-ph-browser'
}

export function osIcon(osName: string): string {
  const os = osName.toLowerCase()
  if (os.includes('mac') || os.includes('os x') || os.includes('ios')) return 'i-ph-apple-logo'
  if (os.includes('windows')) return 'i-ph-windows-logo'
  if (os.includes('android')) return 'i-ph-android-logo'
  if (os.includes('linux') || os.includes('ubuntu') || os.includes('debian')) return 'i-ph-linux-logo'
  return 'i-ph-desktop'
}

export function deviceIcon(deviceName: string): string {
  const device = deviceName.toLowerCase()
  if (device.includes('smartphone') || device.includes('phone') || device.includes('mobile')) return 'i-ph-device-mobile'
  if (device.includes('tablet')) return 'i-ph-device-tablet'
  return 'i-ph-desktop-tower'
}

/** Flaggen-Icon aus dem ISO-Ländercode, Fallback: Globus */
export function flagIcon(countryCode: string): string {
  return countryCode ? `i-circle-flags-${countryCode.toLowerCase()}` : 'i-ph-globe-hemisphere-west'
}

/** Icon je Benachrichtigungskanal (Appwrite-Target providerType) */
export function targetIcon(providerType: string): string {
  if (providerType === 'sms') return 'i-ph-chat-text'
  if (providerType === 'push') return 'i-ph-bell-ringing'
  return 'i-ph-envelope-simple'
}
