import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAccount } from '../domain/account';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/**
 * The app's true landing page — a chooser between two clearly separate
 * sections, each with its own data and screens (2026-07-30):
 * - Casual Splitting: the solo, no-account, single-receipt flow (Epic 1),
 *   saved to on-device History only. See CasualSplitScreen.
 * - Groups: signed-in, multi-person groups with a synced server-side
 *   ledger (Epic 2). See GroupListScreen (routes through EmailEntry first
 *   if not yet signed in).
 * Neither reads the other's data — a solo split never touches a group's
 * ledger and vice versa; FinalSplitScreen's `session.group` branch is the
 * only place that distinction is made.
 *
 * No separate "why ehsebly" pitch block (removed 2026-07-30, UI review) —
 * this screen is seen on every app open, not just once, so permanent
 * marketing copy above the actual choices was pure friction for a
 * returning user. Its most concrete claims (Egyptian tax-on-service
 * compounding, no sign-up, settle outside the app) now live in the two
 * button subtitles instead, where they're read once, in context, right
 * where the decision happens — not restated twice on the same screen.
 * Grounded in the PRFAQ's validated competitive positioning
 * (prfaq-hasebly.md, 2026-07-16), not invented copy.
 */
export default function HomeScreen({ navigation }: Props) {
  const { colors, cardShadow, insets } = useTheme();
  const { account } = useAccount();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          gap: spacing.xxl,
        },
        brand: { alignItems: 'center', gap: 10 },
        logo: { width: 64, height: 64, borderRadius: 14 },
        title: { fontFamily: fonts.headingSemiBold, fontSize: 26, color: colors.ink, letterSpacing: -0.2 },
        subtitle: { fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, textAlign: 'center' },
        actions: { gap: spacing.md },
        sectionButton: {
          borderRadius: radii.lg,
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: 4,
          ...cardShadow,
        },
        sectionButtonCasual: { backgroundColor: colors.accent },
        sectionButtonGroups: { backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line },
        sectionTitleCasual: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.accentInk },
        sectionTitleGroups: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.ink },
        sectionSubtitleCasual: { fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.accentInk, opacity: 0.85 },
        sectionSubtitleGroups: { fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft },
      }),
    [colors, cardShadow, insets],
  );

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image accessibilityLabel="ehsebly logo" source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>ehsebly</Text>
        <Text style={styles.subtitle}>Break down a receipt in a few taps — no calculator, no guessing the tax.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Casual Breakdown"
          style={[styles.sectionButton, styles.sectionButtonCasual]}
          onPress={() => navigation.navigate('CasualSplit')}
        >
          <Text style={styles.sectionTitleCasual}>Casual Breakdown</Text>
          <Text style={styles.sectionSubtitleCasual}>
            No sign-up — snap a receipt and 14% tax compounds correctly on 12% service, automatically.
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Groups"
          style={[styles.sectionButton, styles.sectionButtonGroups]}
          onPress={() => navigation.navigate(account ? 'GroupList' : 'EmailEntry')}
        >
          <Text style={styles.sectionTitleGroups}>Groups</Text>
          <Text style={styles.sectionSubtitleGroups}>
            Households and trips — a running ledger. Settle up via InstaPay, Vodafone Cash, or cash.
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
