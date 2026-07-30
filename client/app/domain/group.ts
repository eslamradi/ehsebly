// A "group" covers both household splitting and group-trip splitting — the
// two need identical mechanics (member roster, payer per expense, weighted
// item assignments, settlements, running balance). `kind` distinguishes
// them for UI copy only.
export type GroupKind = 'household' | 'trip' | 'other';

export type Group = {
  id: string;
  name: string;
  kind: GroupKind;
  memberCount: number;
  createdAt: string;
};

export type GroupMemberStatus = 'pending' | 'active' | 'removed';

/**
 * A group member can exist before they have an account — invited by phone,
 * `userId` stays null until they sign up (status 'pending'). Every
 * expense/settlement references a member's `id`, never `userId` directly,
 * so a pending member can already hold a real balance.
 */
export type GroupMember = {
  id: string;
  phoneE164: string;
  displayName: string;
  status: GroupMemberStatus;
  userId: string | null;
};
