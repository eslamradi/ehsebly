import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShareableSplit, type ShareableSplitHandle } from '../components/ShareableSplit';
import { loadHistoryEntry, type HistoryEntry } from '../domain/history';
import { useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoryDetail'>;

/** Read-only reopened view of a past split — same numbers, same layout as FinalSplitScreen. */
export default function HistoryDetailScreen({ navigation, route }: Props) {
  const { buttonStyles, screenStyles } = useTheme();
  const { entryId } = route.params;
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined);
  const shareRef = useRef<ShareableSplitHandle>(null);

  useEffect(() => {
    let cancelled = false;
    loadHistoryEntry(entryId).then((loaded) => {
      if (!cancelled) {
        setEntry(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const handleBack = () => navigation.navigate('Tabs', { screen: 'History' });

  const handleShare = () => {
    shareRef.current?.share();
  };

  if (entry === undefined) {
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>Loading…</Text>
      </View>
    );
  }

  if (entry === null) {
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>Couldn't find that breakdown.</Text>
        <Pressable accessibilityLabel="Back to history" style={buttonStyles.primary} onPress={handleBack}>
          <Text style={buttonStyles.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Breakdown</Text>

      <ShareableSplit
        ref={shareRef}
        photoUris={entry.photoUris}
        items={entry.items}
        taxService={entry.taxService}
        people={entry.people}
        itemAssignments={entry.itemAssignments}
      />

      <Pressable accessibilityLabel="Share breakdown" style={buttonStyles.primary} onPress={handleShare}>
        <Text style={buttonStyles.primaryText}>Share Breakdown</Text>
      </Pressable>
      <Pressable accessibilityLabel="Back to history" style={buttonStyles.secondary} onPress={handleBack}>
        <Text style={buttonStyles.secondaryText}>Back to History</Text>
      </Pressable>
    </ScrollView>
  );
}
