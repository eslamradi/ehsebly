// Wire-format (snake_case) shapes exchanged with the Worker's group API —
// kept separate from the domain types (domain/group.ts, domain/groupLedger.ts)
// the same way types.ts's ExtractionResult is kept separate from the
// Worker's snake_case response body.

export type RequestOtpResponse = { status: 'sent' } | { status: 'error'; message: string };

export type VerifyOtpResponse =
  | { status: 'ok'; token: string; user: { id: string; phone_e164: string; display_name: string | null } }
  | { status: 'error'; message: string };

export type GroupKindWire = 'household' | 'trip' | 'other';

export type GroupWire = { id: string; name: string; kind: GroupKindWire; created_by_user_id: string; created_at: string };

export type GroupMemberWire = {
  id: string;
  group_id: string;
  user_id: string | null;
  phone_e164: string;
  display_name: string;
  status: 'pending' | 'active' | 'removed';
  invited_by_user_id: string;
  joined_at: string | null;
  created_at: string;
};

export type CreateGroupResponse = { status: 'ok'; group: GroupWire } | { status: 'error'; message: string };
export type ListGroupsResponse =
  | { status: 'ok'; groups: Array<GroupWire & { member_count: number }>; pending_groups: Array<GroupWire & { member_count: number }> }
  | { status: 'error'; message: string };
export type GetGroupResponse = { status: 'ok'; group: GroupWire; members: GroupMemberWire[] } | { status: 'error'; message: string };
export type InviteMemberResponse = { status: 'ok'; member: GroupMemberWire } | { status: 'error'; message: string };
export type AcceptGroupInviteResponse = { status: 'ok'; member: GroupMemberWire } | { status: 'error'; message: string };

export type ExpenseItemWire = { id: string; name: string; price_piastres: number; quantity: number; is_shared: boolean };
export type ExpenseWire = {
  id: string;
  paid_by_member_id: string;
  description: string;
  subtotal_piastres: number;
  tax_piastres: number;
  service_piastres: number;
  other_service_piastres: number;
  total_piastres: number;
  printed_total_piastres: number | null;
  created_at: string;
  items: ExpenseItemWire[];
  // expense_item_id -> group_member_id -> weight
  assignments: Record<string, Record<string, number>>;
};
export type SettlementWire = {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_piastres: number;
  note: string | null;
  created_by_user_id: string;
  created_at: string;
};

export type ListExpensesResponse =
  | { status: 'ok'; members: GroupMemberWire[]; expenses: ExpenseWire[]; settlements: SettlementWire[] }
  | { status: 'error'; message: string };

export type SubmitExpenseBody = {
  description: string;
  paid_by_member_id: string;
  subtotal_piastres: number;
  tax_piastres: number;
  service_piastres: number;
  other_service_piastres: number;
  total_piastres: number;
  printed_total_piastres: number | null;
  // Sent so the Worker can recompute and verify tax_piastres/service_piastres/
  // other_service_piastres/total_piastres server-side instead of trusting
  // client arithmetic outright (Story 2.4 code review, 2026-07-30).
  tax_enabled: boolean;
  tax_rate_percent: number;
  service_enabled: boolean;
  service_rate_percent: number;
  other_service_enabled: boolean;
  other_service_rate_percent: number;
  items: Array<{ name: string; price_piastres: number; quantity: number; is_shared: boolean }>;
  // itemIndex -> group_member_id -> weight
  item_assignments: Record<number, Record<string, number>>;
};
export type SubmitExpenseResponse = { status: 'ok'; expense_id: string } | { status: 'error'; message: string };

export type RecordSettlementBody = { from_member_id: string; to_member_id: string; amount_piastres: number; note?: string };
export type RecordSettlementResponse = { status: 'ok'; settlement_id: string } | { status: 'error'; message: string };
