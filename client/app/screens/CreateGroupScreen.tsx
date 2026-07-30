import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createGroup } from '../api/groupApi';
import { useAccount } from '../domain/account';
import type { GroupKind } from '../domain/group';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

const KIND_OPTIONS: Array<{ value: GroupKind; label: string }> = [
  { value: 'household', label: 'Household' },
  { value: 'trip', label: 'Trip' },
  { value: 'other', label: 'Other' },
];

export default function CreateGroupScreen({ navigation }: Props) {
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
    kindRow: { flexDirection: 'row', gap: spacing.sm },
    chip: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.pill,
      paddingVertical: 8,
      paddingHorizontal: spacing.lg,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink },
    chipTextActive: { color: colors.accentInk },
    errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 13 },
  });

  const { token } = useAccount();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('household');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!token) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Enter a name for this group.');
      return;
    }
    setIsCreating(true);
    setError(null);
    const result = await createGroup(token, trimmed, kind);
    setIsCreating(false);
    if (result.status !== 'ok') {
      setError(result.message);
      return;
    }
    navigation.replace('GroupDetail', { groupId: result.data.id });
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>New Group</Text>
      <TextInput
        accessibilityLabel="Group name"
        style={styles.input}
        placeholder="e.g. The Flat, Alexandria Trip"
        placeholderTextColor={colors.inkFaint}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
      />
      <View style={styles.kindRow}>
        {KIND_OPTIONS.map((option) => {
          const active = kind === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${option.label} group`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setKind(option.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable
        accessibilityLabel="Create group"
        style={[buttonStyles.primary, isCreating && buttonStyles.disabled]}
        disabled={isCreating}
        onPress={handleCreate}
      >
        <Text style={buttonStyles.primaryText}>{isCreating ? 'Creating…' : 'Create'}</Text>
      </Pressable>
    </ScrollView>
  );
}
