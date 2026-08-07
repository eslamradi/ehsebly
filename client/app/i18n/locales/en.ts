/**
 * The source-of-truth string table. Every other locale is typed as
 * `Translations`, derived from this object, so a missing or misspelled key is
 * a compile error rather than a blank label discovered in production.
 *
 * Plural strings are objects keyed by CLDR plural category. English only ever
 * needs `one`/`other`; Arabic additionally uses `two`/`few`/`many`, which is
 * why the shape is a category map rather than a `count === 1` ternary at the
 * call site — see `plural.ts`.
 */
import type { PluralForms } from '../plural';

export const en = {
  common: {
    back: 'Back',
    continue: 'Continue',
    done: 'Done',
    add: 'Add',
    egp: 'EGP',
    // Money is always rendered with Western digits, in every locale. Egyptian
    // receipts, delivery apps and price tags overwhelmingly print them, and
    // IBM Plex Mono — the app's ledger typeface — has no Arabic-Indic glyphs,
    // so switching numerals would silently lose the tabular alignment that
    // makes the totals columns readable.
  },

  language: {
    label: 'Language',
    english: 'English',
    arabic: 'العربية',
    franco: 'Franco',
    switching: 'Switching language…',
    reopenPrompt: 'Reopen ehsebly to finish switching to Arabic.',
  },

  home: {
    tagline: 'Break down a receipt in a few taps — no calculator, no guessing the tax.',
    casualTitle: 'Casual Breakdown',
    casualSubtitle: 'No sign-up — snap a receipt and 14% tax compounds correctly on 12% service, automatically.',
    groupsTitle: 'Groups',
    groupsSubtitle: 'Households and trips — a running ledger. Settle up via InstaPay, Vodafone Cash, or cash.',
  },

  casual: {
    title: 'Casual Breakdown',
    subtitle: 'Break down one receipt in a few taps — no sign-up.',
    takePhoto: 'Take Photo',
    chooseFromGallery: 'Choose from Gallery',
    history: 'History',
    a11yTakePhoto: 'Take a photo of a receipt',
    a11yChooseFromGallery: 'Choose photo from gallery',
    a11yHistory: 'View breakdown history',
    a11yBackHome: 'Back to home',
  },

  capture: {
    photoCount: { one: '{count} photo', other: '{count} photos' } as PluralForms,
    usePhotos: 'Use These Photos ({count})',
    addAnotherCamera: 'Add Another (Camera)',
    addFromGallery: 'Add from Gallery',
    retakeAll: 'Retake All',
    grantCamera: 'ehsebly needs your camera to photograph a receipt.',
    grantCameraAction: 'Grant camera access',
    reading: 'Reading your receipt…',
  },

  extracted: {
    title: 'Extracted items',
    subtitle: 'Tap any name or price to fix an OCR misread.',
    quantity: 'Quantity',
    addItemPlaceholder: 'Delivery, etc.',
    addedItemsNote: 'Added items (like a delivery fee) are divided equally among everyone.',
    backToCamera: 'Back to Camera',
  },

  taxService: {
    title: 'Tax & Service',
    discount: 'Discount',
    tax: 'Tax',
    service: 'Service',
    otherService: 'Other service',
    subtotal: 'Subtotal',
    total: 'Total',
    off: 'off',
  },

  assignment: {
    title: 'Who had what?',
    addPersonPlaceholder: 'Add a person',
    everyone: 'Everyone',
    unassigned: 'Unassigned',
    addPersonFirst: 'Add a person above to assign this item.',
    groupNote:
      "Assigning items among this group's members. To include someone new, invite them from the group screen, then start this expense again.",
    whoPaid: 'Who paid?',
    progress: '{assigned} of {total}',
    onlyUnassigned: 'Only unassigned',
    allAssignedFiltered: "Everything's assigned — switch the filter off to review the full receipt.",
    setAmounts: 'Set amounts',
    hideAmounts: 'Hide amounts',
    howManyEach: 'How many each?',
    eachAmount: '{amount} each',
    eachAmountApprox: '≈{amount} each',
    sharedEvenly: 'Shared evenly.',
    allCounted: 'All {count} counted.',
    someCounted: '{counted} of {total} counted — the rest follow the same amounts.',
    overCounted: '{counted} counted, receipt shows {total} — amounts follow these numbers.',
    nothingToAssign: 'Nothing to assign yet.',
    errNeedPerson: 'Add at least one person before continuing.',
    errNeedName: 'Enter a name before adding.',
    errNeedPayer: 'Choose who paid before continuing.',
    errUnassignedFiltered: {
      one: '{count} item still needs someone — showing just that one.',
      other: '{count} items still need someone — showing just those.',
    } as PluralForms,
    errUnassigned: {
      one: "{count} item still needs someone — it's flagged in red.",
      other: "{count} items still need someone — they're flagged in red.",
    } as PluralForms,
    a11yAssignTo: 'Assign {item} to {person}',
    a11yAssignEveryone: 'Assign {item} to everyone',
    a11yRemoveEveryone: 'Remove everyone from {item}',
    a11ySetAmounts: 'Set per-person amounts for {item}',
    a11yDoneAmounts: 'Done setting amounts for {item}',
    a11yShareFor: '{item} share for {person}',
    a11yPersonPaid: '{person} paid',
    a11yAddPerson: 'Add person',
    a11yNewPersonName: "New person's name",
    a11yOnlyUnassigned: 'Show only unassigned items',
    a11yBackToTax: 'Back to tax and service',
    a11yContinueReview: 'Continue to review',
  },

  review: {
    title: 'Review',
    subtitle: 'Tap any name or price to fix an OCR misread.',
    matchesReceipt: 'MATCHES RECEIPT',
    confirm: 'Confirm breakdown',
  },

  final: {
    title: 'Breakdown',
    complete: 'COMPLETE',
    shareBreakdown: 'Share Breakdown',
    startNew: 'Start New Breakdown',
    includesShare: 'Includes their share of tax and service',
    includesDiscount: 'Includes their share of the discount',
    noItems: 'No items assigned',
  },

  errors: {
    // The Worker replies with a stable machine code rather than English prose,
    // so a new language never means redeploying the backend. `unknown` is the
    // fallback for a code this client build hasn't heard of yet.
    unreachable: 'Could not reach the extraction service.',
    malformed: 'Extraction service response was malformed.',
    truncated: 'Extraction was truncated — the receipt may have too many items.',
    notConfigured: 'Extraction service is not configured.',
    unreadableImage: 'Could not read the uploaded photo(s).',
    noImage: 'No image received.',
    tooManyImages: 'Too many photos — up to {max} at once.',
    noItemsFound: "Couldn't read this receipt",
    unknown: 'Something went wrong. Please try again.',
    retry: 'Retry',
  },
};

export type Translations = typeof en;
