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

const lightColors: ThemeColors = {
  paper: '#FAF6EE',
  paperRaised: '#FFFFFF',
  ink: '#1C1B19',
  inkSoft: '#6B6558',
  inkFaint: '#A49C8A',
  accent: '#0E6B5C',
  accentSoft: '#DCEEE9',
  accentInk: '#FFFFFF',
  line: '#E4DCC8',
  critical: '#B23A2E',
  criticalSoft: '#F6E3E0',
  positive: '#3F8F5F',
  positiveSoft: '#E2F0E6',
};

const darkColors: ThemeColors = {
  paper: '#17181A',
  paperRaised: '#201F1C',
  ink: '#F3EFE4',
  inkSoft: '#9C9686',
  inkFaint: '#6B6558',
  accent: '#4FBFA6',
  accentSoft: '#1E3330',
  accentInk: '#0D201C',
  line: '#34322C',
  critical: '#E2685C',
  criticalSoft: '#3A2220',
  positive: '#5FC98A',
  positiveSoft: '#1C2E22',
};

// Bundled via expo-font (see App.tsx's useFonts call) rather than system
// font names — Georgia/system-serif looks wildly different (and not
// particularly "premium") between iOS and Android, whereas these render
// identically everywhere. Fraunces for headings (a display serif with real
// character, the receipt-banner voice), Manrope for everything else read as
// UI (body/labels/buttons — a clean, modern grotesk), IBM Plex Mono for
// every money figure (genuine tabular figures, a proper ledger feel).
export const fonts = {
  headingSemiBold: 'Fraunces_600SemiBold',
  headingBold: 'Fraunces_700Bold',
  sansRegular: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemiBold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
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

export const radii = {
  sm: 8,
  md: 14,
  lg: 16,
  pill: 100,
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
    primaryText: { fontFamily: f.sansBold, color: colors.accentInk, fontSize: 15 } as TextStyle,
    secondary: {
      backgroundColor: colors.paperRaised,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 16,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.md,
      alignItems: 'center',
    } as ViewStyle,
    secondaryText: { fontFamily: f.sansSemiBold, color: colors.ink, fontSize: 15 } as TextStyle,
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
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
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
