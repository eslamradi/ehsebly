import { useMemo } from 'react';
import { I18nManager, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { useI18n } from './i18n';
import { containsArabicScript } from './i18n/script';

/**
 * Shared design tokens — "a ledger, not a form": warm paper instead of
 * stark white, ink-black text, a serif header the way a printed receipt
 * banner reads, and tabular monospace for every money figure. One accent
 * (ledger teal) carries every primary action instead of the flat #1a1a1a
 * used everywhere before. Light and dark variants both defined here;
 * `useTheme()` below picks one based on the OS setting (app.json's
 * userInterfaceStyle is "automatic" so the app actually follows it).
 */
export type ThemeColors = {
  paper: string;
  paperRaised: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  line: string;
  critical: string;
  criticalSoft: string;
  positive: string;
  positiveSoft: string;
};

// Organic — the design system from the redesign doc. Warm cream ground,
// terracotta accent, olive for the positive state. Sampled from the rendered
// prototype rather than transcribed, so these are the values that actually
// shipped in it.
const lightColors: ThemeColors = {
  paper: '#F5EAD8',
  paperRaised: '#F9F4ED',
  ink: '#201E1D',
  inkSoft: '#645C50',
  inkFaint: '#A19786',
  accent: '#C67139',
  accentSoft: '#FFE1D0',
  // The accent is mid-toned, so its foreground is the cream ground rather
  // than white — white on terracotta is the weaker contrast of the two.
  accentInk: '#F5EAD8',
  line: '#D9CFBC',
  critical: '#A33C22',
  criticalSoft: '#FFE1D0',
  positive: '#56633F',
  positiveSoft: '#E1EECC',
};

// Organic is a light-only system, so the dark values are derived from its
// own ramps rather than invented: the neutral ramp read from the dark end,
// and the lighter accent steps, which are the ones that hold up on ink.
const darkColors: ThemeColors = {
  paper: '#201E1D',
  paperRaised: '#2E2B25',
  ink: '#F5EAD8',
  inkSoft: '#C0B6A5',
  inkFaint: '#82796A',
  accent: '#F6A06B',
  accentSoft: '#402310',
  accentInk: '#201E1D',
  line: '#474238',
  critical: '#F6A06B',
  criticalSoft: '#402310',
  positive: '#AEBF92',
  positiveSoft: '#272E1B',
};

// Bundled via expo-font (see App.tsx's useFonts call) rather than system
// font names — Georgia/system-serif looks wildly different (and not
// particularly "premium") between iOS and Android, whereas these render
// identically everywhere. Caprasimo for headings, Figtree for UI text, and
// IBM Plex Mono for every money figure.
// Organic pairs Caprasimo — a single-weight display face — with Figtree for
// everything else. Caprasimo has one weight, so both heading slots point at
// it; the distinction the old Fraunces pair carried is gone by design.
//
// Money keeps IBM Plex Mono. The prototype set amounts in Figtree, but a
// proportional face makes a column of figures fail to line up, and a
// per-person breakdown is read as a column. Tabular figures win here.
export const fonts = {
  headingSemiBold: 'Caprasimo_400Regular',
  headingBold: 'Caprasimo_400Regular',
  sansRegular: 'Figtree_400Regular',
  sansMedium: 'Figtree_500Medium',
  sansSemiBold: 'Figtree_600SemiBold',
  sansBold: 'Figtree_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
  monoBold: 'IBMPlexMono_700Bold',
} as const;

/** Widened off `fonts`'s keys — `as const` would pin each value to the Latin family name. */
export type FontSet = Record<keyof typeof fonts, string>;

/**
 * Fraunces and Manrope are Latin-only — Arabic text set in either falls back
 * to whatever the OS picks, which loses the app's voice on every screen and
 * differs between iOS and Android. IBM Plex Sans Arabic carries the whole
 * script and is the sibling of the IBM Plex Mono already used for money, so
 * the pairing stays deliberate rather than accidental.
 *
 * Fraunces has no Arabic counterpart at all, so headings fall to the Plex
 * Arabic bold weights: the serif display voice simply doesn't survive the
 * script change, and faking it with a mismatched face would look worse than
 * a clean weight contrast.
 *
 * The mono entries are untouched. Money renders in Western digits in every
 * locale (see en.ts), so the ledger column keeps its tabular figures.
 *
 * Franco needs none of this — it's Egyptian Arabic in Latin script, so it
 * uses the Latin set exactly as English does.
 */
export const arabicFonts: FontSet = {
  headingSemiBold: 'IBMPlexSansArabic_600SemiBold',
  headingBold: 'IBMPlexSansArabic_700Bold',
  sansRegular: 'IBMPlexSansArabic_400Regular',
  sansMedium: 'IBMPlexSansArabic_500Medium',
  sansSemiBold: 'IBMPlexSansArabic_600SemiBold',
  sansBold: 'IBMPlexSansArabic_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
  monoBold: 'IBMPlexMono_700Bold',
};

/**
 * React Native's `textAlign` only accepts physical values — there is no
 * logical `end` the way there is for padding/border — so a money column set
 * to 'right' would hug the wrong edge once Arabic mirrors the layout. Read
 * once at module scope because `I18nManager.isRTL` can only change across an
 * app reload, which is exactly what switching to or from Arabic triggers.
 */
export const textAlignEnd: TextStyle['textAlign'] = I18nManager.isRTL ? 'left' : 'right';

/**
 * Font override for text the *user* supplied rather than copy we wrote —
 * receipt item names, people's names. Spread it after a base style:
 *
 *   <Text style={[styles.itemName, userTextStyle(item.name, 'sansSemiBold', theme.fonts)]}>
 *
 * The locale's own face is wrong for this content, because the content's
 * script has nothing to do with the interface language: an Arabic receipt
 * read in the English or Franco UI would be set in Manrope, which cannot
 * draw a single Arabic glyph. See `i18n/script.ts`.
 */
export function userTextStyle(text: string, weight: keyof FontSet, localeFonts: FontSet): TextStyle {
  return { fontFamily: containsArabicScript(text) ? arabicFonts[weight] : localeFonts[weight] };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Organic rounds hard: cards at 26, and every small control a full pill.
export const radii = {
  sm: 12,
  md: 26,
  lg: 32,
  pill: 999,
} as const;

/**
 * Soft elevation shadow for raised cards/rows. Drop shadows don't read
 * against a dark background (they'd need to glow lighter, not cast
 * darker), so dark mode substitutes a thin hairline border for the same
 * "this is a raised surface" cue instead of a shadow that would be
 * invisible.
 */
function makeCardShadow(colors: ThemeColors, isDark: boolean): ViewStyle {
  if (isDark) {
    return { borderWidth: 1, borderColor: colors.line };
  }
  return {
    shadowColor: '#2A251C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  };
}

function makeScreenStyles(colors: ThemeColors, insets: EdgeInsets, f: FontSet) {
  return {
    container: { flex: 1, backgroundColor: colors.paper } as ViewStyle,
    // Screens don't render behind a native header (screenOptions sets
    // headerShown: false everywhere), so nothing else pushes content below
    // the notch/status bar or above the home indicator — bake the device's
    // safe-area insets into the shared padding rather than a flat constant,
    // or content renders under the iPhone clock/Dynamic Island (found in
    // the field).
    content: {
      paddingTop: spacing.xl + insets.top,
      paddingBottom: spacing.xl + insets.bottom,
      paddingHorizontal: spacing.xl,
      gap: spacing.lg,
    } as ViewStyle,
    center: {
      flex: 1,
      backgroundColor: colors.paper,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: spacing.xl + insets.top,
      paddingBottom: spacing.xl + insets.bottom,
      paddingHorizontal: spacing.xl,
      gap: spacing.lg,
    } as ViewStyle,
    heading: {
      fontFamily: f.headingSemiBold,
      fontSize: 22,
      color: colors.ink,
    } as TextStyle,
    subheading: { fontFamily: f.sansRegular, fontSize: 14, color: colors.inkSoft } as TextStyle,
    message: { fontFamily: f.sansRegular, textAlign: 'center', fontSize: 16, color: colors.ink } as TextStyle,
    mono: { fontFamily: f.monoRegular } as TextStyle,
  };
}

function makeButtonStyles(colors: ThemeColors, f: FontSet) {
  return {
    primary: {
      backgroundColor: colors.accent,
      paddingVertical: 16,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.md,
      alignItems: 'center',
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 4,
    } as ViewStyle,
    primaryText: { fontFamily: f.headingSemiBold, color: colors.accentInk, fontSize: 15 } as TextStyle,
    secondary: {
      backgroundColor: colors.paperRaised,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 16,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.md,
      alignItems: 'center',
    } as ViewStyle,
    secondaryText: { fontFamily: f.headingSemiBold, color: colors.ink, fontSize: 15 } as TextStyle,
    disabled: { opacity: 0.45 } as ViewStyle,
  };
}

/** Small uppercase status pill — e.g. reconciliation match/mismatch, error banners. */
function makePillStyle(colors: ThemeColors, tone: 'positive' | 'critical'): ViewStyle {
  return {
    backgroundColor: tone === 'positive' ? colors.positiveSoft : colors.criticalSoft,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  };
}
function makePillTextStyle(colors: ThemeColors, tone: 'positive' | 'critical', f: FontSet): TextStyle {
  return {
    fontFamily: f.sansBold,
    color: tone === 'positive' ? colors.positive : colors.critical,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  };
}

export type Theme = {
  isDark: boolean;
  colors: ThemeColors;
  insets: EdgeInsets;
  cardShadow: ViewStyle;
  /** Resolved for the active locale — Arabic swaps in IBM Plex Sans Arabic. */
  fonts: FontSet;
  screenStyles: ReturnType<typeof makeScreenStyles>;
  buttonStyles: ReturnType<typeof makeButtonStyles>;
  pillStyle: (tone: 'positive' | 'critical') => ViewStyle;
  pillTextStyle: (tone: 'positive' | 'critical') => TextStyle;
};

/**
 * Resolves the live theme from the OS color-scheme setting, plus this
 * device's safe-area insets — call at the top of every screen. Requires a
 * `SafeAreaProvider` up the tree (wired in App.tsx).
 */
export function useTheme(): Theme {
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  // Organic is a light system. Following the OS scheme meant anyone on a dark
  // phone saw a derived palette nobody designed — cream and terracotta became
  // brown on near-black, which is not the app the design describes. Until
  // there is a dark palette drawn on purpose, the app is light.
  const isDark = false;
  const colors = lightColors;
  // Franco is Latin script, so only Arabic swaps the typeface.
  const activeFonts = locale === 'ar' ? arabicFonts : fonts;
  return useMemo(
    () => ({
      isDark,
      colors,
      insets,
      fonts: activeFonts,
      cardShadow: makeCardShadow(colors, isDark),
      screenStyles: makeScreenStyles(colors, insets, activeFonts),
      buttonStyles: makeButtonStyles(colors, activeFonts),
      pillStyle: (tone: 'positive' | 'critical') => makePillStyle(colors, tone),
      pillTextStyle: (tone: 'positive' | 'critical') => makePillTextStyle(colors, tone, activeFonts),
    }),
    [colors, isDark, activeFonts, insets.top, insets.bottom, insets.left, insets.right],
  );
}
