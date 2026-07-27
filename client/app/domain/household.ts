export type Household = {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
};

export type HouseholdMemberStatus = 'pending' | 'active' | 'removed';

/**
 * A household member can exist before they have an account — invited by
 * phone, `userId` stays null until they sign up (status 'pending'). Every
 * expense/settlement references a member's `id`, never `userId` directly,
 * so a pending member can already hold a real balance.
 */
export type HouseholdMember = {
  id: string;
  phoneE164: string;
  displayName: string;
  status: HouseholdMemberStatus;
  userId: string | null;
};
