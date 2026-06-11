/**
 * ⛔ TOMBSTONE (Phase 12): Migration 001 ist durch 002-target-architecture
 * ERSETZT. Ein erneuter Lauf würde die alten postId/text-Spalten auf die
 * neue targetId/targetType-Table schreiben und das Schema korrumpieren.
 *
 * Das Original (comments-Table mit postId-Schema, Phase 10) liegt in der
 * Git-Historie. Schema-Prüfung: scripts/migrations/verify-schema.ts
 */
console.error('⛔ Migration 001 ist durch 002-target-architecture ersetzt — Ausführung gesperrt (würde Alt-Spalten anlegen).')
process.exit(1)
