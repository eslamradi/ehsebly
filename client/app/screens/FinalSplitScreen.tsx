import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShareableSplit, type ShareableSplitHandle } from '../components/ShareableSplit';
import { saveSplitToHistory } from '../domain/history';
import { useSplitSession } from '../domain/session';
import { spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FinalSplit'>;

/**
 * FR-11's final split display — each person's amount with context on what
 * it includes (AC #1). No payment affordance exists anywhere on this
 * screen or in this app (AC #2 / FR-12) — that's an absence, not a
 * feature, so there is nothing here to build for it beyond not adding one.
 */
export default function FinalSplitScreen({ navigation }: Props) {
  const { buttonStyles, pillStyle, pillTextStyle, screenStyles } = useTheme();
  const { session, clearPhoto } = useSplitSession();
  const { extractionResult, taxService, people, itemAssignments } = session;

  // Guards against saving more than once for the same completed session —
  // native-stack keeps this screen instance mounted if the fronter navigates
  // back to Review and forward again (re-focusing, not remounting), so an
  // effect dependency alone isn't enough; this ref makes the guard explicit
  // regardless of render timing (same pattern as CaptureScreen's
  // confirmingRef, Story 1.2 code review finding).
  const savedToHistoryRef = useRef(false);
  const shareRef = useRef<ShareableSplitHandle>(null);
  useEffect(() => {
    if (savedToHistoryRef.current) {
      return;
    }
    if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
      return;
    }
    savedToHistoryRef.current = true;
    saveSplitToHistory({
      photoUris: session.photoUris,
      items: extractionResult.items,
      taxService,
      people,
      itemAssignments,
    }).catch(() => {
      // Best-effort — a failed history save must never block the fronter
      // from seeing the split they just finished.
    });
  }, [extractionResult, taxService, people, itemAssignments, session.photoUris]);

  const handleBack = () => {
    navigation.navigate('Review');
  };

  const handleStartNewSplit = () => {
    clearPhoto();
    // navigation.reset (not navigate) so the whole in-progress stack —
    // Capture/ExtractedItems/TaxService/ItemAssignment/Review/FinalSplit — is
    // discarded rather than left behind for Back to return into with a
    // freshly-cleared session underneath it. Resets to Home (not Capture)
    // now that Home is the app's actual landing page.
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only reached once the whole flow up through
    // Review has completed, but guard against stale/cleared session state
    // rather than crashing on `extractionResult.items`/`taxService.*`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>Nothing to show yet.</Text>
        <Pressable accessibilityLabel="Back to review" style={buttonStyles.primary} onPress={handleBack}>
          <Text style={buttonStyles.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const handleShare = () => {
    shareRef.current?.share();
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>Split</Text>
        <View style={pillStyle('positive')}>
          <Text style={pillTextStyle('positive')}>Complete</Text>
        </View>
      </View>

      <ShareableSplit
        ref={shareRef}
        photoUris={session.photoUris}
        items={extractionResult.items}
        taxService={taxService}
        people={people}
        itemAssignments={itemAssignments}
      />

      <View style={styles.actions}>
        <Pressable accessibilityLabel="Share split" style={buttonStyles.primary} onPress={handleShare}>
          <Text style={buttonStyles.primaryText}>Share Split</Text>
        </Pressable>
        <Pressable accessibilityLabel="Start new split" style={buttonStyles.secondary} onPress={handleStartNewSplit}>
          <Text style={buttonStyles.secondaryText}>Start New Split</Text>
        </Pressable>
        <Pressable accessibilityLabel="Back to review" style={buttonStyles.secondary} onPress={handleBack}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: spacing.md },
});
