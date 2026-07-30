import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { requestOtp } from '../api/groupApi';
import { isValidEgyptianMobile, toE164 } from '../domain/phone';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneEntry'>;

export default function PhoneEntryScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors, buttonStyles, screenStyles } = theme;
  const styles = StyleSheet.create({
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.paperRaised,
      fontFamily: fonts.monoRegular,
      fontSize: 16,
      color: colors.ink,
    },
    errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 13 },
    actions: { gap: spacing.md },
  });

  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleContinue = async () => {
    if (!isValidEgyptianMobile(localNumber)) {
      setError('Enter a valid Egyptian mobile number, e.g. 01012345678.');
      return;
    }
    setIsSending(true);
    setError(null);
    const phoneE164 = toE164(localNumber);
    const result = await requestOtp(phoneE164);
    setIsSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigation.navigate('OtpVerify', { phoneE164 });
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Sign in</Text>
      <Text style={screenStyles.subheading}>We'll text a code to confirm it's you.</Text>
      <TextInput
        accessibilityLabel="Phone number"
        style={styles.input}
        placeholder="01012345678"
        placeholderTextColor={colors.inkFaint}
        keyboardType="phone-pad"
        value={localNumber}
        onChangeText={(text) => {
          setLocalNumber(text);
          setError(null);
        }}
        maxLength={11}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable
        accessibilityLabel="Send code"
        style={[buttonStyles.primary, isSending && buttonStyles.disabled]}
        disabled={isSending}
        onPress={handleContinue}
      >
        <Text style={buttonStyles.primaryText}>{isSending ? 'Sending…' : 'Send Code'}</Text>
      </Pressable>
    </ScrollView>
  );
}
