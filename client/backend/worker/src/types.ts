export type ExtractedItem = {
  name: string;
  price_piastres: number;
  quantity: number;
};

export type TaxOrServiceLine = {
  /** The printed percentage, or null when the line shows only an amount. */
  rate_percent: number | null;
  /**
   * The amount printed on the line, in piastres, or null when only a rate is
   * shown. Preferred over recomputing from the rate: the receipt already
   * states what it charged, and restaurants disagree about what the rate is
   * charged on — some apply tax and service both to the raw subtotal, others
   * compound tax on top of service.
   */
  amount_piastres: number | null;
  /**
   * True when the receipt says this charge is already inside the item prices
   * ("prices include VAT", "الأسعار شاملة الضريبة"). The line is then
   * informational, and adding it again would double-charge.
   */
  included_in_prices: boolean;
};

/**
 * A whole-order discount line (e.g. a delivery-app "Discount" line) — as
 * opposed to a per-item discount, which is folded directly into that
 * item's own `price_piastres` and never leaves the Worker as its own
 * field. Exactly one of the two fields is ever set, mirroring whichever
 * form (flat amount vs percentage) was actually printed.
 */
export type DiscountLine = {
  amount_piastres?: number;
  rate_percent?: number;
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
      discount_line?: DiscountLine;
      flat_fees?: FlatFeeLine[];
      printed_total_piastres?: number;
      // Present only when at least one item had a printed per-item discount
      // (flat or percentage) applied — items[].price_piastres already
      // reflects the discounted amount; this is purely a display note so
      // the fronter isn't confused by a price lower than the menu price.
      discount_note?: string;
      /**
       * Present only when the receipt disagrees with itself — its own item
       * lines do not add up to its own printed subtotal.
       *
       * ec846673 (Buffalo Burger) prints item cards of 95.00 and 675.00 but a
       * Subtotal of 675.45. Sometimes that is a tax-inclusive display, and
       * sometimes it is simply an error on the restaurant's side. Either way
       * the fronter should be told rather than handed a confident number
       * built on figures the paper itself does not agree with.
       *
       * `code` is a stable identifier the client localises; the piastre
       * figures let it say which numbers disagreed and by how much.
       */
      receipt_check?: {
        code: 'itemsDoNotMatchSubtotal';
        items_sum_piastres: number;
        printed_subtotal_piastres: number;
        difference_piastres: number;
      };
      // Present only when multiple photos were submitted as one order but
      // don't actually look like the same order — items/totals above still
      // come from whichever single image was judged coherent; this is a
      // warning for the fronter, not an extraction failure.
      image_mismatch_note?: string;
    }
  | { status: 'no_items_found' }
  | { status: 'error'; message: string };
