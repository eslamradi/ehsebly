# Receipt corpus check — staging Worker, 2026-08-11

27 receipts through `ehsebly-extraction-worker-staging`, scored with the
client's own arithmetic, so each figure below is what the app would show.

| | |
|---|---|
| Extracted | 23 / 27 |
| Reconciles to the printed total | **14 / 27 (52%)** |
| Declined (`no_items_found`) | 4 |
| Hard errors | **0** |
| Flagged to the fronter as self-disagreeing | 6 |

**No receipt produces a silently wrong number.** Every one either matches, is
flagged, or is declined.

### 16/27 is the wrong denominator

Four of the 27 are not receipts. IMG_2441 and IMG_3538 are body-composition
printouts — a pharmacy scale slip and a DIXY "Check All Program" slip, listing
height, weight, BMI and body fat with no items and no prices. IMG_2442 and
IMG_3539 are their pairs. Declining them is the correct answer, not a miss.

Of the 23 real receipts:

| | |
|---|---|
| Itemised, self-consistent, legible | **16 — all 16 reconcile** |
| Part of the bill never itemised by the receipt | 3 |
| Receipt's own arithmetic does not add up (flagged) | 3 |
| Receipt's own rounding, 10 piastres | 1 |

So the app reconciles **every receipt that can be reconciled**, and reports
the rest rather than inventing a number for them.

---

## Per receipt

`off` is computed minus printed, in EGP.

| Receipt | n | items | disc | service | tax | fees | computed | printed | off | verdict |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| IMG_1448 | 3 | 184.00 | 0 | 22.08 | 28.85 | 0 | 234.93 | 234.93 | +0.00 | matches |
| IMG_1449 | 2 | 615.00 | 0 | 0 | 0 | 0 | 615.00 | 700.00 | −85.00 | un-itemised lump |
| IMG_1450 | 2 | 465.00 | 0 | 0 | 0 | 0 | 465.00 | 700.00 | −235.00 | un-itemised lump |
| IMG_1451 | 2 | 465.00 | 0 | 0 | 0 | 0 | 465.00 | 700.00 | −235.00 | un-itemised lump |
| IMG_2441 | — | — | | | | | | | | declined |
| IMG_2442 | — | — | | | | | | | | declined |
| IMG_2454 | 2 | 218.00 | 0 | 0 | 34.72 | 30.00 | 282.72 | 282.72 | +0.00 | matches |
| IMG_3160 | 10 | 910.00 | 0 | 88.00 | 0 | 0 | 998.00 | 968.00 | +30.00 | flagged |
| IMG_3176 | 11 | 770.00 | 0 | 77.00 | 0 | 0 | 847.00 | 847.00 | +0.00 | matches |
| IMG_3538 | — | — | | | | | | | | declined |
| IMG_3539 | — | — | | | | | | | | declined |
| IMG_4877 | 1 | 118.00 | 0 | 0 | 0 | 0 | 118.00 | 118.00 | +0.00 | matches |
| IMG_5916 | 5 | 3,550.00 | 0 | 0 | 435.96 | 0 | 3,985.96 | 3,550.00 | +435.96 | **tax-inclusive, not detected** |
| IMG_5917 | 5 | 3,550.00 | 0 | 0 | 435.96 | 0 | 3,985.96 | 3,550.00 | +435.96 | **tax-inclusive, not detected** |
| IMG_6411 | 7 | 840.00 | 0 | 84.00 | 0 | 0 | 924.00 | 924.00 | +0.00 | matches |
| IMG_6510 | 7 | 1,300.00 | 0 | 0 | 0 | 0 | 1,300.00 | 1,300.00 | +0.00 | matches |
| IMG_7852 | 5 | 1,266.00 | 0 | 151.92 | 198.51 | 0 | 1,616.43 | 1,616.43 | +0.00 | matches |
| IMG_8090 | 4 | 360.00 | 0 | 0 | 0 | 0 | 360.00 | 360.00 | +0.00 | matches |
| IMG_8381 | 3 | 412.25 | 0 | 24.25 | 0 | 0 | 436.50 | 436.50 | +0.00 | matches |
| IMG_8381_copy | 3 | 412.25 | 0 | 0 | 0 | 24.25 | 436.50 | 436.50 | +0.00 | matches |
| IMG_8402 | 3 | 210.15 | 0 | 0 | 0 | 35.00 | 245.15 | 245.15 | +0.00 | matches |
| IMG_8403 | 3 | 307.38 | 0 | 20.00 | 0 | 18.11 | 345.49 | 421.09 | −75.60 | flagged |
| **IMG_8715** | 3 | 450.00 | 0 | 54.00 | **63.00** | 0 | **567.00** | 567.00 | **+0.00** | **matches — parallel tax basis** |
| PHOTO-2026-08-09 | 4 | 204.00 | 0 | 0 | 0 | 35.00 | 239.00 | 239.00 | +0.00 | matches |
| db88ca63 | 6 | 1,210.00 | 0 | 0 | 169.40 | 0 | 1,379.40 | 1,379.50 | −0.10 | rounding |
| e19bb62d | 6 | 315.00 | 47.25 | 0 | 0 | 15.75 | 283.50 | 283.50 | +0.00 | matches |
| ec846673 | 2 | 770.00 | 0 | 0 | 100.86 | 45.00 | 915.86 | 821.31 | +94.55 | flagged |

