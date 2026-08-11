import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatPiastresAsEGP } from '../domain/money';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { loadSplitHistory, type HistoryEntry } from '../domain/history';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

/**
 * List of past completed splits (newest first), each saved once by
 * FinalSplitScreen. Reloads every time this screen gains focus rather than
 * once on mount, so a split completed since the last visit shows up
 * immediately without a manual refresh.
 */
export default function HistoryScreen({ navigation }: Props) {
  const theme = useTheme();
  const { screenStyles } = theme;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        backButton: {
          backgroundColor: theme.colors.paperRaised,
          borderWidth: 1,
          borderColor: theme.colors.line,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.sm,
        },
        entryRow: {
          flexDirection: 'row',
          gap: spacing.md,
          alignItems: 'center',
          backgroundColor: theme.colors.paperRaised,
          borderRadius: radii.md,
          padding: spacing.md,
          ...theme.cardShadow,
        },
        thumbnail: { width: 56, height: 56, borderRadius: radii.sm },
        thumbnailPlaceholder: { width: 56, height: 56, borderRadius: radii.sm, backgroundColor: theme.colors.accentSoft },
        entryInfo: { flex: 1, minWidth: 0, gap: 4 },
        entryDate: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: theme.colors.ink },
        entryDetail: { fontFamily: fonts.sansRegular, fontSize: 14, color: theme.colors.inkSoft },
      }),
    [theme],
  );

  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

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

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>History</Text>
        <Pressable accessibilityLabel="Back to home" style={styles.backButton} onPress={() => navigation.navigate('Home')}>
          <Text style={theme.buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>

      {entries === null && <Text style={screenStyles.subheading}>Loading…</Text>}

      {entries !== null && entries.length === 0 && (
        <Text style={screenStyles.subheading}>No past breakdowns yet — finish one and it'll show up here.</Text>
      )}

      {entries?.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityLabel={`Open breakdown from ${formatEntryDate(entry.completedAt)}`}
          style={styles.entryRow}
          onPress={() => navigation.navigate('HistoryDetail', { entryId: entry.id })}
        >
          {entry.photoUris?.[0] ? (
            <Image accessibilityLabel="Receipt thumbnail" source={{ uri: entry.photoUris[0] }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailPlaceholder} />
          )}
          <View style={styles.entryInfo}>
            <Text style={styles.entryDate}>{formatEntryDate(entry.completedAt)}</Text>
            <Text style={styles.entryDetail}>
              {entry.people.length} {entry.people.length === 1 ? 'person' : 'people'} ·{' '}
              <Text style={screenStyles.mono}>{formatPiastresAsEGP(entryTotalPiastres(entry))} EGP</Text>
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function entryTotalPiastres(entry: HistoryEntry): number {
  const subtotalPiastres = calculateSubtotalPiastres(entry.items);
  return calculateSplitTotals({ subtotalPiastres, ...entry.taxService }).totalPiastres;
}

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
