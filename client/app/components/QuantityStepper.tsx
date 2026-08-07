import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radii, useTheme } from '../theme';

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  accessibilityLabel: string;
  min?: number;
  max?: number;
};

// The buttons render at 32×32 to keep the stepper compact inside a row, which
// is under the 44pt minimum touch target both platforms' guidelines ask for.
// Rather than grow the visual button (three screens lay out around its current
// size), 6pt of hitSlop on every edge brings the *touchable* area to 44×44
// while leaving the drawn control unchanged.
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;

/** A plain +/- counter, shared by ExtractedItemsScreen (an item's total quantity) and ItemAssignmentScreen (a person's allocated units of an item). */
export function QuantityStepper({ value, onChange, accessibilityLabel, min = 0, max = Infinity }: QuantityStepperProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        button: {
          width: 32,
          height: 32,
          borderRadius: radii.sm,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        },
        buttonDisabled: { opacity: 0.35 },
        buttonText: { fontFamily: fonts.sansBold, color: colors.accentInk, fontSize: 16 },
        value: {
          fontFamily: fonts.monoSemiBold,
          minWidth: 24,
          textAlign: 'center',
          fontSize: 16,
          color: colors.ink,
        },
      }),
    [colors],
  );

  const canDecrease = value > min;
  const canIncrease = value < max;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        hitSlop={HIT_SLOP}
        style={[styles.button, !canDecrease && styles.buttonDisabled]}
        disabled={!canDecrease}
        onPress={() => onChange(value - 1)}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        hitSlop={HIT_SLOP}
        style={[styles.button, !canIncrease && styles.buttonDisabled]}
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}
