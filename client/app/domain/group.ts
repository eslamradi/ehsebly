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
  // "Admin" has no dedicated role — the group's creator is its one,
  // permanent admin (2026-07-30 decision; mirrors authMiddleware.ts's
  // requireGroupAdmin server-side). Compare against useAccount().account.userId.
  createdByUserId: string;
};

export type GroupMemberStatus = 'pending' | 'active' | 'removed';

/**
 * A group member can exist before they have an account — invited by email,
 * `userId` stays null until they sign up (status 'pending'). Every
 * expense/settlement references a member's `id`, never `userId` directly,
 * so a pending member can already hold a real balance.
 */
export type GroupMember = {
  id: string;
  email: string;
  displayName: string;
  status: GroupMemberStatus;
  userId: string | null;
};
