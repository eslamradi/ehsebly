import type { ExtractionResult } from './types';

/**
 * The Worker's wire format, and the pure mapping from it to the app's
 * `ExtractionResult`.
 *
 * Deliberately separate from `extractReceipt.ts`: that module imports
 * `Platform` from react-native for its web/native FormData branch, and any
 * import of it therefore drags react-native's Flow-typed entry point in.
 * `scripts/verifyExtraction.ts` runs under tsx, which can't transform that —
 * so keeping the platform-free logic in its own file is what lets the mapping
 * stay verifiable outside a bundler.
 */
export type WorkerResponseBody =
  | {
      status: 'ok';
      items: Array<{ name: string; price_piastres: number; quantity: number }>;
      receipt_check?: {
        code: 'itemsDoNotMatchSubtotal';
        items_sum_piastres: number;
        printed_subtotal_piastres: number;
        difference_piastres: number;
      };
      tax_line?: { rate_percent: number | null; amount_piastres?: number | null; included_in_prices?: boolean };
      service_line?: { rate_percent: number | null; amount_piastres?: number | null; included_in_prices?: boolean };
      discount_line?: { amount_piastres?: number; rate_percent?: number };
      flat_fees?: Array<{ name: string; amount_piastres: number }>;
      printed_total_piastres?: number;
      discount_note?: string;
      image_mismatch_note?: string;
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

export function toExtractionResult(body: WorkerResponseBody): ExtractionResult {
  if (body.status === 'ok') {
    // A detected flat fee (delivery, service, preparation — see extract.ts's
    // flat_fees) becomes an ordinary `shared` item, the exact same shape the
    // fronter's own manual "Add item" on ExtractedItemsScreen produces —
    // split equally among everyone once people exist, editable/removable
    // like any other item, no separate code path needed for it.
    const flatFeeItems = (body.flat_fees ?? []).map((fee) => ({
      name: fee.name,
      pricePiastres: fee.amount_piastres,
      quantity: 1,
      shared: true,
    }));
    return {
      status: 'ok',
      items: [
        ...body.items.map((item) => ({
          name: item.name,
          pricePiastres: item.price_piastres,
          quantity: item.quantity,
        })),
        ...flatFeeItems,
      ],
      taxRatePercent: body.tax_line?.rate_percent ?? undefined,
      serviceRatePercent: body.service_line?.rate_percent ?? undefined,
      // The amount the receipt printed, kept so the split can work out which
      // base the percentage was charged on rather than assuming one.
      taxAmountPiastres: body.tax_line?.amount_piastres ?? undefined,
      serviceAmountPiastres: body.service_line?.amount_piastres ?? undefined,
      receiptCheck: body.receipt_check
        ? {
            code: body.receipt_check.code,
            itemsSumPiastres: body.receipt_check.items_sum_piastres,
            printedSubtotalPiastres: body.receipt_check.printed_subtotal_piastres,
            differencePiastres: body.receipt_check.difference_piastres,
          }
        : undefined,
      taxIncludedInPrices: body.tax_line?.included_in_prices ?? false,
      serviceIncludedInPrices: body.service_line?.included_in_prices ?? false,
      discountRatePercent: body.discount_line?.rate_percent,
      discountFlatPiastres: body.discount_line?.amount_piastres,
      printedTotalPiastres: body.printed_total_piastres,
      discountNote: body.discount_note,
      imageMismatchWarning: body.image_mismatch_note,
    };
  }
  return body;
}
