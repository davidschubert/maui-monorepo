/**
 * Admin-Erkennung über Appwrite User Labels. Das Label 'admin' wird NIE
 * über die App vergeben (Privilegien-Eskalation) — der erste Admin wird
 * in der Console bzw. per direktem API-Key-Call markiert.
 */
export function isAdminUser(user: { labels?: string[] } | null | undefined): boolean {
  return user?.labels?.includes('admin') ?? false
}
