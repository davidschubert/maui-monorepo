<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { COMMUNITY_ROLES, type CommunityRole } from '../../../../../core/shared/communityAuthz'
import type { CommunityInviteView, CommunityMemberView, CommunityTeamResponse } from '../../../../../control/shared/communityTeam'

/**
 * Mitglieder-Verwaltung EINER Community (Audit-Befund S9: `team.manage` war eine
 * tote Capability — Rolle vorhanden, Einstieg nirgends). Hier ist der Einstieg.
 *
 * Seit F51 (2026-08-07) ein REITER des Community-Hubs
 * (/dashboard/community/members) statt eines eigenen Menüpunkts im Hauptmenü.
 * Sie rendert deshalb kein eigenes UDashboardPanel mehr —
 * Panel, Kopfzeile und Reiter-Zeile bringt die Hülle mit
 * (packages/admin/app/pages/dashboard/community.vue).
 *
 * Vier Handgriffe, alle auf dieser Seite: einladen, Rolle ändern, Zugang
 * entziehen, Besitz übertragen. Die Community LÖSCHEN gehört bewusst NICHT
 * hierher, sondern in die Gefahrenzone auf dem Reiter „Allgemein"
 * (/dashboard/community, C16, 2026-07-31): hier verwaltet man das Team, dort
 * die Community selbst.
 * Und „löschen" heißt dort stilllegen + Zugänge entziehen, Inhalte bleiben —
 * die Begründung steht bei `decideCommunityDeletion`.
 *
 * ZWEI ANSICHTEN (Davids Entscheidung 2 vom 2026-07-29): seit Mitgliedschaft ein
 * Ereignis ist (A5), steht hier JEDES Mitglied — auch die vielen, die nur
 * mitlesen und kommentieren. Damit die Seite trotzdem das beantwortet, weswegen
 * man sie öffnet („wer darf hier was?"), zeigt sie zuerst das TEAM
 * (owner/admin/moderator/editor) und auf einen Klick alle. Die Zahl im Titel
 * bleibt die WAHRE Gesamtzahl — eine gefilterte Ansicht darf nicht aussehen wie
 * eine kleine Community.
 *
 * Die AUTORITÄT liegt in den Routen (`await requireCommunityPermission`) und im
 * Control Plane, das jede Regel noch einmal selbst prüft. Was hier ausgegraut
 * ist, ist Freundlichkeit — keine Grenze.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t } = useI18n()
const { formatDate } = useFormatDate()
const { formatRelativeTime } = useFormatRelativeTime()
const toast = useToast()
const confirm = useConfirm()

useHead({ title: () => t('members.title') })

/** Besitz übertragen ist eine OWNER-Sache (community.transfer), nicht team.manage. */
const canTransfer = useCommunityCapability('community.transfer')

const { data, refresh, status } = await useFetch<CommunityTeamResponse>('/api/community/members')

const members = computed<CommunityMemberView[]>(() => data.value?.members ?? [])
const invites = computed<CommunityInviteView[]>(() => data.value?.invites ?? [])

// ── Suche + Sortierung (im Browser: ein Team hat Dutzende Zeilen, keine
// Tausende — eine Server-Pagination wäre hier Zeremonie ohne Nutzen) ─────────
const search = ref('')
const { sortField, sortDir, toggle } = useTableSort('joinedAt', 'asc')

/**
 * Team = alle Rollen MIT Verwaltungs-/Redaktionsauftrag. `viewer` ist bewusst
 * nicht dabei: das ist die Rolle, mit der man beitritt (COMMUNITY_JOIN_ROLE), und
 * genau die macht die Liste lang.
 */
const TEAM_ROLES: CommunityRole[] = ['owner', 'admin', 'moderator', 'editor']
const scope = ref<'team' | 'all'>('team')
const teamCount = computed(() => members.value.filter(member => TEAM_ROLES.includes(member.role)).length)

