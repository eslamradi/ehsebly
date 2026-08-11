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
    reopenPrompt: 'Reopen asemly to finish switching to Arabic.',
  },

  home: {
    tagline: 'Break down a receipt in a few taps — no calculator, no guessing the tax.',
    groupsTitle: 'Groups',
    groupsSubtitle: 'Households and trips — a running ledger. Settle up via InstaPay, Vodafone Cash, or cash.',
  },

  casual: {
    takePhoto: 'Take Photo',
    chooseFromGallery: 'Choose from Gallery',
    history: 'History',
    a11yTakePhoto: 'Take a photo of a receipt',
    a11yChooseFromGallery: 'Choose photo from gallery',
    a11yHistory: 'View breakdown history',
  },

  capture: {
    photoCount: { one: '{count} photo', other: '{count} photos' } as PluralForms,
    captured: { one: 'Photo captured.', other: '{count} photos captured.' } as PluralForms,
    reading: { one: 'Reading your receipt…', other: 'Reading your photos…' } as PluralForms,
    usePhotos: 'Use These Photos ({count})',
    addAnotherCamera: 'Add Another (Camera)',
    addFromGallery: 'Add from Gallery',
    retakeAll: 'Retake All',
    retake: 'Retake',
    maxPhotos: 'Up to {max} photos per receipt.',
    a11yCapturedPhotoIndexed: 'Captured receipt photo {index} of {total}',
    captureFailed: "Couldn't capture that photo — try again.",
    openPhotosFailed: "Couldn't open your photos — try again.",
    grantCamera: 'asemly needs your camera to photograph a receipt.',
    photoPermission: 'asemly needs access to your photos to pick a receipt.',
    grantCameraAction: 'Grant camera access',
    openSettings: 'Open Settings',
    photoAccessOff: 'Photo access is off. Turn it on in Settings to pick a receipt from your gallery.',
    a11yOpenSettings: 'Open Settings',
    a11yReadingReceipt: 'Reading receipt',
    a11yRetakePhotos: 'Retake photos',
    a11yOpeningPhotos: 'Opening your photos',
    a11yUsePhotos: 'Use these photos',
    a11yAddAnotherCamera: 'Add another photo with the camera',
    a11yAddFromGallery: 'Add another photo from your gallery',
    a11yRetakeAll: 'Retake all photos',
    a11yCapturePhoto: 'Capture receipt photo',
    a11yCapturedPhoto: 'Captured receipt photo',
  },

  extracted: {
    title: 'Check the receipt',
    subtitle: 'Tap anything that looks wrong.',
    checkYourPhotos: 'Check your photos',
    quantity: 'Quantity',
    addItemPlaceholder: 'Delivery, etc.',
    pricePlaceholder: '0.00',
    addedItemsNote: 'Added items (like a delivery fee) are divided equally among everyone.',
    a11yItemName: 'Item {index} name',
    a11yItemPrice: 'Item {index} price in Egyptian pounds',
    a11yQuantityToggle: 'Change quantity for {item}',
    a11yItemQuantity: '{item} quantity',
    priceUnreadableShort: "Couldn't read that price.",
    backToCamera: 'Back to Camera',
    noExtractedItems: 'No extracted items to show.',
    priceUnreadable: "Couldn't read that price — kept the previous value.",
    errNeedName: 'Enter a name before adding.',
    a11yNewItemName: 'New item name',
    a11yNewItemPrice: 'New item price in Egyptian pounds',
    a11yAddItem: 'Add item',
    a11yContinueAssignment: 'Continue to assignment',
    a11yReceiptPhoto: 'Receipt photo {index}',
    a11yBackToCamera: 'Back to camera',
  },

  taxService: {

    discount: 'Discount',
    tax: 'Tax',
    service: 'Service',
    otherService: 'Other service',
    subtotal: 'Subtotal',
    total: 'Total',
    off: 'off',
    valueUnreadable: "Couldn't read that — kept the previous value.",
    rateUnreadable: "Couldn't read that rate — kept the previous value.",
    a11yDiscountToggle: 'Discount applies to this receipt',
    a11yDiscountPercentMode: 'Discount as a percentage',
    a11yDiscountFlatMode: 'Discount as a flat EGP amount',
    a11yDiscountRate: 'Discount rate percent',
    a11yDiscountFlat: 'Discount flat amount in Egyptian pounds',
    a11yTaxToggle: 'Tax applies to this receipt',
    a11yTaxRate: 'Tax rate percent',
    a11yServiceToggle: 'Service applies to this receipt',
    a11yServiceRate: 'Service rate percent',
    a11yOtherServiceToggle: 'Other service applies to this receipt',
    a11yOtherServiceRate: 'Other service rate percent',
  },

  assignment: {
    title: 'Who had what?',
    addPersonPlaceholder: 'Add a person',
    everyoneHadEverything: 'Everyone had everything',
    a11yEveryoneHadEverything: 'Assign every item to everyone',
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
    a11yContinueBreakdown: 'Continue to the breakdown',
  },

  reconcile: {
    matchesReceipt: 'Matches receipt',
    doesntMatchReceipt: "Doesn't match receipt",
    reconciliationDetail: 'Computed {computed} EGP vs printed {printed} EGP (off by {diff} EGP).',
    noPrintedTotal: "No printed total detected on this receipt — can't check against it automatically.",
  },

  final: {
    title: 'Breakdown',
    complete: 'Complete',
    shareBreakdown: 'Share Breakdown',
    startNew: 'Start New Breakdown',
    includesShare: 'Includes their share of tax and service',
    includesDiscount: 'Includes their share of the discount',
    noItems: 'No items assigned',
    postToGroup: 'Post to {group}',
    submitFailed: "Couldn't post this to {group} — nothing was saved to the group ledger.",
    submitRetry: 'Try posting again',
    submitting: 'Posting…',
    posted: 'Posted to {group}',
    nothingToShow: 'Nothing to show yet.',
    sessionExpired: 'Your session expired before this could be saved to the group — sign in again, then re-enter this expense.',
    a11yShare: 'Share breakdown',
    a11yStartNew: 'Start new breakdown',
    a11yBackToAssignment: 'Back to item assignment',
  },

  summary: {
    receiptPhoto: 'Receipt photo',
    receiptPhotoIndexed: 'Receipt photo {index} of {total}',
    // Charge rows compose a base label with either its rate or an off marker,
    // so the punctuation stays in the table and a locale can move it.
    withRate: '{label} · {rate}%',
    disabled: '{label} (off)',
    includesShareOf: 'Includes their share of {charges}',
    noCharges: 'No tax, service, or other service charge on this receipt — just their share of the items',
    chargeDiscount: 'the discount',
    chargeTax: 'tax',
    chargeService: 'service',
    chargeOtherService: 'the other service charge',
    // Joins the charge list: "tax and service", "the discount, tax and service".
    listAnd: 'and',
  },

  share: {
    title: 'Breakdown — asemly',
    dialogTitle: 'Share breakdown',
    personLine: '{name}: {amount} EGP ({items})',
    discountLine: 'Discount: -{amount} EGP',
    otherServiceLine: 'Other service: {amount} EGP',
    totalLine: 'Total: {amount} EGP',
  },

  extractionFailed: {
    title: "Couldn't read this receipt",
    retry: 'Retry',
    enterManually: 'Enter Items Manually',
    succeededUnexpectedly: 'Extraction actually succeeded — this screen shouldn\u2019t be showing. Try again.',
    noPlausibleItems: 'No plausible items were found on that photo.',
    a11yRetry: 'Retry with a new photo',
    a11yEnterManually: 'Enter items manually',
  },

  manualEntry: {
    title: 'Manual entry',
    notBuiltYet: "Manual item entry isn't built yet — for now, retake the photo or add up the receipt by hand for this one.",
    backToCamera: 'Back to Camera',
    a11yBackToCamera: 'Back to camera',
  },

  errors: {
    // The Worker replies with a stable machine code rather than English prose,
    // so a new language never means redeploying the backend. `unknown` is the
    // fallback for a code this client build hasn't heard of yet.
    unreadableResponse: 'The extraction service sent something we could not read.',
    upstream: 'The extraction service had a problem — try again.',
    unreadablePrice: 'A price on this receipt could not be read.',
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
