import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ExtractionResult } from '../api/types';
import type { TaxServiceSettings } from './splitCalculation';

export type { TaxServiceSettings };

export type Person = {
  name: string;
};

// itemIndex -> (personIndex -> weight, usually "how many units they had").
// Replaces the old itemIndex -> personIndex[] "assigned to, split evenly"
// shape. Weights don't need to sum to the item's quantity — equal weights
// (1 each) on a single shared item reproduce the original even split, while
// a multi-quantity item (e.g. 10 waters) can be split unevenly by however
// many units each person actually had — see splitItemAmongWeights.
export type ItemAssignments = Record<number, Record<number, number>>;

// Set only when this split is being logged against a Group (household/trip
// splitting) rather than saved as a one-off local History entry — see
// beginGroupExpense. `memberIdByPersonIndex` seeds `people` from the
// group's roster so ItemAssignmentScreen/ReviewScreen/FinalSplitScreen all
// keep operating on plain people/index-keyed itemAssignments, unaware
// anything group-related is happening; only FinalSplitScreen's save/submit
// branch reads `household` to decide where the finished split goes.
export type GroupExpenseContext = {
  groupId: string;
  memberIdByPersonIndex: Record<number, string>;
  paidByMemberId: string | null;
};

export type SplitSession = {
  photoUris: string[];
  extractionResult: ExtractionResult | null;
  taxService: TaxServiceSettings | null;
  people: Person[];
  itemAssignments: ItemAssignments;
  group: GroupExpenseContext | null;
};

type SplitSessionContextValue = {
  session: SplitSession;
  // Commits the whole confirmed batch atomically — mirrors the old
  // single-photo `setPhoto`, just called once with everything CaptureScreen
  // accumulated locally (capture-loop / multi-select), not incrementally
  // per photo.
  setPhotos: (uris: string[]) => void;
  clearPhoto: () => void;
  setExtractionResult: (result: ExtractionResult) => void;
  setTaxService: (settings: TaxServiceSettings | ((previous: TaxServiceSettings) => TaxServiceSettings)) => void;
  addPerson: (name: string) => void;
  setItemAllocations: (itemIndex: number, allocations: Record<number, number>) => void;
  /**
   * Replaces the whole assignment map in one write. Bulk actions on the
   * assignment screen would otherwise loop `setItemAllocations`, firing a
   * separate state update per item — thirty of them on a grocery receipt,
   * each spreading the previous map.
   */
  setAllItemAllocations: (allocations: ItemAssignments) => void;
  // Seeds `people` from a group's member roster and marks this session as
  // logging a group expense rather than a solo split — the existing
  // Capture -> ExtractedItems -> TaxService -> ItemAssignment -> Review flow
  // is reused verbatim; only FinalSplitScreen branches on `session.group`.
  beginGroupExpense: (groupId: string, members: Array<{ id: string; displayName: string }>) => void;
  setPaidByMemberId: (memberId: string) => void;
};

const SplitSessionContext = createContext<SplitSessionContextValue | undefined>(undefined);

/**
 * Owns the split session state. Per Architecture AD-2 + the Stack table,
 * this is the ONLY place session state may be mutated (via the exposed
 * actions), backed by React Context + hooks — no external state library.
 */
export function SplitSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SplitSession>({
    photoUris: [],
    extractionResult: null,
    taxService: null,
    people: [],
    itemAssignments: {},
    group: null,
  });

  const setPhotos = (uris: string[]) => {
    setSession((previous) => ({ ...previous, photoUris: uris }));
  };

  const clearPhoto = () => {
    // Clearing the photo(s) also clears everything derived from them — the
    // extraction result, tax/service settings, the roster, and item
    // assignments — otherwise a retake-after-extraction leaves session
    // state pointing at items, rates, or assignments tied to a photo (or
    // people) the fronter just rejected (same class of bug Story 1.1's
    // review caught for the photo itself).
    setSession((previous) => ({
      ...previous,
      photoUris: [],
      extractionResult: null,
      taxService: null,
      people: [],
      itemAssignments: {},
      group: null,
    }));
  };

  const setExtractionResult = (result: ExtractionResult) => {
    setSession((previous) => ({ ...previous, extractionResult: result }));
  };

  const setTaxService = (
    settings: TaxServiceSettings | ((previous: TaxServiceSettings) => TaxServiceSettings),
  ) => {
    // Accepts an updater (like React's setState) so callers that need to commit
    // more than one field change in the same event handler (e.g. TaxServiceScreen's
    // handleBack committing both the tax and service drafts back to back) each build
    // off the true latest state instead of the same stale render-time `taxService`
    // closure — two updaters queued in one tick still compose correctly.
    setSession((previous) => ({
      ...previous,
      taxService: typeof settings === 'function' ? settings(previous.taxService as TaxServiceSettings) : settings,
    }));
  };

  const addPerson = (name: string) => {
    setSession((previous) => ({ ...previous, people: [...previous.people, { name }] }));
  };

  const setItemAllocations = (itemIndex: number, allocations: Record<number, number>) => {
    setSession((previous) => ({
      ...previous,
      itemAssignments: { ...previous.itemAssignments, [itemIndex]: allocations },
    }));
  };

  const setAllItemAllocations = (allocations: ItemAssignments) => {
    setSession((previous) => ({ ...previous, itemAssignments: allocations }));
  };

  const beginGroupExpense = (groupId: string, members: Array<{ id: string; displayName: string }>) => {
    const memberIdByPersonIndex: Record<number, string> = {};
    members.forEach((member, index) => {
      memberIdByPersonIndex[index] = member.id;
    });
    setSession((previous) => ({
      ...previous,
      people: members.map((member) => ({ name: member.displayName })),
      group: { groupId, memberIdByPersonIndex, paidByMemberId: null },
    }));
  };

  const setPaidByMemberId = (memberId: string) => {
    setSession((previous) => ({
      ...previous,
      group: previous.group ? { ...previous.group, paidByMemberId: memberId } : previous.group,
    }));
  };

  const value = useMemo(
    () => ({
      session,
      setPhotos,
      clearPhoto,
      setExtractionResult,
      setTaxService,
      addPerson,
      setItemAllocations,
      setAllItemAllocations,
      beginGroupExpense,
      setPaidByMemberId,
    }),
    [session],
  );

  return <SplitSessionContext.Provider value={value}>{children}</SplitSessionContext.Provider>;
}

export function useSplitSession(): SplitSessionContextValue {
  const context = useContext(SplitSessionContext);
  if (!context) {
    throw new Error('useSplitSession must be used within a SplitSessionProvider');
  }
  return context;
}
