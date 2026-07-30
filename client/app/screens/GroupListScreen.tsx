import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { acceptGroupInvite, listGroups } from '../api/groupApi';
import { useAccount } from '../domain/account';
import type { Group } from '../domain/group';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupList'>;

export default function GroupListScreen({ navigation }: Props) {
  const theme = useTheme();
  const { screenStyles, buttonStyles } = theme;
  const styles = StyleSheet.create({
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    backButton: {
      backgroundColor: theme.colors.paperRaised,
      borderWidth: 1,
      borderColor: theme.colors.line,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.sm,
    },
    sectionLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: theme.colors.inkSoft, textTransform: 'uppercase' },
    groupRow: {
      backgroundColor: theme.colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: 4,
      ...theme.cardShadow,
    },
    pendingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.md,
      ...theme.cardShadow,
    },
    pendingInfo: { flex: 1, gap: 4 },
    groupName: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: theme.colors.ink },
    groupDetail: { fontFamily: fonts.sansRegular, fontSize: 13, color: theme.colors.inkSoft },
    acceptButton: {
      backgroundColor: theme.colors.accent,
      paddingVertical: 8,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.sm,
    },
  });

  const { token } = useAccount();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [pendingGroups, setPendingGroups] = useState<Group[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) {
      return;
    }
    listGroups(token).then((result) => {
      if (result.status === 'ok') {
        setGroups(result.data.groups);
        setPendingGroups(result.data.pendingGroups);
      }
    });
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!token) {
        return;
      }
      listGroups(token).then((result) => {
        if (!cancelled && result.status === 'ok') {
          setGroups(result.data.groups);
          setPendingGroups(result.data.pendingGroups);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const handleAccept = async (groupId: string) => {
    if (!token) {
      return;
    }
    setAcceptingId(groupId);
    await acceptGroupInvite(token, groupId);
    setAcceptingId(null);
    // Re-fetch rather than optimistically mutate local state — the accepted
    // group also needs its real member_count picked up for the active list.
    refresh();
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>Groups</Text>
        <Pressable accessibilityLabel="Back to home" style={styles.backButton} onPress={() => navigation.navigate('Home')}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>

      {pendingGroups.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Pending invites</Text>
          {pendingGroups.map((group) => (
            <View key={group.id} style={styles.pendingRow}>
              <View style={styles.pendingInfo}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupDetail}>
                  {group.kind === 'trip' ? 'Trip' : group.kind === 'household' ? 'Household' : 'Group'} · invited you
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Accept invite to ${group.name}`}
                style={styles.acceptButton}
                disabled={acceptingId === group.id}
                onPress={() => handleAccept(group.id)}
              >
                <Text style={buttonStyles.primaryText}>{acceptingId === group.id ? '…' : 'Accept'}</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      {groups === null && <Text style={screenStyles.subheading}>Loading…</Text>}
      {groups !== null && groups.length === 0 && pendingGroups.length === 0 && (
        <Text style={screenStyles.subheading}>No groups yet — create one for a household or a trip.</Text>
      )}

      {groups?.map((group) => (
        <Pressable
          key={group.id}
          accessibilityLabel={`Open ${group.name}`}
          style={styles.groupRow}
          onPress={() => navigation.navigate('GroupDetail', { groupId: group.id })}
        >
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupDetail}>
            {group.kind === 'trip' ? 'Trip' : group.kind === 'household' ? 'Household' : 'Group'} · {group.memberCount}{' '}
            {group.memberCount === 1 ? 'member' : 'members'}
          </Text>
        </Pressable>
      ))}

      <Pressable accessibilityLabel="Create a group" style={buttonStyles.primary} onPress={() => navigation.navigate('CreateGroup')}>
        <Text style={buttonStyles.primaryText}>Create Group</Text>
      </Pressable>
    </ScrollView>
  );
}