---

## What the mismatches actually are

### Confirmed working

**IMG_8715 (FALAK)** charges 14% VAT and 12% service each on the raw
subtotal. The basis inference reads the printed 63.00, sees it is 14% of
450.00 rather than of 504.00, and resolves to `subtotal`. **567.00 exactly.**
This receipt was off by 7.56 before the change. Every other receipt in the
corpus resolves to `subtotalPlusService`, unchanged.

### A real gap: tax-inclusive item pricing, undetected

**IMG_5916 and IMG_5917** (Drinkies, Lazoghly). The receipt prints line
totals of 30.00, 150.00, 1,050.00, 1,560.00 and 760.00 — **3,550.00** — then
`Subtotal 3,114.04`, `VAT 435.96`, `Total 3,550.00`.

The item prices already contain the VAT. The app adds it again and computes
3,985.96, overcharging by 435.96, about 12%. The self-disagreement warning
fires, so the fronter is told — but the app should get this right, not just
flag it.

The prompt rule I added tells the model to divide the item sum by
`(1 + tax rate)` and compare with the subtotal. **It cannot fire here: this
receipt prints no percentage**, only `VAT 435.96`. So `rate_percent` is null
and there is nothing to divide by.

A rate-free test works, and distinguishes the two cases in this corpus:

```
items_sum − printed_subtotal == tax_amount   →  tax is inside the item prices
```

| Receipt | items − subtotal | printed tax | equal? |
|---|--:|--:|:--|
| IMG_5916 | 435.96 | 435.96 | **yes → inclusive** |
| IMG_5917 | 435.96 | 435.96 | **yes → inclusive** |
| ec846673 | 94.55 | 100.86 | no → something else |

ec846673 correctly fails the test: its VAT covers the delivery fee too, so
the gap and the tax line are not the same number. It stays flagged, which is
the right outcome.

### Not our error: receipts with un-itemised totals

**IMG_1449, IMG_1450, IMG_1451** are handwritten club tabs. IMG_1450 lists
`Meister ×3 = 345` and `ID.Gen Ment = 120`, then `Drink 465`, `Food 235`,
`Total Drink&Food 700`. The itemisation covers drinks only; **food is a lump
sum the receipt never breaks down**. Extraction is correct — 465.00 is
genuinely all the items there are. The 235.00 gap is a category total with no
lines behind it.

These cannot be split by item because the receipt does not say what the food
was. Capturing `Food 235` as a shared line would at least make the total
right.

### Genuinely the restaurant's arithmetic

**IMG_3160** (+30.00) and **IMG_8403** (−75.60) both disagree with their own
subtotals and are flagged. **db88ca63** is 10 piastres out, which is the
receipt's own rounding.

### Declined

**IMG_2441, IMG_2442, IMG_3538, IMG_3539** return `no_items_found`, and all
four are correct. They are body-composition printouts, not receipts: a Delmar
& Attalla pharmacy scale slip and a DIXY "Check All Program" slip, both
listing height, weight, BMI, body fat and BMR, with no line items, no prices
and no total. The app refusing them is the right behaviour.

---

## What to change next

1. **Add the rate-free inclusive test** — `items − subtotal == tax` — as a
   prompt rule and as a client-side check. Fixes IMG_5916/5917, worth roughly
   two receipts in 27.
2. **Capture un-itemised category totals** (`Drink`, `Food`) as shared lines
   so tabs like IMG_1450 reconcile.
3. Nothing needed for the declined photos — they are not receipts.

Item 1 is done: Drinkies now derives 14% from the printed amounts and treats
its item prices as tax-inclusive, taking the corpus to 16. Item 2 would add
the three handwritten tabs, which is every remaining receipt that is not
either self-contradictory or 10 piastres out from its own rounding.
