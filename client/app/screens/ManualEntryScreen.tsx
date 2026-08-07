import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSplitSession } from '../domain/session';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualEntry'>;

/**
 * Minimal placeholder for the "enter items manually" path FR-3 requires as
 * a fallback when extraction fails. No FR specifies a manual-entry UI yet
 * (out of scope for this story) — this exists so the option is a real,
 * reachable screen rather than a dead or unimplemented button.
 */
export default function ManualEntryScreen({ navigation }: Props) {
  const theme = useTheme();
  const { buttonStyles, screenStyles } = theme;
  const { t } = useI18n();
  const { clearPhoto } = useSplitSession();

  const handleBackToCamera = () => {
    // Clears the failed photo/extraction so CaptureScreen resets to the
    // live camera instead of the stale confirmed-photo view.
    clearPhoto();
    navigation.navigate('Capture');
  };

  return (
    <View style={screenStyles.center}>
      <Text style={screenStyles.heading}>{t('manualEntry.title')}</Text>
      <Text style={screenStyles.message}>
        Manual item entry isn&apos;t built yet — for now, retake the photo or add up the receipt by
        hand for this one.
      </Text>
      <Pressable accessibilityLabel={t('manualEntry.a11yBackToCamera')} style={buttonStyles.primary} onPress={handleBackToCamera}>
        <Text style={buttonStyles.primaryText}>{t('manualEntry.backToCamera')}</Text>
      </Pressable>
    </View>
  );
}
