import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * The four persistent destinations, shown in the bottom bar.
 *
 * Material's guidance is a navigation bar for "three to five destinations of
 * equal importance". Groups is the fourth and only renders while
 * GROUPS_ENABLED is on, so the bar shows three until that flips rather than
 * advertising a tab that opens nothing.
 */
export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  GroupList: undefined;
  Account: { requireName?: boolean } | undefined;
};

/**
 * Everything above the tabs. A split in progress, and any screen pushed from
 * a tab, covers the bar completely — you should not be able to tab away from
 * a half-assigned receipt, and the flow has its own back affordances.
 */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Capture: { openGalleryOnMount?: boolean } | undefined;
  ExtractedItems: undefined;
  ExtractionFailed: undefined;
  ManualEntry: undefined;
  ItemAssignment: undefined;
  FinalSplit: undefined;
  HistoryDetail: { entryId: string };
  EmailEntry: undefined;
  OtpVerify: { email: string };
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
  ExpenseDetail: { groupId: string; expenseId: string };
  ExpenseEdit: { groupId: string; expenseId: string };
  InviteMember: { groupId: string };
  SettleUp: { groupId: string };
};
