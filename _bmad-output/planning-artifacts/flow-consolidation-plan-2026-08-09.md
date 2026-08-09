# Flow consolidation — Casual Breakdown

**Date:** 2026-08-09
**Trigger:** "the screens until the final split are too much" — target shape: 1 photos → 2 confirm → 3 assign → 4 final split.
**Status:** steps 1–3 shipped, steps 4–5 remain. See §10 for per-step state
and §11 for where to pick up.

Informed by a UX review pass; every code claim below was verified against the
source at the line references given, not taken from the review.

---

## 1. Current flow

| # | Screen | Lines | Does |
|---|---|---|---|
| 1 | `CaptureScreen` | 525 | Take/choose ≤8 photos, confirm batch, run extraction |
| 2 | `ExtractedItemsScreen` | 312 | Editable item list (name, price, quantity stepper), add manual item |
| 3 | `TaxServiceScreen` | 510 | Four toggle cards (Discount/Tax/Service/Other) + a preview panel restating all four |
| 4 | `ItemAssignmentScreen` | 588 | Assign items to people, pinned live totals, progress + unassigned filter |
| 5 | `ReviewScreen` | 380 | **Re-edits item name/price**, restates the totals panel, reconciliation banner, per-person summary |
| 6 | `FinalSplitScreen` | 198 | Final breakdown, share, start new |

---

## 2. Why the merge is right — and why the stated reason isn't

Steps 2 and 3 answer **one question**: *is this receipt transcribed correctly?*
They were split along implementation seams (their file headers cite Story 1.2
and Story 1.3), not user seams.

The proof is reconciliation. `reconcileWithPrintedTotal` needs items **and**
rates, so it belonged to neither screen and ended up exiled to Review, three
steps downstream. The boundary was in the wrong place; the screen count was
the symptom.

**Do not generalise "fewer screens is better."** Assign must *not* later be
merged into Check: different question, keyboard-heavy vs thumb-heavy, and it
needs the full viewport plus its pinned totals strip.

### Deleting Review improves the trust mechanism

Verified: `reconcileWithPrintedTotal` never reads `itemAssignments`
(`ReviewScreen.tsx:179-187` — inputs are `calculateSubtotalPiastres(items)`
and `calculateSplitTotals`). So today the app makes you assign 30 items to 6
people *before* telling you the OCR misread the total. On the merged Check
screen it fires ~30 interactions earlier, while the paper receipt is still in
hand.

This is not theoretical. On 2026-08-09 a "You saved EGP 4" marketing badge was
misread as a real discount on ~50% of runs, which would have charged the table
235.00 against a printed 239.00. The reconciliation banner was the only thing
standing between that and a wrong bill.

---

## 3. 🔴 Blocker — must land before Review is deleted

**`FinalSplitScreen` commits on mount.** Verified at `FinalSplitScreen.tsx:39-118`:
a `useEffect`, guarded only by `savedToHistoryRef`, that calls
`saveSplitToHistory` (solo) or `submitGroupExpense` (group, fire-and-forget
`.catch(() => {})`).

Today the ceremony ("Confirm breakdown") sits on Review and the write happens
invisibly one screen later. **Delete Review and "Continue" on the assignment
screen silently becomes an irreversible write to a shared group ledger.**

The repair path does not save it. Verified at `ExpenseDetailScreen.tsx:121`:

```ts
const isAdmin = Boolean(group && account && group.createdByUserId === account.userId);
// …
{isAdmin && ( /* Edit / Delete */ )}
```

A non-admin who fronted dinner and mis-assigned an item **cannot fix it
themselves** — the group creator is its one permanent admin, mirroring
`requireGroupAdmin` server-side.

**Required:**
- Solo → relabel Continue to "Show the split". Low stakes, history is local.
- Group → relabel to **"Post to {group}"**, gated behind a confirm sheet
  listing per-person amounts, who paid, and reconciliation state.

### Back-edit dead zone (exists today, deletion makes it reachable)

