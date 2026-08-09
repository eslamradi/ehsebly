import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ExtractionResult } from '../api/types';
import { useSplitSession } from '../domain/session';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import type { Translate } from '../domain/share';
import { errorMessageForCode } from '../i18n/errorCode';
import { MAX_PHOTOS } from '../api/limits';
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
  const theme = useTheme();
  const { buttonStyles, screenStyles } = theme;
  const { t } = useI18n();
  const { session, clearPhoto } = useSplitSession();

  const result = session.extractionResult;
  const detail = describeFailure(result, t);

  const handleRetry = () => {
    // Clears photoUri + extractionResult so CaptureScreen resets its own
    // local capture/preview state when it regains focus, rather than
    // showing the stale confirmed-photo view.
    clearPhoto();
    navigation.navigate('Capture');
  };

  return (
    <View style={screenStyles.center}>
      <Text style={screenStyles.heading}>{t('extractionFailed.title')}</Text>
      <Text style={screenStyles.message}>{detail}</Text>
      <Pressable accessibilityLabel={t('extractionFailed.a11yRetry')} style={buttonStyles.primary} onPress={handleRetry}>
        <Text style={buttonStyles.primaryText}>{t('extractionFailed.retry')}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={t('extractionFailed.a11yEnterManually')}
        style={buttonStyles.secondary}
        onPress={() => navigation.navigate('ManualEntry')}
      >
        <Text style={buttonStyles.secondaryText}>{t('extractionFailed.enterManually')}</Text>
      </Pressable>
    </View>
  );
}

/** `t` is injected — this is a plain helper, not a component, so it can't hold a hook. */
function describeFailure(result: ExtractionResult | null, t: Translate): string {
  if (result?.status === 'error') {
    // Prefer the localized string for the Worker's code; its English
    // `message` is the fallback for a code this build doesn't know.
    return errorMessageForCode(t, result.code, result.message, { max: MAX_PHOTOS });
  }
  if (result?.status === 'ok') {
    // Defensive: this screen is only navigated to on a non-'ok' result, but
    // session state could in principle change between navigation and
    // render. Say something accurate rather than falling through to the
    // "no items found" message, which would be misleading here.
    return t('extractionFailed.succeededUnexpectedly');
  }
  return t('extractionFailed.noPlausibleItems');
}
