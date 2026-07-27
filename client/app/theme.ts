import { useMemo } from 'react';
import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

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

function makeScreenStyles(colors: ThemeColors, insets: EdgeInsets) {
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
      fontFamily: fonts.headingSemiBold,
      fontSize: 22,
      color: colors.ink,
    } as TextStyle,
    subheading: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.inkSoft } as TextStyle,
    message: { fontFamily: fonts.sansRegular, textAlign: 'center', fontSize: 16, color: colors.ink } as TextStyle,
    mono: { fontFamily: fonts.monoRegular } as TextStyle,
  };
}

function makeButtonStyles(colors: ThemeColors) {
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
    primaryText: { fontFamily: fonts.sansBold, color: colors.accentInk, fontSize: 15 } as TextStyle,
    secondary: {
      backgroundColor: colors.paperRaised,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 16,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.md,
      alignItems: 'center',
    } as ViewStyle,
    secondaryText: { fontFamily: fonts.sansSemiBold, color: colors.ink, fontSize: 15 } as TextStyle,
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
function makePillTextStyle(colors: ThemeColors, tone: 'positive' | 'critical'): TextStyle {
  return {
    fontFamily: fonts.sansBold,
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
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return useMemo(
    () => ({
      isDark,
      colors,
      insets,
      cardShadow: makeCardShadow(colors, isDark),
      screenStyles: makeScreenStyles(colors, insets),
      buttonStyles: makeButtonStyles(colors),
      pillStyle: (tone: 'positive' | 'critical') => makePillStyle(colors, tone),
      pillTextStyle: (tone: 'positive' | 'critical') => makePillTextStyle(colors, tone),
    }),
    [colors, isDark, insets.top, insets.bottom, insets.left, insets.right],
  );
}