const scopeItems = computed(() => [
  { value: 'team' as const, label: t('members.scope.team', { n: teamCount.value }) },
  { value: 'all' as const, label: t('members.scope.all', { n: members.value.length }) },
])

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  // Die Suche geht IMMER über alle: wer einen Namen eintippt, will ihn finden und
  // nicht erst begreifen, dass er in der falschen Ansicht steht.
  const base = needle || scope.value === 'all'
    ? members.value
    : members.value.filter(member => TEAM_ROLES.includes(member.role))
  const rows = needle
    ? base.filter(member =>
        member.email.toLowerCase().includes(needle) || member.name.toLowerCase().includes(needle))
    : [...base]

  const factor = sortDir.value === 'asc' ? 1 : -1
  return rows.sort((a, b) => {
    if (sortField.value === 'role') return factor * a.role.localeCompare(b.role)
    if (sortField.value === 'status') return factor * a.status.localeCompare(b.status)
    if (sortField.value === 'name') return factor * (a.name || a.email).localeCompare(b.name || b.email)
    return factor * (Date.parse(a.joinedAt) - Date.parse(b.joinedAt))
  })
})

const hasActiveFilter = computed(() => search.value.trim() !== '')
function resetFilters() {
  search.value = ''
}

// Spalten als computed-freie Konstante mit i18n-Kopfzeilen; die #…-header-Slots
// überschreiben sie mit SortableHeader (Muster der Nutzerliste).
const columns: TableColumn<CommunityMemberView>[] = [
  { accessorKey: 'name', header: () => t('members.name') },
  { accessorKey: 'role', header: () => t('members.role') },
  { accessorKey: 'joinedAt', header: () => t('members.joined'), id: 'joinedAt' },
  { accessorKey: 'status', header: () => t('members.status') },
  { id: 'actions', header: () => '' },
]

const inviteColumns: TableColumn<CommunityInviteView>[] = [
  { accessorKey: 'email', header: () => t('members.invites.email') },
  { accessorKey: 'role', header: () => t('members.invites.role') },
  { accessorKey: 'expiresAt', header: () => t('members.invites.expires') },
  { id: 'actions', header: () => '' },
]

const roleLabel = (role: CommunityRole) => t(`members.roles.${role}`)
const ROLE_COLOR: Record<CommunityRole, 'primary' | 'info' | 'warning' | 'neutral'> = {
  owner: 'primary',
  admin: 'info',
  moderator: 'warning',
  editor: 'neutral',
  viewer: 'neutral',
}

/**
 * Die Regel-Codes des Control Plane in Sätze übersetzen. Ohne diese Zuordnung
 * stünde bei jeder abgelehnten Regel „Aktion fehlgeschlagen" — und niemand
 * wüsste, dass er gerade den letzten Owner retten wollte.
 */
function ruleMessage(error: unknown): { title: string, description?: string } {
  // `data.reason` ist das Feld des stabilen Fehler-Envelopes (core
  // shared/types/error.ts) — die rohe `data` eines Fehlers wirft der zentrale
  // Handler bewusst weg, genau EIN geprüfter Grund reist mit.
  const reason = (error as { data?: { reason?: string } })?.data?.reason
  const known = ['self_demote', 'self_remove', 'last_owner', 'owner_protected', 'already_member', 'not_a_member', 'invalid_role', 'unchanged']
  // Die benannten Regeln sagen den nächsten Schritt schon im Satz. Nur der
  // Rückfall stand nackt da — der bekommt eine zweite Zeile (Audit-Befund C12).
  if (reason && known.includes(reason)) return { title: t(`members.errors.${reason}`) }
  return { title: t('members.errors.failed'), description: t('members.errors.failedHint') }
}

// ── Einladen ────────────────────────────────────────────────────────────────
const inviteOpen = ref(false)
const inviteBusy = ref(false)
const inviteForm = reactive({ email: '', role: 'viewer' as CommunityRole })

