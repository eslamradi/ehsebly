import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { verifyOtp } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerify'>;

export default function OtpVerifyScreen({ navigation, route }: Props) {
  const { email } = route.params;
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
      fontSize: 20,
      letterSpacing: 4,
      color: colors.ink,
      textAlign: 'center',
    },
    errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 13 },
  });

  const { signIn } = useAccount();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    if (code.trim().length === 0) {
      setError('Enter the code you were sent.');
      return;
    }
    setIsVerifying(true);
    setError(null);
    const result = await verifyOtp(email, code.trim());
    if (!result.ok) {
      setIsVerifying(false);
      setError(result.message);
      return;
    }
    try {
      await signIn(
        { userId: result.account.userId, email: result.account.email, displayName: result.account.displayName },
        result.account.token,
      );
      // No name on file yet (brand-new account, or a pre-existing one from
      // before AccountScreen existed) — collect it before landing on
      // GroupList, so this person doesn't show up as their raw email
      // address in every group they're in (2026-07-30 gap).
      if (!result.account.displayName) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Tabs', params: { screen: 'Account', params: { requireName: true } } }],
        });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'GroupList' } }] });
      }
    } catch {
      // Verify already succeeded server-side at this point — a failure here
      // is purely local persistence (e.g. SecureStore), so surface it
      // rather than leaving the fronter stuck on this screen with no
      // explanation (found via real-device testing: this used to fail
      // silently).
      setIsVerifying(false);
      setError('Signed in, but could not save your session — try again.');
    }
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Enter the code</Text>
      <Text style={screenStyles.subheading}>Sent to {email}</Text>
      <TextInput
        accessibilityLabel="Verification code"
        style={styles.input}
        placeholder="000000"
        placeholderTextColor={colors.inkFaint}
        keyboardType="number-pad"
        value={code}
        onChangeText={(text) => {
          setCode(text);
          setError(null);
        }}
        maxLength={6}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable
        accessibilityLabel="Verify code"
        style={[buttonStyles.primary, isVerifying && buttonStyles.disabled]}
        disabled={isVerifying}
        onPress={handleVerify}
      >
        <Text style={buttonStyles.primaryText}>{isVerifying ? 'Verifying…' : 'Verify'}</Text>
      </Pressable>
    </ScrollView>
  );
}
