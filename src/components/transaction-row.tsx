import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CategoryBadge } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { formatDate, formatMoney } from '@/lib/format';
import { stripWalletPrefix } from '@/lib/text';
import type { Transaction } from '@/lib/types';

export function transactionTitle(t: Pick<Transaction, 'counterparty' | 'description'>): string {
  return stripWalletPrefix(t.counterparty) || t.description || 'Ismeretlen tétel';
}

export function TransactionRow({ tx, onPress }: { tx: Transaction; onPress?: () => void }) {
  const theme = useTheme();
  const cat = getCategory(tx.categoryId);
  const open = onPress ?? (() => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } }));
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <CategoryBadge categoryId={tx.categoryId} />
      <View style={styles.middle}>
        <ThemedText numberOfLines={1} style={styles.title}>
          {transactionTitle(tx)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {formatDate(tx.date)} · {cat.name}
          {tx.categorySource === 'default' && tx.amount < 0 ? ' · besorolatlan' : ''}
        </ThemedText>
      </View>
      <ThemedText style={[styles.amount, { color: tx.amount > 0 ? theme.success : theme.text }]}>
        {tx.amount > 0 ? '+' : ''}
        {formatMoney(tx.amount, tx.currency)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  middle: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