/** 'owner' wird nie eingeladen — Besitz entsteht durch Gründung oder Übergabe. */
const invitableRoles: CommunityRole[] = COMMUNITY_ROLES.filter(role => role !== 'owner')
// Der Typ steht ABSICHTLICH dran: ohne ihn leitet USelect sein Model aus den
// Items ab (also ohne 'owner') und passt dann nicht mehr zu `inviteForm.role`.
const roleItems = computed<{ label: string, value: CommunityRole }[]>(
  () => invitableRoles.map(role => ({ label: roleLabel(role), value: role })),
)

function openInvite() {
  inviteForm.email = ''
  inviteForm.role = 'viewer'
  inviteOpen.value = true
}

async function sendInvite() {
  inviteBusy.value = true
  try {
    const result = await $fetch<{ email: string, existingAccount: boolean }>('/api/community/members', {
      method: 'POST',
      body: { email: inviteForm.email.trim(), role: inviteForm.role },
    })
    toast.add({
      title: result.existingAccount
        ? t('members.invite.sentExisting', { email: result.email })
        : t('members.invite.sent', { email: result.email }),
      // Die Frist steht sonst nirgends im Blickfeld — und sie ist der Grund,
      // warum eine Einladung später „nicht mehr gilt".
      description: t('members.invite.sentHint'),
      color: 'success',
    })
    inviteOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ ...ruleMessage(error), color: 'error' })
  }
  finally {
    inviteBusy.value = false
  }
}

