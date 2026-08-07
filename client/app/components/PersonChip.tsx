import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme, userTextStyle } from '../theme';

type PersonChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /**
   * Rendered as a badge inside a selected chip. Pass it *only* when the
   * item's weights are actually uneven — an even share must show no number at
   * all. Badging "3" on both chips of a "Water ×10" split 3/3 would say three
   * waters each while the pair is charged for ten, which is the precise
   * misreading the redesign exists to remove (same rule as
   * `describePersonItems`). When weights are uneven every assignee is badged,
   * including a weight of 1, since the numbers are only legible relative to
   * one another.
   */
  count?: number;
  /**
   * "everyone" is the select-all control, not a participant. It gets a soft
   * fill instead of the solid accent so it never reads as a person named
   * "Everyone" sitting first in a row of solid person chips.
   */
  variant?: 'person' | 'everyone';
};

// Both platforms' guidelines put the minimum touch target at 44pt; the chip's
// padding alone came to roughly 35. Height is enforced here rather than by
// growing the padding so the pill's proportions stay the same.
const MIN_TOUCH_TARGET = 44;

// A name longer than this is truncated with a tail ellipsis rather than
// allowed to push the chip wide enough to force its own row. Eight people is
// the realistic upper bound for a table and full-length Arabic/English names
// at that count would otherwise wrap the row three deep.
const MAX_LABEL_CHARS = 14;

/**
 * The single "is this person on this item" control, used for every item
 * regardless of quantity — the unification described in
 * ItemAssignmentScreen's header comment. Selection is carried by fill, which
 * is the primary (and for a weight of 1, only) signal; a count badge is
 * secondary metadata layered on top, never the thing you have to read to know
 * whether someone is included.
 */
export function PersonChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  count,
  variant = 'person',
}: PersonChipProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: MIN_TOUCH_TARGET,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
        },
        chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
        // The select-all control: accent-outlined when off, softly filled when
        // on — visibly a control in both states, never mistaken for a person.
        chipEveryone: { borderColor: colors.accent },
        chipEveryoneSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        text: { fontFamily: theme.fonts.sansSemiBold, fontSize: 14, color: colors.ink },
        textSelected: { color: colors.accentInk },
        textEveryone: { color: colors.accent },
        textEveryoneSelected: { color: colors.accent },
        countBadge: {
          minWidth: 22,
          paddingHorizontal: 5,
          paddingVertical: 1,
          borderRadius: radii.pill,
          backgroundColor: colors.accentInk,
          alignItems: 'center',
        },
        countText: { fontFamily: theme.fonts.monoSemiBold, fontSize: 12, color: colors.accent },
      }),
    [theme],
  );

  const isEveryone = variant === 'everyone';
  const displayLabel =
    label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…` : label;
  // Callers withhold `count` entirely for an even share, so the common path
  // renders as a plain selected chip with no number to misread.
  const showCount = !isEveryone && selected && typeof count === 'number';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.chip,
        isEveryone && styles.chipEveryone,
        selected && (isEveryone ? styles.chipEveryoneSelected : styles.chipSelected),
      ]}
      onPress={onPress}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          // A person's name is user data — see userTextStyle. The Everyone
          // chip is our own copy, so it follows the locale like any label.
          !isEveryone && userTextStyle(label, 'sansSemiBold', theme.fonts),
          isEveryone && styles.textEveryone,
          selected && (isEveryone ? styles.textEveryoneSelected : styles.textSelected),
        ]}
      >
        {displayLabel}
      </Text>
      {showCount && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}