`savedToHistoryRef` blocks a second write, and native-stack **re-focuses
rather than remounts** on forward navigation (see the comment at
`FinalSplitScreen.tsx:30-35`). So: FinalSplit → Back → fix a price → Confirm →
**the corrected split is never re-saved.** Silent.

`handleBack` currently targets `'Review'` (`FinalSplitScreen.tsx:121`).
Retargeting it to `ItemAssignment` would route users straight into that dead
zone. **Remove Back from FinalSplit entirely**; post-commit the escape hatch
should be an explicit "Edit this expense", not a stack pop.

---

## 4. Is Review's duplicate editing redundant?

| Error class | Caught where | Does a post-assignment second pass help? |
|---|---|---|
| A. OCR misread name/price | screen ↔ paper comparison | **No** — same numbers, more fatigue, receipt now put away |
| B. Wrong/missing assignment | Assign: red rail, progress, `areAllItemsAssigned` gate | **No** — Review shows it read-only via `describeAllocations` (`ReviewScreen.tsx:305`); an error you can't act on is a nag |
| C. Computed vs printed total | reconciliation | **No** — never needed assignment (§2) |
| D. Implausible per-person total | nowhere well | **Yes** — the only real residue |

Class D is served today by accident, in Review's per-person panel
(`ReviewScreen.tsx:282-289`). It should move to the **group commit sheet**,
where the write actually happens — ~200pt of bottom sheet replacing 380 lines
of screen.

Note reconciliation is structurally blind to class B: `splitItemAmongWeights`
guarantees every piastre lands somewhere, so per-person totals always sum to
the subtotal *however wrong the assignment is*. A green "Matches receipt" is
fully compatible with Ahmed paying for Sara's steak.

---

## 5. The merged "Check the receipt" screen

Name it after its thesis — verdict-first — not "Confirm everything".

### Why it fits at 30 items

Naive concatenation does not fit: item cards are ~120pt (`padding: spacing.lg`
+ name/price row + a **full quantity row with stepper**), so 30 items ≈ 3,600pt
≈ 5 screens *before* the first toggle card, then 4 × ~140pt rate cards. Two
compressions fix it, and both are improvements on their own:

**(a) One row per item.** Drop the dedicated quantity row
(`ExtractedItemsScreen.tsx:235-243`); render `name │ ×2 │ price` on one ~56pt
line, with `×2` expanding a stepper inline only when tapped. Most items are
quantity 1 — the stepper currently renders 30 times to serve maybe three.
30 items → ~1,700pt (~3 screens). A dense scrolling list is also more "ledger,
not form" than card-per-item.

**(b) The four toggle cards *are* the totals panel.** `TaxServiceScreen`
contains a duplicate of itself: editor cards at 284-445, then a preview panel
at 447-473 restating the same four numbers. Fuse them — the summary row is the
editor. ~136pt replaces ~560pt *and* removes real duplication.

### Anatomy

```
┌─ STICKY (mismatch only) ────────────────┐
│ ⚠ 4.00 EGP off the printed total        │
└─────────────────────────────────────────┘
┌─ SCROLL ────────────────────────────────┐
│ Check the receipt                       │
│ Tap anything that looks wrong.          │
│ [photo thumbnail strip — tap to zoom]   │  ← NEW
│ ITEMS  (dense, one row each)            │
│ + Add an item                           │
│ CHARGES + TOTALS (~200pt, edit in place)│
└─────────────────────────────────────────┘
┌─ PINNED ────────────────────────────────┐
│ Total 239.00 ✓          [ Continue ]    │
└─────────────────────────────────────────┘
```

**Add the photo thumbnails.** The screen's job is comparing transcript to
paper, and today the paper vanishes the moment extraction returns. ~90pt,
highest value-per-point in the redesign.

#### 5 items, matching — no scroll at all for a restaurant bill

```
  Check the receipt
  Tap anything that looks wrong.
  [📷] 1 photo

  Mixed grill          ×2        184.00
  Hummus                          45.00
  Fattoush                        38.00
  Water                ×4         24.00
  Baklava                         36.00
  + Add an item
  ──────────────────────────────────────
  Subtotal                       327.00
  Service · 12%                  +39.24
  Tax · 14%                      +51.27
  Discount                       off  +
  ══════════════════════════════════════
  Total                          417.51
  ✓ matches printed total 417.51
──────────────────────────────────────────
  Total 417.51 ✓          [ Continue ]
```

