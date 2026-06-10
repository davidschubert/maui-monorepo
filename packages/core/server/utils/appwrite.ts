/**
 * Re-Export für Nitros server/utils Auto-Import: Feature Layer (comments,
 * admin, …) nutzen createSessionClient & Co. in ihren Server Routes OHNE
 * Cross-Package-Importpfade — Nitro scannt server/utils aller Layer.
 */
export {
  createAdminClient,
  createSessionClient,
  sessionCookieName,
  setSessionCookie,
  clearSessionCookie,
} from '../lib/appwrite'
