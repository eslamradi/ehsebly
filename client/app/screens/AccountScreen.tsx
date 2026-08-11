import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { updateAccountName } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Account'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Matches the Worker's MAX_DISPLAY_NAME_LENGTH (routes/account.ts).
const MAX_NAME_LENGTH = 100;

/**
 * Two modes, one screen:
 * - requireName (route param): reached right after a brand-new sign-in, or
 *   whenever GroupListScreen finds a signed-in account with no name yet
 *   (covers accounts created before this screen existed). No Back/Sign Out —
 *   saving is the only way forward, then resets straight to GroupList.
 * - Normal: reached via GroupListScreen's "Account" button. Editable name,
 *   Back, and Sign Out (first UI wired to account.tsx's previously-dead
 *   signOut — see Story 2.1's Dev Notes).
 */
export default function AccountScreen({ navigation, route }: Props) {
  const requireName = route.params?.requireName ?? false;
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

  const { account, token, updateDisplayName, signOut } = useAccount();
  const [name, setName] = useState(account?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!token) {
      setError('Your session expired — go back and sign in again.');
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Enter your name.');
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await updateAccountName(token, trimmed);
    setIsSaving(false);
    if (result.status !== 'ok') {
      setError(result.message);
      return;
    }
    await updateDisplayName(result.data.displayName ?? trimmed);
    if (requireName) {
      navigation.navigate('GroupList');
    } else {
      navigation.goBack();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigation.navigate('Home');
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>{requireName ? "What's your name?" : 'Account'}</Text>
      {requireName && (
        <Text style={screenStyles.subheading}>So the people in your groups see your name instead of your email address.</Text>
      )}
      {account && <Text style={screenStyles.subheading}>{account.email}</Text>}
      <TextInput
        accessibilityLabel="Your name"
        style={styles.input}
        placeholder="Name"
        placeholderTextColor={colors.inkFaint}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        maxLength={MAX_NAME_LENGTH}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable
        accessibilityLabel={requireName ? 'Continue' : 'Save'}
        style={[buttonStyles.primary, isSaving && buttonStyles.disabled]}
        disabled={isSaving}
        onPress={handleSave}
      >
        <Text style={buttonStyles.primaryText}>{isSaving ? 'Saving…' : requireName ? 'Continue' : 'Save'}</Text>
      </Pressable>
      {!requireName && (
        <>
          <Pressable accessibilityLabel="Back" style={buttonStyles.secondary} onPress={() => navigation.goBack()}>
            <Text style={buttonStyles.secondaryText}>Back</Text>
          </Pressable>
          <Pressable accessibilityLabel="Sign out" style={buttonStyles.secondary} onPress={handleSignOut}>
            <Text style={buttonStyles.secondaryText}>Sign Out</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
