import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Contacts from 'expo-contacts';
import { inviteMember } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { isValidEmail, normalizeEmail } from '../domain/email';
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
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handlePickContact = async () => {
    setError(null);
    // presentContactPickerAsync hands off to the native OS contact picker
    // (CNContactPickerViewController on iOS, ACTION_PICK on Android) — it
    // runs out-of-process and returns only the one contact the fronter
    // picked, so unlike getContactsAsync it needs no Contacts permission
    // prompt/grant at all, matching this app's minimal-permissions posture.
    // Not implemented on web (expo-contacts has no web picker) — caught
    // below rather than left to crash as an unhandled rejection.
    let contact: Contacts.ExistingContact | null;
    try {
      contact = await Contacts.presentContactPickerAsync();
    } catch {
      setError('Contact picker is not available here — enter the details manually.');
      return;
    }
    if (!contact) {
      return; // picker dismissed/cancelled
    }
    const email = contact.emails?.map((entry) => entry.email).find((value): value is string => Boolean(value));
    if (!email) {
      setError("Couldn't find an email address on that contact — enter it manually.");
      return;
    }
    setEmailInput(email);
    // `contact.name` is unreliable from the native picker specifically — on
    // iOS, presentContactPickerAsync's serialization path never populates
    // the combined `name` field (only firstName/middleName/lastName, which
    // it does set unconditionally), unlike getContactsAsync's normal query
    // path. Compose from the name parts rather than trusting `.name`.
    const composedName = [contact.firstName, contact.middleName, contact.lastName]
      .filter((part): part is string => Boolean(part && part.trim().length > 0))
      .join(' ');
    const resolvedName = contact.name?.trim() || composedName;
    if (resolvedName) {
      setDisplayName(resolvedName);
    }
  };

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
    if (!isValidEmail(emailInput)) {
      setError('Enter a valid email address.');
      return;
    }
    setIsSending(true);
    setError(null);
    const result = await inviteMember(token, groupId, normalizeEmail(emailInput), trimmedName);
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
      <Pressable accessibilityLabel="Choose from contacts" style={buttonStyles.secondary} onPress={handlePickContact}>
        <Text style={buttonStyles.secondaryText}>Choose from Contacts</Text>
      </Pressable>
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
        accessibilityLabel="Member's email address"
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
