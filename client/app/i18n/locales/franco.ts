import type { Translations } from './en';

/**
 * Franco (Arabizi) — the same Egyptian colloquial Arabic as `ar.ts`, written
 * in Latin script with digits standing in for sounds Latin letters don't
 * cover. This is how a large share of Egyptians actually type, and the app's
 * own name is already Franco: ehsebly = احسبلي.
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
    casualTitle: '7esab Saree3',
    casualSubtitle: 'Men gheer tasgeel — sawwar el fatoura w 14% dareeba hatetes7eb sa7 3ala 12% khedma, automatic.',
    groupsTitle: 'Groups',
    groupsSubtitle: 'Beit aw re7la — 7esab mashy ma3ak. Saded be InstaPay aw Vodafone Cash aw cash.',
  },

  casual: {
    title: '7esab Saree3',
    subtitle: 'E7seb fatoura wa7da f kam daghta — men gheer tasgeel.',
    takePhoto: 'Sawwar',
    chooseFromGallery: 'Ekhtar men el soar',
    history: 'El segel',
    a11yTakePhoto: 'Sawwar el fatoura',
    a11yChooseFromGallery: 'Ekhtar soura men el studio',
    a11yHistory: 'E3red segel el 7esabat',
    a11yBackHome: 'Rago3 lel ra2eesiya',
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
    usePhotos: 'Kammel bel soar di ({count})',
    addAnotherCamera: 'Dayef soura tanya',
    addFromGallery: 'Dayef men el studio',
    retakeAll: 'Sawwar men el awel',
    grantCamera: 'ehsebly me7tag el kamera 3ashan tesawwar el fatoura.',
    grantCameraAction: 'Esma7 bel kamera',
    reading: 'Bene2ra el fatoura…',
  },

  extracted: {
    title: 'El asnaf',
    subtitle: 'Dos 3ala ay esm aw se3r law el 2eraaya ghalat.',
    quantity: 'El 3adad',
    addItemPlaceholder: 'Delivery, elakh',
    addedItemsNote: 'El 7agat elly betdayefha (zay el delivery) betetesem bel tasawi 3ala el kol.',
    backToCamera: 'Rago3 lel kamera',
  },

  taxService: {
    title: 'Dareeba w Khedma',
    discount: 'Khasm',
    tax: 'Dareeba',
    service: 'Khedma',
    otherService: 'Khedma tanya',
    subtotal: 'El maghmou3',
    total: 'El egmaly',
    off: 'ma2foul',
  },

  assignment: {
    title: 'Meen akal eh?',
    addPersonPlaceholder: 'Dayef 7ad',
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
    a11yContinueReview: 'Kammel lel moraga3a',
  },

  review: {
    title: 'Moraga3a',
    subtitle: 'Dos 3ala ay esm aw se3r law el 2eraaya ghalat.',
    matchesReceipt: 'MATABE2 LEL FATOURA',
    confirm: 'Akked el 7esab',
  },

  final: {
    title: 'El 7esab',
    complete: 'TAMAM',
    shareBreakdown: 'Eb3at el 7esab',
    startNew: 'Ebda2 7esab gedeed',
    includesShare: 'Shamel naseebo men el dareeba wel khedma',
    includesDiscount: 'Shamel naseebo men el khasm',
    noItems: 'Mafeesh asnaf',
  },

  errors: {
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
