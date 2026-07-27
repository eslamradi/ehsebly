export type ExtractedItem = {
  name: string;
  price_piastres: number;
  quantity: number;
};

export type TaxOrServiceLine = {
  rate_percent: number;
};

/**
 * A named flat (non-percentage) charge printed on its own line — the
 * "Delivery fee" / "Service fee" / "Preparation fee" lines common on
 * delivery-app order screenshots, as opposed to `TaxOrServiceLine`'s
 * percentage-rate charges. Never has a rate; the client treats each as an
 * ordinary shared item split equally among everyone.
 */
export type FlatFeeLine = {
  name: string;
  amount_piastres: number;
};

/**
 * The AD-4 contract (ARCHITECTURE-SPINE.md#AD-4). Exactly one of these three
 * shapes leaves this Worker — never a raw vendor payload.
 */
export type ExtractionResponse =
  | {
      status: 'ok';
      items: ExtractedItem[];
      tax_line?: TaxOrServiceLine;
      service_line?: TaxOrServiceLine;
      flat_fees?: FlatFeeLine[];
      printed_total_piastres?: number;
      // Present only when multiple photos were submitted as one order but
      // don't actually look like the same order — items/totals above still
      // come from whichever single image was judged coherent; this is a
      // warning for the fronter, not an extraction failure.
      image_mismatch_note?: string;
    }
  | { status: 'no_items_found' }
  | { status: 'error'; message: string };
