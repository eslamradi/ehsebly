/**
 * Fails if a core-flow file still contains user-facing English.
 *
 * This exists because I twice declared the flow fully translated while it
 * wasn't. The first sweep only matched `>Some Text<` and quoted props, so it
 * missed strings passed as props (`label="Subtotal"`). The second added
 * quoted strings but only scanned `'...'` and `"..."`, so it missed both
 * template literals — where every composed charge label lived, which is how
 * "Service (off)" survived — and JSX text containing an expression, which is
 * how `Use These Photos ({n})` survived. Eyeballing greps clearly doesn't
 * converge; this checks all three shapes and runs with the other suites.
 *
 * Run with: `npx tsx client/scripts/verifyNoHardcodedCopy.ts`
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CORE_FILES = [
  'screens/HomeScreen.tsx',
  'screens/CasualSplitScreen.tsx',
  'screens/CaptureScreen.tsx',
  'screens/ExtractedItemsScreen.tsx',
  'screens/TaxServiceScreen.tsx',
  'screens/ItemAssignmentScreen.tsx',
  'screens/ReviewScreen.tsx',
  'screens/FinalSplitScreen.tsx',
  'screens/ExtractionFailedScreen.tsx',
  'screens/ManualEntryScreen.tsx',
  'components/SplitSummary.tsx',
  'components/PersonChip.tsx',
  'components/ShareableSplit.tsx',
  'components/LanguagePicker.tsx',
  'domain/share.ts',
];

/** react-navigation route names — identifiers, never shown to anyone. */
const ROUTE_NAMES = new Set([
  'Home', 'CasualSplit', 'Capture', 'ExtractedItems', 'ExtractionFailed', 'ManualEntry', 'TaxService',
  'ItemAssignment', 'Review', 'FinalSplit', 'History', 'HistoryDetail', 'EmailEntry', 'OtpVerify',
  'GroupList', 'Account', 'CreateGroup', 'GroupDetail', 'ExpenseDetail', 'ExpenseEdit', 'InviteMember', 'SettleUp',
]);

/** Style/RN enum values and other non-copy strings that legitimately read as words. */
const NON_COPY = new Set([
  'row', 'column', 'center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'none', 'auto',
  'left', 'right', 'button', 'tab', 'tablist', 'image', 'text', 'default', 'decimal-pad', 'numeric',
  'done', 'next', 'handled', 'always', 'never', 'on-drag', 'padding', 'height', 'position', 'cover',
  'contain', 'png', 'image/png', 'transparent', 'small', 'large',
]);

/**
 * Deliberate exceptions, each with the reason it is not translatable.
 * A bare string here is matched anywhere in the core set.
 */
const ALLOWED: Array<[string, string]> = [
  ['ehsebly logo', 'brand name, identical in every language'],
  ['Expense breakdown', 'stored on the group ledger — translating per sender would give members different text for one expense'],
  ['ehsebly', 'brand name'],
];

let failures = 0;
let checked = 0;

function isCopy(value: string): boolean {
  const withoutInterpolation = value.replace(/\$\{[^}]*\}/g, '').trim();
  if (withoutInterpolation.length < 3) return false;
  if (ROUTE_NAMES.has(value.trim()) || NON_COPY.has(value.trim())) return false;
  if (ALLOWED.some(([text]) => value.includes(text))) return false;
  // Needs at least two consecutive letters and a space, or a capitalised word —
  // i.e. it reads as prose rather than an identifier, path or format token.
  if (!/[A-Za-z]{3,}/.test(withoutInterpolation)) return false;
  if (/^[a-z][A-Za-z0-9]*$/.test(withoutInterpolation)) return false; // camelCase identifier
  if (withoutInterpolation.startsWith('http') || withoutInterpolation.includes('://')) return false;
  if (/^[\w.-]+\.(jpg|png|ts|tsx)$/.test(withoutInterpolation)) return false;
  return / /.test(withoutInterpolation) || /^[A-Z]/.test(withoutInterpolation);
}

for (const relative of CORE_FILES) {
  const path = join('app', relative);
  const lines = readFileSync(path, 'utf8').split('\n');
  let inBlockComment = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      return;
    }
    // `{/*` as well as `/*` — a multi-line JSX comment is still a comment, and
    // prose inside one was being reported as hardcoded copy.
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (/^\s*import\b/.test(line) || /from '/.test(line)) return;

    const hits: string[] = [];
    // 1. Quoted strings — props and plain values.
    for (const match of line.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) hits.push(match[2]);
    // 2. Template literals — where composed labels hid.
    for (const match of line.matchAll(/`([^`]*)`/g)) hits.push(match[1]);

    // The JSX-text patterns key off a bare `>`, which TypeScript also uses for
    // generics (`=> Promise<void>`) and comparison (`w > MAX ? [`). Those
    // produce fragments that read like prose to the checker, so text captured
    // this way additionally has to look like a sentence rather than code.
    // A spaced ` ? ` is a ternary; a trailing `?` is a question, and "How many
    // each?" is real copy — so the two must not be conflated.
    const looksLikeCode = (value: string) => /\s\?\s|[[\]`]|=>|\.\w+\(/.test(value);
    const jsxHits: string[] = [];
    // 3. JSX text alongside an expression, e.g. `>Use These Photos ({n})<`.
    for (const match of line.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*\{/g)) jsxHits.push(match[1]);
    // 4. Plain JSX text.
    for (const match of line.matchAll(/>\s*([A-Za-z][^<>{}]{2,}?)\s*</g)) jsxHits.push(match[1]);
    for (const value of jsxHits) {
      if (!looksLikeCode(value) && / /.test(value.trim())) hits.push(value);
    }

    for (const value of hits) {
      checked++;
      if (isCopy(value)) {
        failures++;
        console.error(`FAIL: ${relative}:${index + 1} hardcoded copy — ${JSON.stringify(value.slice(0, 70))}`);
      }
    }
  });
}

if (failures > 0) {
  console.error(`\n${failures} hardcoded string(s) found across ${CORE_FILES.length} core files.`);
  process.exit(1);
} else {
  console.log(`\nNo hardcoded copy in ${CORE_FILES.length} core files (${checked} strings inspected).`);
  process.exit(0);
}
