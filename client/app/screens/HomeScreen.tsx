import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAccount } from '../domain/account';
import { LanguagePicker } from '../components/LanguagePicker';
import { useI18n } from '../i18n';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { GROUPS_ENABLED } from '../featureFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/**
 * The app's landing page and the Casual Splitting hub in one screen.
 *
 * These were two screens until 2026-08-11. Home offered a choice between
 * Casual Splitting and Groups; CasualSplitScreen then offered camera,
 * gallery and History. Hiding Groups left Home with a single card, so every
 * session paid a tap to pass through a chooser with nothing to choose. The
 * actions that were one screen down now live here.
 *
 * The Groups card returns alongside them when GROUPS_ENABLED flips, which is
 * the arrangement Home originally had — minus the interstitial.
 *
 * Actions sit at the bottom rather than centred: they are pressed on every
 * open, and that is where a thumb already is.
 */
export default function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors, cardShadow, insets, buttonStyles } = theme;
  const { t } = useI18n();
  const { account } = useAccount();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingTop: 72 + insets.top,
          paddingBottom: 32 + insets.bottom,
        },
        bottom: { gap: spacing.lg },
        brand: { alignItems: 'center', gap: 10 },
        logo: { width: 64, height: 64, borderRadius: 14 },
        title: { fontFamily: theme.fonts.headingSemiBold, fontSize: 26, color: colors.ink, letterSpacing: -0.2 },
        subtitle: { fontFamily: theme.fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, textAlign: 'center' },
        actions: { gap: 10 },
        ghostButton: { paddingVertical: 14, alignItems: 'center' },
        ghostButtonText: { fontFamily: theme.fonts.sansMedium, color: colors.inkSoft, fontSize: 15 },
        sectionButton: {
          borderRadius: radii.lg,
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: 4,
          ...cardShadow,
        },
        sectionButtonCasual: { backgroundColor: colors.accent },
        sectionButtonGroups: { backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line },
        sectionTitleCasual: { fontFamily: theme.fonts.sansBold, fontSize: 18, color: colors.accentInk },
        sectionTitleGroups: { fontFamily: theme.fonts.sansBold, fontSize: 18, color: colors.ink },
        sectionSubtitleCasual: { fontFamily: theme.fonts.sansRegular, fontSize: 13.5, color: colors.accentInk, opacity: 0.85 },
        sectionSubtitleGroups: { fontFamily: theme.fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft },
      }),
    [theme, colors, cardShadow, insets],
  );

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image accessibilityLabel="asemly logo" source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>asemly</Text>
        <Text style={styles.subtitle}>{t('home.tagline')}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={t('casual.a11yTakePhoto')}
            style={buttonStyles.primary}
            onPress={() => navigation.navigate('Capture', undefined)}
          >
            <Text style={buttonStyles.primaryText}>{t('casual.takePhoto')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('casual.a11yChooseFromGallery')}
            style={buttonStyles.secondary}
            onPress={() => navigation.navigate('Capture', { openGalleryOnMount: true })}
          >
            <Text style={buttonStyles.secondaryText}>{t('casual.chooseFromGallery')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('casual.a11yHistory')}
            style={styles.ghostButton}
            onPress={() => navigation.navigate('History')}
          >
            <Text style={styles.ghostButtonText}>{t('casual.history')}</Text>
          </Pressable>
        </View>

        {GROUPS_ENABLED ? (
          <Pressable
            accessibilityLabel={t('home.groupsTitle')}
            style={[styles.sectionButton, styles.sectionButtonGroups]}
            onPress={() => navigation.navigate(account ? 'GroupList' : 'EmailEntry')}
          >
            <Text style={styles.sectionTitleGroups}>{t('home.groupsTitle')}</Text>
            <Text style={styles.sectionSubtitleGroups}>{t('home.groupsSubtitle')}</Text>
          </Pressable>
        ) : null}

        <LanguagePicker />
      </View>
    </View>
  );
}
