/**
 * CLDR plural categories. English only distinguishes `one` from `other`;
 * Arabic uses five, including a dedicated dual — "2 items" is حاجتين, a
 * different word form entirely rather than a number beside a plural noun. A
 * `count === 1 ? singular : plural` ternary at the call site cannot express
 * that, which is why plural strings are category maps resolved here.
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type PluralForms = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

export type LocaleCode = 'en' | 'ar' | 'franco';

/**
 * Franco deliberately shares Arabic's rules: it *is* Egyptian Arabic, only
 * written in Latin script, so "2 7agat" needs the same dual form as حاجتين.
 */
export function pluralCategory(locale: LocaleCode, count: number): PluralCategory {
  if (locale === 'en') {
    return count === 1 ? 'one' : 'other';
  }
  // Arabic (and Franco), per CLDR.
  if (count === 0) return 'zero';
  if (count === 1) return 'one';
  if (count === 2) return 'two';
  const mod100 = count % 100;
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
}

/** Falls back through the categories rather than rendering an empty label if a locale omits one. */
export function resolvePlural(forms: PluralForms, locale: LocaleCode, count: number): string {
  const category = pluralCategory(locale, count);
  return forms[category] ?? forms.other;
}
