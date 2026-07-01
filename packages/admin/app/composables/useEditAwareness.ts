/**
 * Edit-Awareness für geteilte Formulare (z.B. Config, Changelog): solange die
 * Seite offen ist, trägt die eigene Presence (Appwrite Presences API) die action
 * `editing:<key>`. `editors` sind die ANDEREN, die dasselbe Formular offen haben
 * — als Banner "X bearbeitet dieses Formular ebenfalls", damit sich nicht zwei
 * Admins gegenseitig überschreiben. `others` schließt die eigene Presence aus.
 */
export function useEditAwareness(key: string) {
  const action = `editing:${key}`
  const state = usePresenceState()
  const { others } = usePresence(u => u.action === action)

  const editors = computed(() => others.value.map(u => u.userName))

  onMounted(() => state.setAction(action))
  onScopeDispose(() => state.setAction(undefined))

  return { editors }
}
