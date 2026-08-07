import type { Translations } from './en';

/**
 * Egyptian colloquial Arabic (masri), not Modern Standard Arabic. The app's
 * voice is a friend working out a bill at the table, so this reads the way
 * people actually speak — "مين اكل ايه؟", not MSA's "من تناول ماذا؟".
 *
 * "Split" is avoided in English because Splitwise owns the word; that
 * constraint is a brand one and doesn't carry into Arabic, so the natural
 * قسّم / حساب vocabulary is used freely. The app's own name is a gift here:
 * احسبلي is ordinary Egyptian for "work it out for me", so the copy leans on
 * حساب throughout and reads as a native phrase rather than a translation.
 *
 * Digits stay Western (14%, not ١٤٪) throughout, not just for money. Egyptian
 * receipts, price tags and delivery apps print them that way, and mixing
 * Arabic-Indic prose numerals with Western ledger figures on the same screen
 * reads as two different documents. See en.ts's `common` note.
 */
export const ar: Translations = {
  common: {
    back: 'رجوع',
    continue: 'يلا',
    done: 'تمام',
    add: 'ضيف',
    egp: 'ج.م',
  },

  language: {
    label: 'اللغة',
    english: 'English',
    arabic: 'العربية',
    franco: 'Franco',
    switching: 'بنغيّر اللغة…',
    reopenPrompt: 'اقفل التطبيق وافتحه تاني علشان اللغة تتظبط.',
  },

  home: {
    tagline: 'احسب الفاتورة في كام ضغطة — من غير آلة حاسبة ولا تخمين في الضريبة.',
    casualTitle: 'حساب سريع',
    casualSubtitle: 'من غير تسجيل — صوّر الفاتورة و 14% ضريبة هتتحسب صح على 12% خدمة، أوتوماتيك.',
    groupsTitle: 'مجموعات',
    groupsSubtitle: 'بيت أو رحلة — حساب ماشي معاك. سدّد بإنستاباي أو فودافون كاش أو كاش.',
  },

  casual: {
    title: 'حساب سريع',
    subtitle: 'احسب فاتورة واحدة في كام ضغطة — من غير تسجيل.',
    takePhoto: 'صوّر',
    chooseFromGallery: 'اختار من الصور',
    history: 'السجل',
    a11yTakePhoto: 'صوّر الفاتورة',
    a11yChooseFromGallery: 'اختار صورة من الاستوديو',
    a11yHistory: 'اعرض سجل الحسابات',
    a11yBackHome: 'رجوع للرئيسية',
  },

  capture: {
    photoCount: {
      zero: 'مفيش صور',
      one: 'صورة واحدة',
      two: 'صورتين',
      few: '{count} صور',
      many: '{count} صورة',
      other: '{count} صورة',
    },
    usePhotos: 'كمّل بالصور دي ({count})',
    addAnotherCamera: 'ضيف صورة تانية',
    addFromGallery: 'ضيف من الاستوديو',
    retakeAll: 'صوّر من الأول',
    grantCamera: 'ehsebly محتاج الكاميرا علشان تصوّر الفاتورة.',
    grantCameraAction: 'اسمح بالكاميرا',
    reading: 'بنقرا الفاتورة…',
  },

  extracted: {
    title: 'الأصناف',
    subtitle: 'دوس على أي اسم أو سعر لو القراءة غلط.',
    quantity: 'العدد',
    addItemPlaceholder: 'توصيل، إلخ',
    addedItemsNote: 'الحاجات اللي بتضيفها (زي التوصيل) بتتقسم بالتساوي على الكل.',
    backToCamera: 'رجوع للكاميرا',
  },

  taxService: {
    title: 'الضريبة والخدمة',
    discount: 'خصم',
    tax: 'ضريبة',
    service: 'خدمة',
    otherService: 'خدمة تانية',
    subtotal: 'المجموع',
    total: 'الإجمالي',
    off: 'مقفول',
  },

  assignment: {
    title: 'مين اكل ايه؟',
    addPersonPlaceholder: 'ضيف حد',
    everyone: 'الكل',
    unassigned: 'لسه',
    addPersonFirst: 'ضيف حد فوق الأول علشان توزّع الصنف ده.',
    groupNote:
      'بتوزّع الأصناف على أعضاء المجموعة دي. علشان تضيف حد جديد، اعزمه من شاشة المجموعة وابدأ المصروف تاني.',
    whoPaid: 'مين اللي دفع؟',
    progress: '{assigned} من {total}',
    onlyUnassigned: 'اللي لسه',
    allAssignedFiltered: 'كل حاجة اتوزّعت — اقفل الفلتر علشان تشوف الفاتورة كلها.',
    setAmounts: 'حدّد الكميات',
    hideAmounts: 'اخفي الكميات',
    howManyEach: 'كل واحد اخد كام؟',
    eachAmount: '{amount} للواحد',
    eachAmountApprox: '≈{amount} للواحد',
    sharedEvenly: 'متقسّمة بالتساوي.',
    allCounted: 'الـ {count} كلهم متحسبين.',
    someCounted: '{counted} من {total} متحسبين — الباقي هيتقسم بنفس النسبة.',
    overCounted: 'حسبت {counted} والفاتورة فيها {total} — التقسيم ماشي على الأرقام دي.',
    nothingToAssign: 'مفيش حاجة توزّعها لسه.',
    errNeedPerson: 'ضيف شخص واحد على الأقل قبل ما تكمّل.',
    errNeedName: 'اكتب الاسم الأول.',
    errNeedPayer: 'اختار مين اللي دفع قبل ما تكمّل.',
    errUnassignedFiltered: {
      one: 'فيه صنف لسه محتاج حد — مورّيهولك لوحده.',
      two: 'فيه صنفين لسه محتاجين حد — مورّيهملك بس.',
      few: 'فيه {count} أصناف لسه محتاجين حد — مورّيهملك بس.',
      many: 'فيه {count} صنف لسه محتاجين حد — مورّيهملك بس.',
      other: 'فيه {count} صنف لسه محتاجين حد — مورّيهملك بس.',
    },
    errUnassigned: {
      one: 'فيه صنف لسه محتاج حد — معلّم بالأحمر.',
      two: 'فيه صنفين لسه محتاجين حد — معلّمين بالأحمر.',
      few: 'فيه {count} أصناف لسه محتاجين حد — معلّمين بالأحمر.',
      many: 'فيه {count} صنف لسه محتاجين حد — معلّمين بالأحمر.',
      other: 'فيه {count} صنف لسه محتاجين حد — معلّمين بالأحمر.',
    },
    a11yAssignTo: 'وزّع {item} على {person}',
    a11yAssignEveryone: 'وزّع {item} على الكل',
    a11yRemoveEveryone: 'شيل الكل من {item}',
    a11ySetAmounts: 'حدّد كمية كل واحد في {item}',
    a11yDoneAmounts: 'خلصت تحديد الكميات في {item}',
    a11yShareFor: 'نصيب {person} من {item}',
    a11yPersonPaid: '{person} دفع',
    a11yAddPerson: 'ضيف شخص',
    a11yNewPersonName: 'اسم الشخص الجديد',
    a11yOnlyUnassigned: 'ورّيني اللي لسه محتاج حد بس',
    a11yBackToTax: 'رجوع للضريبة والخدمة',
    a11yContinueReview: 'كمّل للمراجعة',
  },

  review: {
    title: 'مراجعة',
    subtitle: 'دوس على أي اسم أو سعر لو القراءة غلط.',
    matchesReceipt: 'مطابق للفاتورة',
    confirm: 'أكّد الحساب',
  },

  final: {
    title: 'الحساب',
    complete: 'تمام',
    shareBreakdown: 'ابعت الحساب',
    startNew: 'ابدأ حساب جديد',
    includesShare: 'شامل نصيبه من الضريبة والخدمة',
    includesDiscount: 'شامل نصيبه من الخصم',
    noItems: 'مفيش أصناف',
  },

  errors: {
    unreachable: 'مقدرناش نوصل لخدمة القراءة.',
    malformed: 'رد خدمة القراءة مش مفهوم.',
    truncated: 'القراءة اتقطعت — يمكن الفاتورة فيها أصناف كتير.',
    notConfigured: 'خدمة القراءة مش متظبطة.',
    unreadableImage: 'مقدرناش نقرا الصورة.',
    noImage: 'مفيش صورة وصلت.',
    tooManyImages: 'صور كتير — {max} بحد أقصى في المرة.',
    noItemsFound: 'مقدرناش نقرا الفاتورة دي',
    unknown: 'حصل خطأ. جرّب تاني.',
    retry: 'جرّب تاني',
  },
};
