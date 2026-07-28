import CoreConfirmDialog from '../components/core/ConfirmDialog.vue'

/**
 * EIN Vertrag für destruktive Aktionen (Audit-Befund C10).
 *
 * Vorher standen vier Verhalten nebeneinander: handgebaute UModal-Dialoge,
 * natives window.confirm(), gar keine Rückfrage — und Bestätigen-Knöpfe ohne
 * :loading, die sich doppelt klicken ließen. Ab jetzt gibt es genau EINEN Weg:
 *
 *   const confirm = useConfirm()
 *   const ok = await confirm({
 *     title: t('…confirmTitle'),
 *     description: t('…confirmText'),
 *     confirmLabel: t('…delete'),
 *     action: () => $fetch(`/api/…/${id}`, { method: 'DELETE' }),
 *   })
 *   if (!ok) return
 *
 * `action` ist der Doppelklick-Schutz: solange sie läuft, ist der Dialog offen,
 * der Bestätigen-Knopf zeigt :loading und ist gesperrt, Abbrechen/ESC/Backdrop
 * sind blockiert. Ohne `action` schließt der Dialog sofort und liefert `true`.
 *
 * Fehler aus `action` wirft confirm() weiter (Dialog schließt vorher) — der
 * Aufrufer toastet wie bisher in seinem catch.
 */
export interface ConfirmOptions {
  /** Kurzer Titel, z. B. „Kommentar löschen?" */
  title: string
  /** EIN Satz Folgen-Erklärung */
  description?: string
  /** Beschriftung des Bestätigen-Knopfes (Default: „Bestätigen") */
  confirmLabel?: string
  /** Farbe des Bestätigen-Knopfes (Default: error) */
  color?: 'error' | 'warning' | 'primary' | 'neutral'
  /**
   * Kontextabhängige Zusatz-Warnung im Dialog (z. B. „Datei hängt noch an
   * einem Benutzer") — bewusst erhalten, nicht wegvereinheitlicht.
   */
  warning?: { title: string, description?: string }
  /** Die destruktive Aktion selbst — läuft mit :loading im Dialog */
  action?: () => unknown | Promise<unknown>
}

/** Interne Rückgabe des Dialogs an useConfirm() */
export interface ConfirmResult {
  ok: boolean
  error?: unknown
}

export function useConfirm() {
  const overlay = useOverlay()

  return async function confirm(options: ConfirmOptions): Promise<boolean> {
    const modal = overlay.create(CoreConfirmDialog, { props: options, destroyOnClose: true })
    const result = await modal.open().result as ConfirmResult | undefined
    if (result?.error !== undefined) throw result.error
    return result?.ok === true
  }
}