async function revokeInvite(invite: CommunityInviteView) {
  try {
    const ok = await confirm({
      title: t('members.revoke.title'),
      description: t('members.revoke.text', { email: invite.email }),
      confirmLabel: t('members.revoke.confirm'),
      action: () => $fetch(`/api/community/invites/${invite.id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('members.revoke.done'), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ ...ruleMessage(error), color: 'error' })
  }
}

// ── Rolle ändern / entfernen / übertragen ───────────────────────────────────
async function changeRole(member: CommunityMemberView, role: CommunityRole) {
  try {
    await $fetch(`/api/community/members/${member.id}`, { method: 'PATCH', body: { role } })
    toast.add({ title: t('members.roleChange.done', { role: roleLabel(role) }), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ ...ruleMessage(error), color: 'error' })
  }
}

async function removeMember(member: CommunityMemberView) {
  try {
    const ok = await confirm({
      title: t('members.remove.title', { name: member.name || member.email }),
      // Der Satz sagt AUSDRÜCKLICH, was bleibt. „Entfernen" liest sich sonst wie
      // „löschen", und niemand traut sich, den Knopf zu drücken.
      description: t('members.remove.text'),
      confirmLabel: t('members.remove.confirm'),
      action: () => $fetch(`/api/community/members/${member.id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('members.remove.done'), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ ...ruleMessage(error), color: 'error' })
  }
}

async function transferOwnership(member: CommunityMemberView) {
  try {
    const ok = await confirm({
      title: t('members.transfer.title', { name: member.name || member.email }),
      description: t('members.transfer.text'),
      confirmLabel: t('members.transfer.confirm'),
      color: 'warning',
      action: () => $fetch(`/api/community/members/${member.id}/transfer`, { method: 'POST' }),
    })
    if (!ok) return
    toast.add({ title: t('members.transfer.done'), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ ...ruleMessage(error), color: 'error' })
  }
}

function rowActions(member: CommunityMemberView): DropdownMenuItem[][] {
  // Ehemalige haben keine Aktionen: sie kommen über eine neue Einladung zurück,
  // nicht über ein Rollen-Menü (die Row trägt bewusst keinen Zugang mehr).
  if (member.status !== 'active') {
    return [[{ label: t('members.actions.reinvite'), icon: 'i-ph-envelope-simple', onSelect: () => {
      inviteForm.email = member.email
      inviteForm.role = 'viewer'
      inviteOpen.value = true
    } }]]
  }

  const groups: DropdownMenuItem[][] = [[
    {
      label: t('members.actions.changeRole'),
      icon: 'i-ph-shield-star',
      // Selbst-Degradieren und Owner-Antasten lehnt der Server ab; hier gar
      // nicht anzubieten erspart den Fehlversuch.
      disabled: member.self || (member.role === 'owner' && !canTransfer.value),
      children: invitableRoles
        .filter(role => role !== member.role)
        .map(role => ({ label: roleLabel(role), onSelect: () => { void changeRole(member, role) } })),
    },
  ]]

  if (canTransfer.value && !member.self && member.role !== 'owner') {
    groups.push([{
      label: t('members.actions.transfer'),
      icon: 'i-ph-crown-simple',
      onSelect: () => { void transferOwnership(member) },
    }])
  }

  groups.push([{
    label: t('members.actions.remove'),
    icon: 'i-ph-user-minus',
    color: 'error',
    disabled: member.self,
    onSelect: () => { void removeMember(member) },
  }])

  return groups
}
</script>

<template>
  <!-- Kind der Community-Hülle (F51): Karten + Tabelle, kein eigenes
       UDashboardPanel. Kopfzeile und Reiter-Zeile bringt die Hülle mit; der
       Einladen-Knopf sitzt deshalb in der Werkzeug-Reihe über der Liste
       statt in einer Navbar, die es hier nicht mehr gibt. -->
  <div class="flex w-full flex-col">
    <p class="mb-4 max-w-2xl text-sm text-muted">{{ t('members.description') }}</p>

    <!-- Offene Einladungen zuerst: sie sind der Zustand, der auf eine Antwort
         wartet — und der einzige, den man widerrufen kann. -->
    <UPageCard
      v-if="invites.length > 0"
      :title="t('members.invites.title')"
      :description="t('members.invites.description')"
      variant="subtle"
      class="mb-6"
    >
      <UTable :data="invites" :columns="inviteColumns" data-invites-table>
        <template #role-cell="{ row }">
          <UBadge :color="ROLE_COLOR[row.original.role]" variant="subtle">{{ roleLabel(row.original.role) }}</UBadge>
        </template>
        <template #expiresAt-cell="{ row }">
          <span :title="formatDate(row.original.expiresAt)">{{ formatRelativeTime(row.original.expiresAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-ph-x"
              :aria-label="t('members.revoke.confirm')"
              :data-invite-revoke="row.original.id"
              @click="revokeInvite(row.original)"
            />
          </div>
        </template>
      </UTable>
    </UPageCard>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <form class="flex min-w-64 flex-1 gap-2" @submit.prevent>
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          :placeholder="t('members.searchPlaceholder')"
          class="flex-1"
          data-members-search
        />
      </form>

      <!-- Team zuerst, alle auf einen Klick. Kein Dropdown: es sind zwei
           Zustände, und beide sollen sichtbar sein — samt Anzahl, damit man
           weiß, was der andere Klick bringt. -->
      <UButtonGroup size="sm" data-members-scope>
        <UButton
          v-for="item in scopeItems"
          :key="item.value"
          :color="scope === item.value ? 'primary' : 'neutral'"
          :variant="scope === item.value ? 'solid' : 'outline'"
          :data-members-scope-option="item.value"
          @click="scope = item.value"
        >
          {{ item.label }}
        </UButton>
      </UButtonGroup>

      <!-- Der Einladen-Knopf saß bis F51 in der Navbar dieser Seite. Die gibt
           es als Reiter der Community-Hülle nicht mehr (dort steht der Titel
           der Hülle), also steht die Haupthandlung jetzt in der Werkzeug-Reihe
           direkt über der Liste, auf die sie wirkt. -->
      <UButton icon="i-ph-user-plus" size="sm" data-invite-open @click="openInvite">
        {{ t('members.invite.cta') }}
      </UButton>
    </div>

    <UTable :data="filtered" :columns="columns" :loading="status === 'pending'" data-members-table>
      <template #name-header>
        <SortableHeader :label="t('members.name')" field="name" :active="sortField" :dir="sortDir" @toggle="toggle" />
      </template>
      <template #role-header>
        <SortableHeader :label="t('members.role')" field="role" :active="sortField" :dir="sortDir" @toggle="toggle" />
      </template>
      <template #joinedAt-header>
        <SortableHeader :label="t('members.joined')" field="joinedAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
      </template>
      <template #status-header>
        <SortableHeader :label="t('members.status')" field="status" :active="sortField" :dir="sortDir" @toggle="toggle" />
      </template>

      <template #name-cell="{ row }">
        <div class="flex items-center gap-2">
          <UserAvatar :user="{ name: row.original.name || row.original.email, email: row.original.email }" size="xs" />
          <div class="min-w-0">
            <p class="truncate font-medium text-default">
              {{ row.original.name || row.original.email }}
              <span v-if="row.original.self" class="text-muted">· {{ t('members.you') }}</span>
            </p>
            <p v-if="row.original.name" class="truncate text-xs text-muted">{{ row.original.email }}</p>
          </div>
        </div>
      </template>
      <template #role-cell="{ row }">
        <UBadge :color="ROLE_COLOR[row.original.role]" variant="subtle">{{ roleLabel(row.original.role) }}</UBadge>
      </template>
      <template #joinedAt-cell="{ row }">
        <span :title="formatDate(row.original.joinedAt)">{{ formatRelativeTime(row.original.joinedAt) }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge v-if="row.original.status === 'active'" color="success" variant="subtle">
          {{ t('members.statusValues.active') }}
        </UBadge>
        <UBadge
          v-else
          color="neutral"
          variant="subtle"
          icon="i-ph-user-minus"
          :title="row.original.removedAt ? formatDate(row.original.removedAt) : undefined"
        >
          {{ t('members.statusValues.removed') }}
        </UBadge>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
            <UButton
              icon="i-ph-dots-three-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('members.rowActions')"
              :data-member-actions="row.original.id"
            />
          </UDropdownMenu>
        </div>
      </template>

      <!--
        Zwei Leerzustände (Muster der Nutzerliste, Audit-Befund C11): „Suche
        ohne Treffer" verlangt Zurücksetzen, „noch niemand da" verlangt eine
        Einladung. Die Mitgliederliste ist nie WIRKLICH leer — man selbst steht
        drin —, deshalb heißt der zweite Zustand „nur du".
      -->
      <template #empty>
        <CoreEmptyState
          v-if="hasActiveFilter"
          icon="i-ph-funnel"
          :title="t('ui.empty.noResultsTitle')"
          :description="t('ui.empty.noResultsText')"
          :action-label="t('ui.empty.resetFilters')"
          action-icon="i-ph-arrow-counter-clockwise"
          @action="resetFilters"
        />
        <CoreEmptyState
          v-else
          icon="i-ph-users-three"
          :title="t('members.emptyTitle')"
          :description="t('members.emptyText')"
          :action-label="t('members.invite.cta')"
          action-icon="i-ph-user-plus"
          @action="openInvite"
        />
      </template>
    </UTable>

    <UModal v-model:open="inviteOpen" :title="t('members.invite.title')" :description="t('members.invite.description')">
      <template #body>
        <form class="space-y-4" data-invite-form @submit.prevent="sendInvite">
          <UFormField :label="t('members.invite.emailLabel')" :help="t('members.invite.emailHelp')" required>
            <UInput v-model="inviteForm.email" type="email" class="w-full" :maxlength="254" data-invite-email />
          </UFormField>
          <UFormField :label="t('members.invite.roleLabel')" :help="t(`members.roleHelp.${inviteForm.role}`)" required>
            <USelect v-model="inviteForm.role" :items="roleItems" class="w-full" data-invite-role />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" @click="() => { inviteOpen = false }">{{ t('ui.cancel') }}</UButton>
            <UButton type="submit" :loading="inviteBusy" :disabled="!inviteForm.email.trim()" data-invite-submit>
              {{ t('members.invite.submit') }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
