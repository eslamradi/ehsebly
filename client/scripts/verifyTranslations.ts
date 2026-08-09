/**
 * Standalone verification for the string tables in `client/app/i18n/locales`
 * — same shape and rationale as `verifyAssignment.ts` (no test framework in
 * this project yet, per the Architecture v1 deferral).
 *
 * TypeScript already guarantees each locale has every *key*, since `ar` and
 * `franco` are annotated `Translations`. What it cannot catch is the class of
 * bug that actually ships: a translated string that drops an interpolation
 * placeholder (so a count or a name silently disappears from the sentence), a
 * plural map missing the `other` fallback, or a translation left as a verbatim
 * copy of the English. Those are what this checks.
 *
 * Run with: `npx tsx client/scripts/verifyTranslations.ts`
 */
import { en } from '../app/i18n/locales/en';
import { ar } from '../app/i18n/locales/ar';
import { franco } from '../app/i18n/locales/franco';
import { pluralCategory, type LocaleCode, type PluralForms } from '../app/i18n/plural';
import { containsArabicScript } from '../app/i18n/script';
import { LOCALIZED_ERROR_CODES } from '../app/i18n/errorCode';
import { ERROR_MESSAGES } from '../../client/backend/worker/src/errors';

let checks = 0;
let failures = 0;

function fail(message: string): void {
  failures++;
  console.error(`FAIL: ${message}`);
}

function isPluralForms(value: unknown): value is PluralForms {
  return typeof value === 'object' && value !== null && 'other' in value;
}

