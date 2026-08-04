import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CasualSplit'>;

/**
 * Casual Splitting's own home — the solo, no-account, single-receipt flow
 * (Epic 1: Capture → Extract → Tax/Service → Assign → Review → Split,
 * saved to on-device History only). Split out from the top-level Home
 * screen (2026-07-30) so Casual Splitting and Groups read as two clearly
 * separate sections with their own data and screens, rather than a flat
 * list of buttons mixing a solo one-off split with a signed-in, synced
 * group ledger.
 */
export default function CasualSplitScreen({ navigation }: Props) {
  const { colors, insets, buttonStyles } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingTop: 56 + insets.top,
          paddingBottom: 32 + insets.bottom,
        },
        headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        title: { fontFamily: fonts.headingSemiBold, fontSize: 24, color: colors.ink, letterSpacing: -0.2 },
        subtitle: { fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, marginTop: 6 },
        backButton: {
          backgroundColor: colors.paperRaised,
          borderWidth: 1,
          borderColor: colors.line,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.sm,
        },
        actions: { gap: 10 },
        ghostButton: { paddingVertical: 14, alignItems: 'center' },
        ghostButtonText: { fontFamily: fonts.sansMedium, color: colors.inkSoft, fontSize: 15 },
      }),
    [colors, insets],
  );

  return (
    <View style={styles.container}>
      <View>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Casual Breakdown</Text>
          <Pressable accessibilityLabel="Back to home" style={styles.backButton} onPress={() => navigation.navigate('Home')}>
            <Text style={buttonStyles.secondaryText}>Back</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Break down one receipt in a few taps — no sign-up.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Take a photo of a receipt"
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('Capture', undefined)}
        >
          <Text style={buttonStyles.primaryText}>Take Photo</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Choose photo from gallery"
          style={buttonStyles.secondary}
          onPress={() => navigation.navigate('Capture', { openGalleryOnMount: true })}
        >
          <Text style={buttonStyles.secondaryText}>Choose from Gallery</Text>
        </Pressable>
        <Pressable accessibilityLabel="View breakdown history" style={styles.ghostButton} onPress={() => navigation.navigate('History')}>
          <Text style={styles.ghostButtonText}>History</Text>
        </Pressable>
      </View>
    </View>
  );
}
