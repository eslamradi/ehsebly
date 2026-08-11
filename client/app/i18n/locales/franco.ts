import type { Translations } from './en';

/**
 * Franco (Arabizi) — the same Egyptian colloquial Arabic as `ar.ts`, written
 * in Latin script with digits standing in for sounds Latin letters don't
 * cover. This is how a large share of Egyptians actually type, and the app's
 * own name is already Franco: asemly = احسبلي.
 *
 * Conventions held consistently across this file, since Franco has no
 * standard orthography:
 *   7 = ح    3 = ع    2 = ء/ق (glottal)    5 = خ    8 = غ    9 = ض
 *   el = ال (always "el", never "al" — Egyptian, not MSA)
 *   ee = long ي (meen, feeh)   ou/oo = long و (fatoura, shoof)
 * Words that are ordinary English loanwords in Egyptian speech stay spelled
 * as English (delivery, kamera) rather than being forced into Franco.
 *
 * Franco is LTR and Latin-script, so unlike `ar` it needs no RTL flip and no
 * Arabic typeface — it renders in Manrope like English does.
 *
 * It shares Arabic's plural rules, including the dual: "2 7agat" needs the
 * same distinct form as حاجتين. See plural.ts.
 */
export const franco: Translations = {
  common: {
    back: 'Rago3',
    continue: 'Yalla',
    done: 'Tamam',
    add: 'Dayef',
    egp: 'EGP',
  },

  language: {
    label: 'El logha',
    english: 'English',
    arabic: 'العربية',
    franco: 'Franco',
    switching: 'Beneghayar el logha…',
    reopenPrompt: 'Ekfel el app w eftaho tany 3ashan el logha tetzabat.',
  },

  home: {
    tagline: 'E7seb el fatoura f kam daghta — men gheer alaa 7asba wala takhmeen fel dareeba.',
    groupsTitle: 'Groups',
    groupsSubtitle: 'Beit aw re7la — 7esab mashy ma3ak. Saded be InstaPay aw Vodafone Cash aw cash.',
  },

  casual: {
    takePhoto: 'Sawwar',
    chooseFromGallery: 'Ekhtar men el soar',
    history: 'El segel',
    a11yTakePhoto: 'Sawwar el fatoura',
    a11yChooseFromGallery: 'Ekhtar soura men el studio',
    a11yHistory: 'E3red segel el 7esabat',
  },

  capture: {
    photoCount: {
      zero: 'Mafeesh soar',
      one: 'Soura wa7da',
      two: 'Sorteen',
      few: '{count} soar',
      many: '{count} soura',
      other: '{count} soura',
    },
    captured: {
      zero: 'Mafeesh soar etsawaret.',
      one: 'El soura etsawaret.',
      two: 'El sorteen etsawaro.',
      few: '{count} soar etsawaro.',
      many: '{count} soura etsawaro.',
      other: '{count} soura etsawaro.',
    },
    reading: {
      one: 'Bene2ra el fatoura…',
      two: 'Bene2ra el sorteen…',
      other: 'Bene2ra el soar…',
    },
    usePhotos: 'Kammel bel soar di ({count})',
    addAnotherCamera: 'Dayef soura tanya',
    addFromGallery: 'Dayef men el studio',
    retakeAll: 'Sawwar men el awel',
    retake: 'Sawwar tany',
    maxPhotos: 'Le7ad {max} soar lel fatoura el wa7da.',
    a11yCapturedPhotoIndexed: 'Sooret el fatoura {index} men {total}',
    captureFailed: 'Ma2derneesh nesawwar — garrab tany.',
    openPhotosFailed: 'Ma2derneesh neftah el soar — garrab tany.',
    grantCamera: 'asemly me7tag el kamera 3ashan tesawwar el fatoura.',
    photoPermission: 'asemly me7tag yewsal le soarak 3ashan tekhtar fatoura.',
    grantCameraAction: 'Esma7 bel kamera',
    openSettings: 'Efta7 el settings',
    photoAccessOff: 'El wosool lel soar ma2foul. Efta7o men el settings 3ashan tekhtar fatoura men el studio.',
    a11yOpenSettings: 'Efta7 el settings',
    a11yReadingReceipt: 'Bene2ra el fatoura',
    a11yRetakePhotos: 'Sawwar tany',
    a11yOpeningPhotos: 'Beneftah el soar',
    a11yUsePhotos: 'Estakhdem el soar di',
    a11yAddAnotherCamera: 'Dayef soura tanya bel kamera',
    a11yAddFromGallery: 'Dayef soura tanya men el studio',
    a11yRetakeAll: 'Sawwar kol el soar men el awel',
    a11yCapturePhoto: 'Sawwar el fatoura',
    a11yCapturedPhoto: 'Sooret el fatoura',
  },

  extracted: {
    title: 'Raga3 el fatura',
    subtitle: 'Dos 3ala ay 7aga shaklaha ghalat.',
    checkYourPhotos: 'Raga3 soarak',
    quantity: 'El 3adad',
    addItemPlaceholder: 'Delivery, elakh',
    pricePlaceholder: '0.00',
    addedItemsNote: 'El 7agat elly betdayefha (zay el delivery) betetesem bel tasawi 3ala el kol.',
    a11yItemName: 'Esm el senf {index}',
    a11yItemPrice: 'Se3r el senf {index} bel geneh',
    a11yQuantityToggle: 'Ghayar 3adad {item}',
    a11yItemQuantity: '3adad {item}',
    priceUnreadableShort: 'Ma2derneesh ne2ra el se3r da.',
    backToCamera: 'Rago3 lel kamera',
    noExtractedItems: 'Mafeesh asnaf ne3redha.',
    priceUnreadable: 'Ma2derneesh ne2ra el se3r da — sebna el 2eema el 2adeema.',
    errNeedName: 'Ektob el esm el awel.',
    a11yNewItemName: 'Esm el senf el gedeed',
    a11yNewItemPrice: 'Se3r el senf el gedeed bel geneh',
    a11yAddItem: 'Dayef senf',
    a11yContinueAssignment: 'Kammel lel tawzee3',
    a11yReceiptPhoto: 'Soret el fatura {index}',
    a11yBackToCamera: 'Rago3 lel kamera',
  },

  taxService: {

    discount: 'Khasm',
    tax: 'Dareeba',
    service: 'Khedma',
    otherService: 'Khedma tanya',
    subtotal: 'El maghmou3',
    total: 'El egmaly',
    off: 'ma2foul',
    valueUnreadable: 'Ma2derneesh ne2ra da — sebna el 2eema el 2adeema.',
    rateUnreadable: 'Ma2derneesh ne2ra el nesba di — sebna el 2eema el 2adeema.',
    a11yDiscountToggle: 'Feeh khasm 3ala el fatoura di',
    a11yDiscountPercentMode: 'El khasm bel nesba el me2aweya',
    a11yDiscountFlatMode: 'El khasm mablagh sabet bel geneh',
    a11yDiscountRate: 'Nesbet el khasm',
    a11yDiscountFlat: 'Mablagh el khasm bel geneh',
    a11yTaxToggle: 'Feeh dareeba 3ala el fatoura di',
    a11yTaxRate: 'Nesbet el dareeba',
    a11yServiceToggle: 'Feeh khedma 3ala el fatoura di',
    a11yServiceRate: 'Nesbet el khedma',
    a11yOtherServiceToggle: 'Feeh khedma tanya 3ala el fatoura di',
    a11yOtherServiceRate: 'Nesbet el khedma el tanya',
  },

  assignment: {
    title: 'Meen akal eh?',
    addPersonPlaceholder: 'Dayef 7ad',
    everyoneHadEverything: 'El kol akal kol 7aga',
    a11yEveryoneHadEverything: 'Wazza3 kol el asnaf 3ala el kol',
    everyone: 'El kol',
    unassigned: 'Lessa',
    addPersonFirst: 'Dayef 7ad fo2 el awel 3ashan tewazza3 el senf da.',
    groupNote:
      'Betwazza3 el asnaf 3ala a3daa el group di. 3ashan tedayef 7ad gedeed, e3zemo men shashet el group w ebda2 el masrouf tany.',
    whoPaid: 'Meen elly dafa3?',
    progress: '{assigned} men {total}',
    onlyUnassigned: 'Elly lessa',
    allAssignedFiltered: 'Kol 7aga etwazza3et — e2fel el filter 3ashan teshoof el fatoura kolaha.',
    setAmounts: '7add el kammeya',
    hideAmounts: 'Ekhfy el kammeya',
    howManyEach: 'Kol wa7ed khad kam?',
    eachAmount: '{amount} lel wa7ed',
    eachAmountApprox: '≈{amount} lel wa7ed',
    sharedEvenly: 'Metasme3 bel tasawi.',
    allCounted: 'El {count} kolohom met7asbeen.',
    someCounted: '{counted} men {total} met7asbeen — el ba2y hayetesem be nafs el nesba.',
    overCounted: '7asabt {counted} wel fatoura feeha {total} — el ta2seem mashy 3ala el ar2am di.',
    nothingToAssign: 'Mafeesh 7aga tewazza3ha lessa.',
    errNeedPerson: 'Dayef shakhs wa7ed 3ala el a2al 2abl ma tkammel.',
    errNeedName: 'Ektob el esm el awel.',
    errNeedPayer: 'Ekhtar meen elly dafa3 2abl ma tkammel.',
    errUnassignedFiltered: {
      one: 'Feeh senf lessa me7tag 7ad — mewarrehoulak law7do.',
      two: 'Feeh senfeen lessa me7tageen 7ad — mewarrehomlak bas.',
      few: 'Feeh {count} asnaf lessa me7tageen 7ad — mewarrehomlak bas.',
      many: 'Feeh {count} senf lessa me7tageen 7ad — mewarrehomlak bas.',
      other: 'Feeh {count} senf lessa me7tageen 7ad — mewarrehomlak bas.',
    },
    errUnassigned: {
      one: 'Feeh senf lessa me7tag 7ad — me3allem bel a7mar.',
      two: 'Feeh senfeen lessa me7tageen 7ad — me3allemeen bel a7mar.',
      few: 'Feeh {count} asnaf lessa me7tageen 7ad — me3allemeen bel a7mar.',
      many: 'Feeh {count} senf lessa me7tageen 7ad — me3allemeen bel a7mar.',
      other: 'Feeh {count} senf lessa me7tageen 7ad — me3allemeen bel a7mar.',
    },
    a11yAssignTo: 'Wazza3 {item} 3ala {person}',
    a11yAssignEveryone: 'Wazza3 {item} 3ala el kol',
    a11yRemoveEveryone: 'Sheel el kol men {item}',
    a11ySetAmounts: '7add kammeyet kol wa7ed fe {item}',
    a11yDoneAmounts: 'Khalast ta7deed el kammeyat fe {item}',
    a11yShareFor: 'Naseeb {person} men {item}',
    a11yPersonPaid: '{person} dafa3',
    a11yAddPerson: 'Dayef shakhs',
    a11yNewPersonName: 'Esm el shakhs el gedeed',
    a11yOnlyUnassigned: 'Warreeny elly lessa me7tag 7ad bas',
    a11yBackToTax: 'Rago3 lel dareeba wel khedma',
    a11yContinueBreakdown: 'Kammel lel ta2seem el neha2y',
  },

  reconcile: {
    matchesReceipt: 'Matabe2 lel fatoura',
    doesntMatchReceipt: 'Mesh matabe2 lel fatoura',
    reconciliationDetail: '7asabna {computed} EGP wel maktoub {printed} EGP (far2 {diff} EGP).',
    noPrintedTotal: 'Mafish egmaly maktoub 3ala el fatoura — mesh han2dar nraga3 3aleh automatic.',
  },

  final: {
    title: 'El 7esab',
    complete: 'Tamam',
    shareBreakdown: 'Eb3at el 7esab',
    startNew: 'Ebda2 7esab gedeed',
    includesShare: 'Shamel naseebo men el dareeba wel khedma',
    includesDiscount: 'Shamel naseebo men el khasm',
    noItems: 'Mafeesh asnaf',
    postToGroup: 'Eb3atha le {group}',
    submitFailed: 'Ma2derneesh neb3atha le {group} — mafeesh 7aga etsagelet fe 7esab el group.',
    submitRetry: 'Garrab teb3atha tany',
    submitting: 'Beneb3atha…',
    posted: 'Etba3atet le {group}',
    nothingToShow: 'Mafeesh 7aga ne3redha lessa.',
    sessionExpired: 'El session entahet 2abl ma da yeteh7efez fel group — sagel dokhool tany w edkhol el masrouf men el awel.',
    a11yShare: 'Eb3at el 7esab',
    a11yStartNew: 'Ebda2 7esab gedeed',
    a11yBackToAssignment: 'Rago3 le tawzee3 el asnaf',
  },

  summary: {
    receiptPhoto: 'Sooret el fatoura',
    receiptPhotoIndexed: 'Sooret el fatoura {index} men {total}',
    withRate: '{label} · {rate}%',
    disabled: '{label} (ma2foul)',
    includesShareOf: 'Shamel naseebo men {charges}',
    noCharges: 'Mafeesh dareeba wala khedma wala khedma tanya 3ala el fatoura di — bas naseebo men el asnaf',
    chargeDiscount: 'el khasm',
    chargeTax: 'el dareeba',
    chargeService: 'el khedma',
    chargeOtherService: 'el khedma el tanya',
    listAnd: 'w',
  },

  share: {
    title: 'El 7esab — asemly',
    dialogTitle: 'Eb3at el 7esab',
    personLine: '{name}: {amount} EGP ({items})',
    discountLine: 'Khasm: -{amount} EGP',
    otherServiceLine: 'Khedma tanya: {amount} EGP',
    totalLine: 'El egmaly: {amount} EGP',
  },

  extractionFailed: {
    title: 'Ma2derneesh ne2ra el fatoura di',
    retry: 'Garrab tany',
    enterManually: 'Ektob el asnaf be eedak',
    succeededUnexpectedly: 'El 2eraaya negi7et fe3lan — el shasha di malhash lezma. Garrab tany.',
    noPlausibleItems: 'Mala2enash asnaf wad7a fel soura di.',
    a11yRetry: 'Garrab be soura gedeeda',
    a11yEnterManually: 'Ektob el asnaf be eedak',
  },

  manualEntry: {
    title: 'Edkhal yadawy',
    notBuiltYet: 'El edkhal el yadawy lessa mesh gahez — delwa2ty sawwar tany aw egma3 el fatoura be eedak fel marra di.',
    backToCamera: 'Rago3 lel kamera',
    a11yBackToCamera: 'Rago3 lel kamera',
  },

  errors: {
    unreadableResponse: 'Khedmet el 2eraaya ba3atet 7aga mesh mafhouma.',
    upstream: '7aslet moshkela fe khedmet el 2eraaya — garrab tany.',
    unreadablePrice: 'Feeh se3r fel fatoura ma2derneesh ne2rah.',
    unreachable: 'Ma2derneesh newsal le khedmet el 2eraaya.',
    malformed: 'Rad khedmet el 2eraaya mesh mafhoum.',
    truncated: 'El 2eraaya et2ata3et — yemken el fatoura feeha asnaf keteer.',
    notConfigured: 'Khedmet el 2eraaya mesh metzabata.',
    unreadableImage: 'Ma2derneesh ne2ra el soura.',
    noImage: 'Mafeesh soura weselet.',
    tooManyImages: 'Soar keteer — {max} be 7ad a2sa fel marra.',
    noItemsFound: 'Ma2derneesh ne2ra el fatoura di',
    unknown: '7asal khata2. Garrab tany.',
    retry: 'Garrab tany',
  },
};
