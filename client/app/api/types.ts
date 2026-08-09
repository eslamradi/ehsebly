export type ExtractedItem = {
  name: string;
  pricePiastres: number;
  quantity: number;
  // True only for an item the fronter added by hand (delivery, a random
  // fee not on the OCR'd list) rather than one OCR found — never set by
  // extraction itself. Marks the item for ItemAssignmentScreen to
  // auto-assign to every current (and later-added) person, since a
  // hand-added flat charge isn't something any one person "ordered."
  shared?: boolean;
};

/**
 * Client-side mirror of the backend's AD-4 contract
 * (ARCHITECTURE-SPINE.md#AD-4) — the only shapes this module returns.
 */
export type ExtractionResult =
  | {
      status: 'ok';
      items: ExtractedItem[];
      taxRatePercent?: number;
      serviceRatePercent?: number;
      // A whole-order discount (e.g. a delivery-app "Discount" line) —
      // exactly one of these two is ever set, mirroring whichever form
      // (percentage vs flat amount) was actually printed. Distinct from
      // discountNote below, which covers PER-ITEM discounts instead.
      discountRatePercent?: number;
      discountFlatPiastres?: number;
      printedTotalPiastres?: number;
      // Set only when at least one item had a printed per-item discount
      // applied server-side — item prices below already reflect it; this
      // is purely a display note so a lower-than-menu price isn't a mystery.
      discountNote?: string;
      // Set only when multiple photos were submitted as one order but don't
      // actually look like the same order — items/total above still come
      // from whichever single photo was judged coherent; surfaced to the
      // fronter as a "double check your photos" warning, not a failure.
      imageMismatchWarning?: string;
    }
  | { status: 'no_items_found' }
  | {
      status: 'error';
      /**
       * Stable machine code from the Worker (src/errors.ts), localized by
       * `errorMessageForCode`. Optional because a Worker deployed before
       * codes existed — or any future one returning a code this build hasn't
       * heard of — still sends `message` as English fallback.
       */
      code?: string;
      message: string;
    };
