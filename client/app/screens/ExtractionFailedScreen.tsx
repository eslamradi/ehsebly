import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ExtractionResult } from '../api/types';
import { useSplitSession } from '../domain/session';
import { useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ExtractionFailed'>;

/**
 * Shown for both AD-4 failure shapes ({status: "no_items_found"} and
 * {status: "error"} — including network/timeout failures, Story 1.2 AC #5)
 * behind one explicit "couldn't read this receipt" state rather than a
 * blank or broken screen (AC #4). Offers retry or manual entry — never a
 * dead end.
 *
 * "Retry" means re-scanning a fresh photo, not re-sending the same bytes
 * that just failed to a still-blurry/still-not-a-receipt image would fail
 * identically. This matches the PRD's UJ-1 edge case wording ("re-scans or
 * gives up and does it manually"), not a same-photo retry.
 */
export default function ExtractionFailedScreen({ navigation }: Props) {
  const { buttonStyles, screenStyles } = useTheme();
  const { session, clearPhoto } = useSplitSession();

  const result = session.extractionResult;
  const detail = describeFailure(result);

  const handleRetry = () => {
    // Clears photoUri + extractionResult so CaptureScreen resets its own
    // local capture/preview state when it regains focus, rather than
    // showing the stale confirmed-photo view.
    clearPhoto();
    navigation.navigate('Capture');
  };

  return (
    <View style={screenStyles.center}>
      <Text style={screenStyles.heading}>Couldn&apos;t read this receipt</Text>
      <Text style={screenStyles.message}>{detail}</Text>
      <Pressable accessibilityLabel="Retry with a new photo" style={buttonStyles.primary} onPress={handleRetry}>
        <Text style={buttonStyles.primaryText}>Retry</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Enter items manually"
        style={buttonStyles.secondary}
        onPress={() => navigation.navigate('ManualEntry')}
      >
        <Text style={buttonStyles.secondaryText}>Enter Items Manually</Text>
      </Pressable>
    </View>
  );
}

function describeFailure(result: ExtractionResult | null): string {
  if (result?.status === 'error') {
    return result.message;
  }
  if (result?.status === 'ok') {
    // Defensive: this screen is only navigated to on a non-'ok' result, but
    // session state could in principle change between navigation and
    // render. Say something accurate rather than falling through to the
    // "no items found" message, which would be misleading here.
    return 'Extraction actually succeeded — this screen shouldn’t be showing. Try again.';
  }
  return 'No plausible items were found on that photo.';
}
