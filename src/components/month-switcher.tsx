import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMonth } from '@/lib/format';
import { shiftMonth, type MonthKey } from '@/lib/insights';

export function MonthSwitcher({
  month,
  onChange,
  max,
}: {
  month: MonthKey;
  onChange: (m: MonthKey) => void;
  /** A legkésőbbi választható hónap (általában az aktuális). */
  max: MonthKey;
}) {
  const theme = useTheme();
  const canNext = month < max;
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        accessibilityLabel="Előző hónap"
        hitSlop={12}
        onPress={() => onChange(shiftMonth(month, -1))}
        style={styles.arrow}>
        <ThemedText style={styles.arrowText}>‹</ThemedText>
      </Pressable>
      <ThemedText style={styles.label}>{formatMonth(month)}</ThemedText>
      <Pressable
        accessibilityLabel="Következő hónap"
        hitSlop={12}
        disabled={!canNext}
        onPress={() => onChange(shiftMonth(month, 1))}
        style={[styles.arrow, { opacity: canNext ? 1 : 0.25 }]}>
        <ThemedText style={styles.arrowText}>›</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  arrow: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  arrowText: { fontSize: 26, lineHeight: 30, fontWeight: '600' },
  label: { fontSize: 16, fontWeight: '700' },
});
