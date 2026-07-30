import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { inviteMember } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { isValidEgyptianMobile, toE164 } from '../domain/phone';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'InviteMember'>;

export default function InviteMemberScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
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
  });

  const { token } = useAccount();
  const [displayName, setDisplayName] = useState('');
  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleInvite = async () => {
    if (!token) {
      // Session expired/missing mid-flow — surface it instead of silently
      // no-oping the button with no feedback (2026-07-30 fix).
      setError('Your session expired — go back and sign in again.');
      return;
    }
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setError('Enter a name for this person.');
      return;
    }
    if (!isValidEgyptianMobile(localNumber)) {
      setError('Enter a valid Egyptian mobile number, e.g. 01012345678.');
      return;
    }
    setIsSending(true);
    setError(null);
    const result = await inviteMember(token, groupId, toE164(localNumber), trimmedName);
    setIsSending(false);
    if (result.status !== 'ok') {
      setError(result.message);
      return;
    }
    navigation.goBack();
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Invite Member</Text>
      <TextInput
        accessibilityLabel="Member's name"
        style={styles.input}
        placeholder="Name"
        placeholderTextColor={colors.inkFaint}
        value={displayName}
        onChangeText={(text) => {
          setDisplayName(text);
          setError(null);
        }}
      />
      <TextInput
        accessibilityLabel="Member's phone number"
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
        accessibilityLabel="Send invite"
        style={[buttonStyles.primary, isSending && buttonStyles.disabled]}
        disabled={isSending}
        onPress={handleInvite}
      >
        <Text style={buttonStyles.primaryText}>{isSending ? 'Inviting…' : 'Invite'}</Text>
      </Pressable>
    </ScrollView>
  );
}