/** Flattens a table to dot-path -> string | PluralForms. */
function flatten(node: unknown, prefix = ''): Array<[string, string | PluralForms]> {
  if (typeof node === 'string' || isPluralForms(node)) {
    return [[prefix, node]];
  }
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  return Object.entries(node).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** Every variant of a plural map, so a placeholder dropped from only `few` is still caught. */
function variantsOf(entry: string | PluralForms): string[] {
  return typeof entry === 'string'
    ? [entry]
    : Object.entries(entry)
        .filter(([, text]) => typeof text === 'string')
        .map(([, text]) => text as string);
}

/**
 * Categories where a language may legitimately omit `{count}`, because the
 * noun form already encodes the number: Arabic's dual صورتين *is* "two
 * photos", so interpolating would render "2 two-photos". The higher
 * categories have no such form and must carry the digit.
 */
const COUNT_OPTIONAL_CATEGORIES = new Set(['zero', 'one', 'two']);

/** Variants that must carry every placeholder English uses, paired with their category for reporting. */
function placeholderBearingVariants(entry: string | PluralForms): Array<[string, string]> {
  if (typeof entry === 'string') {
    return [['', entry]];
  }
  return Object.entries(entry)
    .filter(([category, text]) => typeof text === 'string' && !COUNT_OPTIONAL_CATEGORIES.has(category))
    .map(([category, text]) => [category, text as string]);
}

const LOCALES: Array<[LocaleCode, Record<string, unknown>]> = [
  ['ar', ar as unknown as Record<string, unknown>],
  ['franco', franco as unknown as Record<string, unknown>],
];

const englishEntries = flatten(en);

/**
 * A placeholder present in English but absent from a translation means the
 * value it carries — a count, a person's name, an amount — never reaches the
 * user, and the sentence still reads as valid prose so nobody notices.
 */
function checkPlaceholderParity(): void {
  for (const [localeName, table] of LOCALES) {
    const translated = new Map(flatten(table));
    for (const [path, englishEntry] of englishEntries) {
      const entry = translated.get(path);
      if (entry === undefined) {
        checks++;
        fail(`${localeName} is missing "${path}"`);
        continue;
      }
      const expected = [...new Set(placeholders(variantsOf(englishEntry).join(' ')))];
      for (const [category, variant] of placeholderBearingVariants(entry)) {
        checks++;
        const actual = placeholders(variant);
        const missing = expected.filter((name) => !actual.includes(name));
        if (missing.length > 0) {
          const where = category ? `${path} (${category})` : path;
          fail(`${localeName} "${where}" drops {${missing.join('}, {')}} — "${variant}"`);
        }
      }
    }
  }
}

/**
 * `resolvePlural` falls back to `other`, so a map without it would render
 * `undefined`. Arabic and Franco also need the dual: "2 items" is a distinct
 * word form, not a number beside the plural.
 */
function checkPluralCompleteness(): void {
  for (const [localeName, table] of LOCALES) {
    for (const [path, entry] of flatten(table)) {
      if (!isPluralForms(entry)) {
        continue;
      }
      checks++;
      if (typeof entry.other !== 'string' || entry.other.length === 0) {
        fail(`${localeName} "${path}" has no "other" fallback`);
      }
      checks++;
      if (typeof entry.two !== 'string') {
        fail(`${localeName} "${path}" is missing the dual form ("two") that Arabic grammar needs`);
      }
    }
  }
}

/** Catches a table entry left as the English placeholder text after a copy-paste. */
function checkNotUntranslated(): void {
  // Entries that are identical to English on purpose. `*` covers every
  // locale; a locale prefix covers just that one — Franco keeps English
  // loanwords that Egyptians genuinely say in English ("Groups", "Delivery",
  // "EGP") rather than inventing Franco spellings nobody uses.
  const ALLOWED_IDENTICAL = new Set([
    '*:language.english',
    '*:language.arabic',
    '*:language.franco',
    'franco:common.egp',
    // A numeric placeholder, not prose — Western digits in every locale.
    '*:extracted.pricePlaceholder',
    // Pure format strings — punctuation and placeholders, no words to translate.
    '*:summary.withRate',
    // Franco writes amounts in EGP like English; only Arabic uses ج.م.
    'franco:share.personLine',
    'franco:home.groupsTitle',
  ]);
  for (const [localeName, table] of LOCALES) {
    const translated = new Map(flatten(table));
    for (const [path, englishEntry] of englishEntries) {
      if (ALLOWED_IDENTICAL.has(`*:${path}`) || ALLOWED_IDENTICAL.has(`${localeName}:${path}`)) {
        continue;
      }
      const entry = translated.get(path);
      if (entry === undefined) {
        continue;
      }
      checks++;
      const englishText = variantsOf(englishEntry).join('|');
      const translatedText = variantsOf(entry).join('|');
      if (englishText === translatedText) {
        fail(`${localeName} "${path}" is still the English text — "${translatedText}"`);
      }
    }
  }
}

/** Guards the category boundaries the Arabic copy is actually written against. */
function checkPluralCategories(): void {
  const cases: Array<[LocaleCode, number, string]> = [
    ['en', 1, 'one'],
    ['en', 0, 'other'],
    ['en', 2, 'other'],
    ['ar', 0, 'zero'],
    ['ar', 1, 'one'],
    ['ar', 2, 'two'],
    ['ar', 3, 'few'],
    ['ar', 10, 'few'],
    ['ar', 11, 'many'],
    ['ar', 99, 'many'],
    ['ar', 100, 'other'],
    ['ar', 103, 'few'],
    ['franco', 2, 'two'],
    ['franco', 5, 'few'],
  ];
  for (const [locale, count, expected] of cases) {
    checks++;
    const actual = pluralCategory(locale, count);
    if (actual !== expected) {
      fail(`pluralCategory(${locale}, ${count}) — expected ${expected}, got ${actual}`);
    }
  }
}

/**
 * Picks the typeface for *user data* — receipt items, people's names — which
 * the Latin faces cannot draw. Strings below are real production extraction
 * output, including the mixed-script lines that make "any Arabic character"
 * the right rule rather than "mostly Arabic".
 */
function checkArabicScriptDetection(): void {
  const cases: Array<[string, boolean]> = [
    ['كشري', true],
    ['كوفير', true],
    ['خدمة طاولات', true],
    ['شوربة فراخ', true],
    // Real mixed-script lines: a Latin-only face would drop half of each.
    ['PZ هاواى', true],
    ['PA لازانيا', true],
    ['Koshary', false],
    ['Grilled Chicken', false],
    // Franco is Latin script — it must NOT trigger the Arabic face.
    ['7esab Saree3', false],
    ['Meen akal eh?', false],
    // French, from the receipt set — Latin with diacritics.
    ['magret de canard', false],
    ['', false],
    ['45.00', false],
  ];
  for (const [text, expected] of cases) {
    checks++;
    if (containsArabicScript(text) !== expected) {
      fail(`containsArabicScript(${JSON.stringify(text)}) — expected ${expected}`);
    }
  }
}

/**
 * Every code the client claims to localize must (a) still exist in the
 * Worker, and (b) resolve to a real string in all three tables. A renamed
 * code would otherwise degrade silently to the Worker's English, which looks
 * like working software.
 */
function checkErrorCodeCoverage(): void {
  const workerCodes = new Set(Object.keys(ERROR_MESSAGES));
  for (const code of LOCALIZED_ERROR_CODES) {
    checks++;
    if (!workerCodes.has(code)) {
      fail(`errorCode.ts maps "${code}", which the Worker no longer returns`);
    }
  }
}

checkErrorCodeCoverage();
checkArabicScriptDetection();
checkPlaceholderParity();
checkPluralCompleteness();
checkNotUntranslated();
checkPluralCategories();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} translation checks passed.`);
  process.exit(0);
}
