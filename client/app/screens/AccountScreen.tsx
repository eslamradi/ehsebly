import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { updateAccountName } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { useI18n } from '../i18n';
import { LOCALE_ORDER } from '../i18n';
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
  const { locale, setLocale, t } = useI18n();

  const design = useMemo(
    () =>
      StyleSheet.create({
        title: { fontFamily: theme.fonts.headingSemiBold, fontSize: 32, color: colors.ink, marginBottom: 18 },
        // Profile card: the avatar carries the accent so the screen has one
        // warm anchor rather than a wall of rows.
        profile: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: colors.paperRaised,
          borderRadius: 26,
          padding: 16,
        },
        avatar: {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarText: { fontFamily: theme.fonts.headingSemiBold, fontSize: 22, color: colors.accent },
        profileName: { fontFamily: theme.fonts.sansBold, fontSize: 16, color: colors.ink },
        profileSub: { fontFamily: theme.fonts.sansRegular, fontSize: 12.5, color: colors.inkSoft, marginTop: 2 },
        sectionLabel: {
          fontFamily: theme.fonts.sansSemiBold,
          fontSize: 11,
          letterSpacing: 0.9,
          color: colors.accent,
          marginTop: 18,
          marginBottom: 8,
        },
        localeRow: { flexDirection: 'row', gap: 8 },
        localePill: {
          paddingVertical: 9,
          paddingHorizontal: 18,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: colors.line,
        },
        localePillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
        localeText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.ink },
        localeTextOn: { color: colors.accentInk },
        menuRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        },
        menuLabel: { flex: 1, fontFamily: theme.fonts.sansSemiBold, fontSize: 14, color: colors.ink },
        menuChevron: { fontFamily: theme.fonts.sansRegular, fontSize: 16, color: colors.inkFaint },
        signOut: {
          textAlign: 'center',
          fontFamily: theme.fonts.sansBold,
          fontSize: 14,
          color: colors.accent,
          paddingTop: 24,
          paddingBottom: 18,
        },
      }),
    [theme, colors],
  );
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

  const initial = (account?.displayName || account?.email || '?').trim().charAt(0).toUpperCase();

  // The name form is only the first-sign-in moment; the settled screen is a
  // profile card, a language choice and a way out. Payment and notification
  // rows from the design are left out on purpose — neither exists, and a row
  // that opens nothing is worse than an absent one.
  if (requireName) {
    return (
      <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
        <Text style={design.title}>{t('account.nameTitle')}</Text>
        <Text style={design.profileSub}>{t('account.nameSub')}</Text>
        <TextInput
          accessibilityLabel={t('account.a11yName')}
          style={styles.input}
          placeholder={t('account.namePlaceholder')}
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
          accessibilityLabel={t('common.continue')}
          style={[buttonStyles.primary, isSaving && buttonStyles.disabled]}
          disabled={isSaving}
          onPress={handleSave}
        >
          <Text style={buttonStyles.primaryText}>{isSaving ? t('account.saving') : t('common.continue')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={design.title}>{t('account.title')}</Text>

      <View style={design.profile}>
        <View style={design.avatar}>
          <Text style={design.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={design.profileName}>{account?.displayName || t('account.signedOutName')}</Text>
          <Text style={design.profileSub}>{account?.email || t('account.signedOutSub')}</Text>
        </View>
      </View>

      <Text style={design.sectionLabel}>{t('account.language')}</Text>
      <View style={design.localeRow}>
        {LOCALE_ORDER.map((code) => {
          const on = locale === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(`language.${code}`)}
              style={[design.localePill, on && design.localePillOn]}
              onPress={() => void setLocale(code)}
            >
              <Text style={[design.localeText, on && design.localeTextOn]}>{code.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityLabel={t('account.help')}
        style={design.menuRow}
        onPress={() => void Linking.openURL('mailto:hi@eslamradi.com')}
      >
        <Text style={design.menuLabel}>{t('account.help')}</Text>
        <Text style={design.menuChevron}>›</Text>
      </Pressable>

      {account && (
        <Pressable accessibilityLabel={t('account.signOut')} onPress={handleSignOut}>
          <Text style={design.signOut}>{t('account.signOut')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
