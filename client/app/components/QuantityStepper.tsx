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
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        style={[styles.button, !canDecrease && styles.buttonDisabled]}
        disabled={!canDecrease}
        onPress={() => onChange(value - 1)}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        style={[styles.button, !canIncrease && styles.buttonDisabled]}
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}