#### Mismatch — the saved-EGP-4 case

```
⚠  4.00 EGP off the printed total   [ Why? ]   ← sticky, red
  …items…
  ──────────────────────────────────────
  Subtotal                       327.00
  Discount · 4.00 EGP             −4.00 ✕      ← red-tinted
  Service · 12%                  +38.76
  Tax · 14%                      +50.65
  ══════════════════════════════════════
  Total                          412.41
  Printed on receipt             417.51
  Difference                      −5.10
```

Three deliberate choices:

1. **Difference is a row, not prose.** Today `reconciliationDetail` reads
   "Computed X vs printed Y (off by Z)". A ledger states three numbers in a
   column — faster to parse, and correct voice.
2. **Every optional charge gets a one-tap `✕`.** The bug class is "a charge
   exists that shouldn't". One tap to zero it and the strip goes quiet in the
   same frame. Today that repair is: notice on Review → back → back → find the
   card → toggle → forward → forward.
3. **A mismatch never blocks Continue.** Real receipts have rounding quirks and
   the ±2 piastre tolerance is a documented `[ASSUMPTION]`
   (`reconciliation.ts:19`). But the mismatch must then *travel* — see §6.

#### Banner policy

- **Mismatch** → sticky, un-scrollable-away, recomputes live as you edit.
- **Match** → **no banner**; a small ✓ and the printed figure on the Total row.
  A green banner on every successful receipt is noise, and noise is what trains
  people to ignore the strip on the day it turns red.
- **No printed total detected** → quiet muted line. This is the state where the
  user is *unprotected*; it should be legible, not loud.

#### Charge row interaction

