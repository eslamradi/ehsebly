import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { LanguagePicker } from '../components/LanguagePicker';
import { formatPiastresAsEGP } from '../domain/money';
import { entryTotalPiastres, loadSplitHistory, type HistoryEntry } from '../domain/history';
import { useI18n } from '../i18n';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

const RECENT_COUNT = 3;

/**
 * Home shows what you have already split, and one button to split something
 * else.
 *
 * It used to be a chooser: brand, tagline, and a card per section. That is the
 * "homepage as navigation hub" pattern, which NN/g endorses for task-based
 * apps — but it spends the screen saying what the tab bar below now says for
 * free, and a returning fronter already knows what this app is. Splitwise,
 * the reference for this category, gives the same space to balances and shows
 * no logo at all.
 *
 * So the brand block appears only on first run, where it is the one thing
 * worth saying and there is no history to show instead. Once a breakdown
 * exists the screen becomes a list of them, and starting another moves to the
 * floating button.
 */
export default function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors, insets, buttonStyles } = theme;
  const { t } = useI18n();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  // Reloads on focus, not on mount: finishing a breakdown returns here, and
  // it should already be in the list.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadSplitHistory().then((loaded) => {
        if (!cancelled) {
          setEntries(loaded);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.paper },
        content: {
          paddingHorizontal: spacing.xl,
          paddingTop: 32 + insets.top,
          // Clears the floating button so the last row is never trapped under it.
          paddingBottom: 128,
          gap: spacing.lg,
        },
        brand: { alignItems: 'center', gap: 10, paddingTop: spacing.xxl },
        logo: { width: 64, height: 64, borderRadius: 14 },
        title: { fontFamily: theme.fonts.headingSemiBold, fontSize: 26, color: colors.ink, letterSpacing: -0.2 },
        tagline: {
          fontFamily: theme.fonts.sansRegular,
          fontSize: 14,
          color: colors.inkSoft,
          textAlign: 'center',
          lineHeight: 20,
        },
        firstRunActions: { gap: 10, marginTop: spacing.xl },
        sectionLabel: {
          fontFamily: theme.fonts.sansSemiBold,
          fontSize: 12,
          letterSpacing: 0.6,
          color: colors.inkFaint,
        },
        entryRow: {
          flexDirection: 'row',
          gap: spacing.md,
          alignItems: 'center',
          backgroundColor: colors.paperRaised,
          borderRadius: radii.md,
          padding: spacing.md,
          ...theme.cardShadow,
        },
        thumbnail: { width: 48, height: 48, borderRadius: 24 },
        thumbnailPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft },
        entryInfo: { flex: 1, minWidth: 0, gap: 2 },
        entryDate: { fontFamily: theme.fonts.sansSemiBold, fontSize: 15, color: colors.ink },
        entryDetail: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
        entryTotal: { fontFamily: theme.fonts.monoSemiBold, fontSize: 15, color: colors.ink },
        viewAll: { alignItems: 'center', paddingVertical: spacing.md },
        viewAllText: { fontFamily: theme.fonts.sansMedium, fontSize: 15, color: colors.inkSoft },
        // Floats over the list rather than sitting in it: the list is the
        // content, and this has to stay reachable however far you scroll.
        fab: {
          position: 'absolute',
          right: spacing.xl,
          bottom: 24 + insets.bottom,
          backgroundColor: colors.accent,
          borderRadius: 28,
          paddingVertical: 16,
          paddingHorizontal: spacing.xl,
          ...theme.cardShadow,
        },
        fabText: { fontFamily: theme.fonts.headingSemiBold, fontSize: 16, color: colors.accentInk },
        galleryLink: { alignItems: 'center', paddingVertical: spacing.sm },
        galleryLinkText: { fontFamily: theme.fonts.sansMedium, fontSize: 14, color: colors.inkSoft },
      }),
    [theme, colors, insets],
  );

  const recent = entries?.slice(0, RECENT_COUNT) ?? [];
  const hasHistory = recent.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {!hasHistory ? (
          <>
            <View style={styles.brand}>
              <Image
                accessibilityLabel={t('home.a11yLogo')}
                source={require('../../assets/icon.png')}
                style={styles.logo}
              />
              <Text style={styles.title}>asemly</Text>
              <Text style={styles.tagline}>{t('home.tagline')}</Text>
            </View>

            <View style={styles.firstRunActions}>
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
            </View>

            <LanguagePicker />
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>{t('home.recent')}</Text>
            {recent.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityLabel={t('home.a11yOpenEntry', { date: formatEntryDate(entry.completedAt) })}
                style={styles.entryRow}
                onPress={() => navigation.navigate('HistoryDetail', { entryId: entry.id })}
              >
                {entry.photoUris?.[0] ? (
                  <Image
                    accessibilityLabel={t('home.a11yThumbnail')}
                    source={{ uri: entry.photoUris[0] }}
                    style={styles.thumbnail}
                  />
                ) : (
                  <View style={styles.thumbnailPlaceholder} />
                )}
                <View style={styles.entryInfo}>
                  <Text style={styles.entryDate}>{formatEntryDate(entry.completedAt)}</Text>
                  <Text style={styles.entryDetail}>{t('home.peopleCount', { count: entry.people.length })}</Text>
                </View>
                <Text style={styles.entryTotal}>{formatPiastresAsEGP(entryTotalPiastres(entry))}</Text>
              </Pressable>
            ))}

            {(entries?.length ?? 0) > RECENT_COUNT && (
              <Pressable
                accessibilityLabel={t('home.a11yViewAll')}
                style={styles.viewAll}
                onPress={() => navigation.navigate('History')}
              >
                <Text style={styles.viewAllText}>{t('home.viewAll')}</Text>
              </Pressable>
            )}

            <Pressable
              accessibilityLabel={t('casual.a11yChooseFromGallery')}
              style={styles.galleryLink}
              onPress={() => navigation.navigate('Capture', { openGalleryOnMount: true })}
            >
              <Text style={styles.galleryLinkText}>{t('casual.chooseFromGallery')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {hasHistory && (
        <Pressable
          accessibilityLabel={t('casual.a11yTakePhoto')}
          style={styles.fab}
          onPress={() => navigation.navigate('Capture', undefined)}
        >
          <Text style={styles.fabText}>{t('home.newBreakdown')}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Locale-aware, formatted by the platform rather than translated by us. */
function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
