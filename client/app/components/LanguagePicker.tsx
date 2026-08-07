import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LOCALE_ORDER, useI18n, type LocaleCode } from '../i18n';
import { radii, spacing, useTheme } from '../theme';

const LABEL_KEY: Record<LocaleCode, string> = {
  en: 'language.english',
  ar: 'language.arabic',
  franco: 'language.franco',
};

/**
 * A three-way segmented control. Each option is labelled in its own language
 * — العربية rather than "Arabic" — so it's legible to the person who needs it
 * without them first having to read English.
 *
 * Switching to or from Arabic changes writing direction, which React Native
 * can only apply on reload; `setLocale` handles that, and the fallback line
 * below covers dev clients where a programmatic reload isn't available.
 */
export function LanguagePicker() {
  const theme = useTheme();
  const { colors } = theme;
  const { locale, setLocale, needsReopen, t } = useI18n();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: spacing.sm },
        row: {
          flexDirection: 'row',
          backgroundColor: colors.paperRaised,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.pill,
          padding: 3,
          alignSelf: 'center',
        },
        segment: {
          minHeight: 36,
          justifyContent: 'center',
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.pill,
        },
        segmentActive: { backgroundColor: colors.accent },
        segmentText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.inkSoft },
        segmentTextActive: { color: colors.accentInk },
        note: { fontFamily: theme.fonts.sansRegular, fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
      }),
    [theme, colors],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityRole="tablist">
        {LOCALE_ORDER.map((code) => {
          const selected = code === locale;
          return (
            <Pressable
              key={code}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(LABEL_KEY[code])}
              style={[styles.segment, selected && styles.segmentActive]}
              onPress={() => setLocale(code)}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{t(LABEL_KEY[code])}</Text>
            </Pressable>
          );
        })}
      </View>
      {needsReopen && <Text style={styles.note}>{t('language.reopenPrompt')}</Text>}
    </View>
  );
}