| State | Renders | Interaction |
|---|---|---|
| On, rate known | `Service · 12%  +39.24` | tap rate → inline field; tap `✕` → off |
| Off, detected | `Service · 12%  off  +` | tap `+` → on at detected rate |
| Off, undetected | `Other service  off  +` | tap `+` → on at 0%, focus field |
| Discount | `Discount · 4.00 EGP  −4.00 ✕` | tap value → field; `%`/`EGP` toggle appears **only while editing** (today it's permanent chrome at `TaxServiceScreen.tsx:295-314`) |

Keep `draft-then-commit-on-blur` — it exists because of real Story 1.2/1.3
review findings, and it matters *more* here: the totals recompute live, so
per-keystroke commits would flicker the reconciliation strip red/green
mid-typing. Add a flush-on-Continue mirroring `flushAllPriceDrafts`
(`ExtractedItemsScreen.tsx:165`).

**Do not** collapse the item list behind a "30 items ▸" disclosure — it hides
the exact content the screen exists to verify, and is a dead end under a red
strip. The pinned total bar is what makes the length tolerable.

---

## 6. Reconciliation's second home

It must also appear on **FinalSplit** and in the **shared image**
(`ShareableSplit`) as a provenance line — `Matches receipt · 239.00` or
`⚠ 4.00 off printed total`. The shared PNG and the group ledger row outlive
the moment; a consciously-accepted mismatch should stay attached to the
artifact, or the recipient has no idea the number was ever in doubt.

This is new work, not a move.

---

## 7. The group commit sheet — Review's actual replacement

Triggered by "Post to {group}" on the assignment screen:

```
  Post to Sahel Trip?

  Ahmed     104.38      Sara      98.12
  Omar       87.50      Nour     127.51
  ──────────────────────────────────────
  Total    417.51   ✓ matches receipt
  Paid by  Ahmed

  [ Post ]                    [ Not yet ]
```

Serves class D, restores the commit ceremony, and carries reconciliation
provenance — at the moment of the write. **Solo gets no sheet**: local history
is revisitable and nobody else is affected. Ceremony proportional to stakes.

This is also the natural home for **"who paid?"**, currently crammed into the
assignment screen (`ItemAssignmentScreen.tsx:379-398`) and the one whose
omission blocks Continue with `errNeedPayer`. It is a commit-time question.
Until it moves, the flow is not honestly four steps.

---

## 8. Smaller migration notes

- `computeInitialTaxServiceSettings` is seeded on ExtractedItems' Continue
  press behind `if (!session.taxService)` (`ExtractedItemsScreen.tsx:194-197`).
  The merged screen renders rate editors **on mount** and can't wait for a
  press — move seeding to extraction completion in Capture, right after
  `setExtractionResult`. **Keep the guard**: it's what stops a
  retake-then-return from clobbering hand-edited rates.
- `handleStartNewSplit`'s `navigation.reset` comment enumerates the stack by
  name (`FinalSplitScreen.tsx:132`) — drop `Review`.
- `RootStackParamList.Review` removal is a compile-time catch. Safe.
- **i18n:** `review.matchesReceipt`, `review.doesntMatchReceipt`,
  `review.reconciliationDetail` must **move, not be deleted** — they'll be
  referenced from Check, FinalSplit and the commit sheet. Promote to a shared
  `reconcile.*` namespace across all three locale tables rather than
  duplicating three ways. `verifyNoHardcodedCopy.ts`'s `CORE_FILES` list needs
  updating as screens are added/removed.
- Delete rather than carry over: `describeDetectedRates`' "Detected 14% tax and
  12% service" prose (`ExtractedItemsScreen.tsx:296`) is redundant once the
  rates are editable rows. Keep `discountNote` but attach it to the subtotal
  row instead of floating it as a paragraph.

---

## 9. The challenge to the premise

**For a 30-line grocery receipt, the merge does not fix the complaint.**
Splitting between two flatmates costs ~30 chip taps: `toggleEveryone` is
per-item (`ItemAssignmentScreen.tsx:260`) and `shared` auto-assign only covers
hand-added items (line 238). There is no global "everyone on everything".

One tap — **"Split everything evenly"**, with per-item exceptions still
available — removes ~28 interactions. That is a larger felt win than removing
a screen, from a much smaller change. It also makes the merge *more* valuable
afterwards: once assignment is one tap, Check is where all the remaining time
goes.

"The screens are too much" may really be "*the work* is too much."

Also note: roughly a third of this plan is **addition**, not deletion — photo
thumbnails, reconciliation on FinalSplit and in the share image, the commit
sheet, one-tap charge removal. A pure-deletion refactor would be a downgrade.
The current six screens are over-chunked but not over-protective, and the
group path is actively under-protected.

---

## 10. Recommended sequence

Each step stands alone, ships independently, and de-risks the next.

| # | Step | State | Commit |
|---|---|---|---|
| 1 | **Global "split evenly"** on the assignment screen | ✅ shipped | `29cabef` |
| 2 | **Retarget the commit ceremony** | ✅ shipped | `bb72b89` |
| 3a | **One-row items** — quantity row → inline `×N` badge | ✅ shipped | `db8b299` |
| 3b | **Fuse rate editors into the totals panel** | ✅ shipped | `27a3c6d` |
| 4 | **Merge** Extracted Items + Tax & Service into Check | ✅ shipped | `fdefc66` |
| 5 | **Delete Review**; `review.*` → `reconcile.*`; reconciliation on FinalSplit | ✅ shipped | (this commit) |

**Outstanding from step 5:** the group commit sheet (§7) is still not built.
Deleting Review removed the deliberate press in front of the group ledger
write, so `FinalSplitScreen` now posts on arrival. Unreachable today —
Groups is hidden behind `GROUPS_ENABLED` — but it must be built before that
flag returns to true.

If step 5 never ships, the thing that was actually broken is still fixed.

### What shipped differed from the plan in two places

- Step 2 turned up a worse problem than described: a failed group submission
  was swallowed by `.catch(() => {})`, so a dropped request left the table
  looking at a finished breakdown — with a green COMPLETE stamp — that the
  ledger never received. It now reports the failure and offers a retry, and
  the COMPLETE pill is suppressed while a post has failed. The plan only
  called for relabelling the CTA and adding a sheet.
- The **group commit sheet** (§7) was *not* built. Review still exists and
  still shows per-person amounts, reconciliation and a commit button, so the
  ceremony is adequate for now. The sheet becomes necessary in step 5, at the
  moment Review is deleted — building it earlier would have duplicated Review.

---

## 11. Picking up at step 4

Everything below is unstarted. The two screens were compressed in step 3
specifically so that concatenating them fits: before 3a/3b a 30-line grocery
receipt put roughly five screens of items ahead of the first rate control;
it is now about three, with a ~200pt ledger tail.

Order of work:

1. **Extract the ledger from `TaxServiceScreen` into a `ChargesLedger`
   component** owning its own drafts, error flags and commit handlers. This is
   the bulk of the step — five draft fields, four error flags, six
   commit-on-blur handlers, three toggle handlers, plus the discount's
   two-mode logic. Doing it as a component rather than inlining into the items
   screen keeps the diff reviewable and the state boundary intact.
2. **Render it below the item list** on `ExtractedItemsScreen`; rename the
   screen to **"Check the receipt"** (verdict-first, per §5).
3. **Move tax/service seeding to extraction completion in Capture**, right
   after `setExtractionResult`. The merged screen renders rate editors on
   mount and cannot wait for a Continue press to seed them. **Keep the
   `if (!session.taxService)` guard** — it is what stops a retake-then-return
   from clobbering hand-edited rates (§8).
4. **Rewire navigation:** `ExtractedItems → ItemAssignment` directly; remove
   the `TaxService` route from `RootStackParamList` and `App.tsx`; delete
   `TaxServiceScreen`; retarget `ItemAssignmentScreen`'s Back.
5. **Add the photo thumbnail strip** (§5). Highest value-per-point addition in
   the redesign: the screen's whole job is comparing the transcript against
   the paper, and today the paper disappears the moment extraction returns.
6. **Update `CORE_FILES`** in `client/scripts/verifyNoHardcodedCopy.ts` as
   screens are added and removed, or the copy guard silently stops covering
   them.

Verification to run after: `npx tsc --noEmit`, then
`verifyNoHardcodedCopy`, `verifyTranslations`, `verifyAssignment`,
`verifyExtraction`, `verifySplitCalculation`, `verifyGroupBalances`.
Then drive the screen — toggle every charge off and on, confirm rates are
retained across a toggle, and confirm the totals recompute — because this is
the screen the money comes from.

Note the app has no test framework; the `client/scripts/verify*.ts` files are
plain re-runnable scripts, and a dev seed placed temporarily in
`SplitSessionProvider` plus `initialRouteName` in `App.tsx` is how these
screens have been driven in isolation. Both must be reverted before commit.

---

## Key file references

- `client/app/screens/FinalSplitScreen.tsx` — commit-on-mount `useEffect` (39-118); `handleBack → 'Review'` (121); reset stack enumeration (132)
- `client/app/screens/ReviewScreen.tsx` — reconciliation call (179-187); `ReconciliationBanner` (337-380); redundant editors (198-236); `describeAllocations` (305)
- `client/app/screens/TaxServiceScreen.tsx` — rate cards (284-445) vs duplicate preview panel (447-473); discount mode chrome (295-314)
- `client/app/screens/ExtractedItemsScreen.tsx` — quantity row (235-243); tax/service seeding guard (194-197); `flushAllPriceDrafts` (165)
- `client/app/screens/ItemAssignmentScreen.tsx` — per-item `toggleEveryone` (260); Continue gates (271-294); who-paid row (379-398); footer totals (559-585)
- `client/app/screens/ExpenseDetailScreen.tsx` — `isAdmin` gate (121)
- `client/app/domain/reconciliation.ts` — assignment-independent by construction; ±2 piastre `[ASSUMPTION]` (19)
- `client/app/i18n/locales/{en,ar,franco}.ts` — `review.*` namespace to relocate
- `client/scripts/verifyNoHardcodedCopy.ts` — `CORE_FILES` list to update
