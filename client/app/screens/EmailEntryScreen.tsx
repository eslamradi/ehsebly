import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { requestOtp } from '../api/groupApi';
import { isValidEmail, normalizeEmail } from '../domain/email';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailEntry'>;

export default function EmailEntryScreen({ navigation }: Props) {
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
      fontFamily: fonts.sansRegular,
      fontSize: 16,
      color: colors.ink,
    },
    errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 13 },
    actions: { gap: spacing.md },
  });

  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleContinue = async () => {
    if (!isValidEmail(emailInput)) {
      setError('Enter a valid email address.');
      return;
    }
    setIsSending(true);
    setError(null);
    const email = normalizeEmail(emailInput);
    const result = await requestOtp(email);
    setIsSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigation.navigate('OtpVerify', { email });
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Sign in</Text>
      <Text style={screenStyles.subheading}>We'll email a code to confirm it's you.</Text>
      <TextInput
        accessibilityLabel="Email address"
        style={styles.input}
        placeholder="you@example.com"
        placeholderTextColor={colors.inkFaint}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={emailInput}
        onChangeText={(text) => {
          setEmailInput(text);
          setError(null);
        }}
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
