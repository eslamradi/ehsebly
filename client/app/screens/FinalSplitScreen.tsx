import { useEffect, useRef, useState } from 'react';
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
  const savedToHistoryRef = useRef(false);
  const shareRef = useRef<ShareableSplitHandle>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (savedToHistoryRef.current) {
      return;
    }
    if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
      return;
    }
    savedToHistoryRef.current = true;

    if (session.group && session.group.paidByMemberId) {
      if (!token) {
        // Explicit error over silent loss (Story 2.4 code review, 2026-07-30):
        // this was meant to go to the group ledger — falling through to a
        // local-only save instead would look identical to success while the
        // group never sees it. Nothing is saved anywhere; the fronter must
        // sign in again and re-enter this expense.
        setSubmitError(t('final.sessionExpired'));
        return;
      }
      // Logging a group expense (household/trip) instead of a solo split —
      // submit to the group's server-side ledger rather than saving to
      // local History. This is the only place that decision is made; every
      // screen upstream (Capture through Review) is unchanged either way.
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
      submitGroupExpense(token, session.group.groupId, {
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
      }).catch(() => {
        // Best-effort — a failed submission must never block the fronter
        // from seeing the split they just finished, same as the local
        // History save below.
      });
      return;
    }

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
  }, [extractionResult, taxService, people, itemAssignments, session.photoUris, session.group, token]);

  const handleBack = () => {
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
    // Capture/ExtractedItems/TaxService/ItemAssignment/Review/FinalSplit — is
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
        <Pressable accessibilityLabel={t('final.a11yBackToReview')} style={buttonStyles.primary} onPress={handleBack}>
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
        <View style={pillStyle('positive')}>
          <Text style={pillTextStyle('positive')}>{t('final.complete')}</Text>
        </View>
      </View>

      {submitError && <Text style={pillTextStyle('critical')}>{submitError}</Text>}

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
        <Pressable accessibilityLabel={t('final.a11yBackToReview')} style={buttonStyles.secondary} onPress={handleBack}>
          <Text style={buttonStyles.secondaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: spacing.md },
});
