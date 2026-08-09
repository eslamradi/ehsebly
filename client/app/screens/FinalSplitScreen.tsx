import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShareableSplit, type ShareableSplitHandle } from '../components/ShareableSplit';
import { submitGroupExpense } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { saveSplitToHistory } from '../domain/history';
import { useSplitSession } from '../domain/session';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { spacing, useTheme } from '../theme';
import { useI18n } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FinalSplit'>;

/**
 * FR-11's final split display — each person's amount with context on what
 * it includes (AC #1). No payment affordance exists anywhere on this
 * screen or in this app (AC #2 / FR-12) — that's an absence, not a
 * feature, so there is nothing here to build for it beyond not adding one.
 */
export default function FinalSplitScreen({ navigation }: Props) {
  const theme = useTheme();
  const { buttonStyles, pillStyle, pillTextStyle, screenStyles } = theme;
  const { t } = useI18n();
  const { session, clearPhoto } = useSplitSession();
  const { extractionResult, taxService, people, itemAssignments } = session;
  const { token } = useAccount();

  // Guards against saving more than once for the same completed session —
  // native-stack keeps this screen instance mounted if the fronter navigates
  // back to Review and forward again (re-focusing, not remounting), so an
  // effect dependency alone isn't enough; this ref makes the guard explicit
  // regardless of render timing (same pattern as CaptureScreen's
  // confirmingRef, Story 1.2 code review finding).
  // Guards the *automatic* save against running twice for one session —
  // native-stack keeps this screen mounted and re-focuses rather than
  // remounting, so an effect dependency alone isn't enough (same pattern as
  // CaptureScreen's confirmingRef, Story 1.2 code review). Retrying a failed
  // group post deliberately bypasses it: nothing was written, so there is
  // nothing to double up.
  const autoSaveRanRef = useRef(false);
  const shareRef = useRef<ShareableSplitHandle>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const groupName = session.group?.groupName ?? '';

  /**
   * Posts the finished expense to the group's shared ledger.
   *
   * A failure here used to be swallowed by `.catch(() => {})`, carrying the
   * same "best-effort, never block the fronter" comment as the local history
   * save below. That reasoning does not transfer: local history is the
   * fronter's own copy and losing it costs them a record they can rebuild,
   * whereas this write is what the rest of the group settles against. A
   * dropped request left everyone looking at a finished breakdown that the
   * group ledger never received, with nothing on screen to say so. It now
   * reports the failure and offers a retry.
   */
  const postToGroup = useCallback(async () => {
    if (!extractionResult || extractionResult.status !== 'ok' || !taxService || !session.group?.paidByMemberId) {
      return;
    }
    if (!token) {
      // Explicit error over silent loss (Story 2.4 code review, 2026-07-30):
      // this was meant to go to the group ledger — falling through to a
      // local-only save instead would look identical to success while the
      // group never sees it.
      setSubmitError(t('final.sessionExpired'));
      return;
    }
    const subtotalPiastres = calculateSubtotalPiastres(extractionResult.items);
    const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
    const itemAssignmentsByMemberId: Record<number, Record<string, number>> = {};
    for (const [itemIndexText, weightsByPersonIndex] of Object.entries(itemAssignments)) {
      const weightsByMemberId: Record<string, number> = {};
      for (const [personIndexText, weight] of Object.entries(weightsByPersonIndex)) {
        const memberId = session.group.memberIdByPersonIndex[Number(personIndexText)];
        if (memberId) {
          weightsByMemberId[memberId] = weight;
        }
      }
      itemAssignmentsByMemberId[Number(itemIndexText)] = weightsByMemberId;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitGroupExpense(token, session.group.groupId, {
        description: 'Expense breakdown',
        paid_by_member_id: session.group.paidByMemberId,
        subtotal_piastres: totals.subtotalPiastres,
        tax_piastres: totals.taxPiastres,
        service_piastres: totals.servicePiastres,
        other_service_piastres: totals.otherServicePiastres,
        total_piastres: totals.totalPiastres,
        printed_total_piastres: extractionResult.printedTotalPiastres ?? null,
        // Sent so the Worker can independently recompute and verify these
        // totals rather than trusting client arithmetic (Story 2.4 code
        // review, 2026-07-30).
        tax_enabled: taxService.taxEnabled,
        tax_rate_percent: taxService.taxRatePercent,
        service_enabled: taxService.serviceEnabled,
        service_rate_percent: taxService.serviceRatePercent,
        other_service_enabled: taxService.otherServiceEnabled,
        other_service_rate_percent: taxService.otherServiceRatePercent,
        items: extractionResult.items.map((item) => ({
          name: item.name,
          price_piastres: item.pricePiastres,
          quantity: item.quantity,
          is_shared: item.shared ?? false,
        })),
        item_assignments: itemAssignmentsByMemberId,
      });
    } catch {
      setSubmitError(t('final.submitFailed', { group: groupName }));
    } finally {
      setSubmitting(false);
    }
  }, [extractionResult, taxService, itemAssignments, session.group, token, t, groupName]);

  useEffect(() => {
    if (autoSaveRanRef.current) {
      return;
    }
    if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
      return;
    }
    autoSaveRanRef.current = true;

    if (session.group && session.group.paidByMemberId) {
      void postToGroup();
      return;
    }

    saveSplitToHistory({
      photoUris: session.photoUris,
      items: extractionResult.items,
      taxService,
      people,
      itemAssignments,
    }).catch(() => {
      // Best-effort, and here that genuinely holds: History is the fronter's
      // own local copy, not something anyone else settles against.
    });
  }, [extractionResult, taxService, people, itemAssignments, session.photoUris, session.group, postToGroup]);

  /**
   * Only reachable from the defensive "nothing to show" guard below, where no
   * save has happened. The finished view deliberately has no Back: by then the
   * expense is already written, `autoSaveRanRef` blocks a second save, and
   * native-stack re-focuses rather than remounting — so editing after backing
   * out would look like it worked and silently never persist. Corrections go
   * through History or the group's expense detail instead.
   */
  const handleBackFromEmptyState = () => {
    navigation.navigate('Review');
  };

  const handleStartNewSplit = () => {
    // Read before clearPhoto() wipes session.group — a group expense lands
    // back on that group's detail screen (its own section, per the
    // Casual Splitting/Groups split, 2026-07-30), a solo split lands back
    // on Casual Splitting's own home rather than the top-level chooser.
    const groupId = session.group?.groupId;
    clearPhoto();
    // navigation.reset (not navigate) so the whole in-progress stack —
    // Capture/ExtractedItems/ItemAssignment/Review/FinalSplit — is
    // discarded rather than left behind for Back to return into with a
    // freshly-cleared session underneath it.
    if (groupId) {
      navigation.reset({ index: 0, routes: [{ name: 'GroupDetail', params: { groupId } }] });
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'CasualSplit' }] });
    }
  };

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only reached once the whole flow up through
    // Review has completed, but guard against stale/cleared session state
    // rather than crashing on `extractionResult.items`/`taxService.*`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>{t('final.nothingToShow')}</Text>
        <Pressable accessibilityLabel={t('final.a11yBackToReview')} style={buttonStyles.primary} onPress={handleBackFromEmptyState}>
          <Text style={buttonStyles.primaryText}>{t('common.back')}</Text>
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
        <Text style={screenStyles.heading}>{t('final.title')}</Text>
        {/* Not shown while a post has failed. The breakdown itself is finished,
            but nothing reached the group ledger — a green COMPLETE stamp
            directly above "nothing was saved" is the screen contradicting
            itself, and COMPLETE is the half people believe. */}
        {!submitError && (
          <View style={pillStyle('positive')}>
            <Text style={pillTextStyle('positive')}>{t('final.complete')}</Text>
          </View>
        )}
      </View>

      {submitError && (
        <View style={{ gap: spacing.sm }}>
          <Text style={pillTextStyle('critical')}>{submitError}</Text>
          {/* Without this the fronter is told the post failed and given no way
              to act on it. Retry bypasses autoSaveRanRef deliberately —
              nothing reached the ledger, so there is nothing to duplicate. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('final.submitRetry')}
            disabled={submitting}
            style={[buttonStyles.secondary, submitting && buttonStyles.disabled]}
            onPress={() => void postToGroup()}
          >
            <Text style={buttonStyles.secondaryText}>
              {submitting ? t('final.submitting') : t('final.submitRetry')}
            </Text>
          </Pressable>
        </View>
      )}

      <ShareableSplit
        ref={shareRef}
        photoUris={session.photoUris}
        items={extractionResult.items}
        taxService={taxService}
        people={people}
        itemAssignments={itemAssignments}
      />

      <View style={styles.actions}>
        <Pressable accessibilityLabel={t('final.a11yShare')} style={buttonStyles.primary} onPress={handleShare}>
          <Text style={buttonStyles.primaryText}>{t('final.shareBreakdown')}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t('final.a11yStartNew')} style={buttonStyles.secondary} onPress={handleStartNewSplit}>
          <Text style={buttonStyles.secondaryText}>{t('final.startNew')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: spacing.md },
});
