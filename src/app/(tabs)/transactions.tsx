import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { TransactionRow } from '@/components/transaction-row';
import { Button, Chip, Empty, Field, Loading, Title } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { allCategories, getCategory } from '@/lib/categories';
import { formatMoney, formatMonth } from '@/lib/format';
import { monthOf } from '@/lib/insights';
import { normalize } from '@/lib/text';
import { useData } from '@/state/data';

const UNCATEGORIZED = 'uncategorized';

export default function TransactionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ month?: string; category?: string }>();
  const { transactions, loading } = useData();
  const [query, setQuery] = useState('');
  const month = params.month ?? null;
  const category = params.category ?? null;

  const setFilter = (next: { month?: string | null; category?: string | null }) => {
    router.setParams({
      month: (next.month !== undefined ? next.month : month) ?? undefined,
      category: (next.category !== undefined ? next.category : category) ?? undefined,
    });
  };

  const filtered = useMemo(() => {
    const q = normalize(query);
    return transactions.filter((t) => {
      if (month && monthOf(t.date) !== month) return false;
      if (category === UNCATEGORIZED) {
        if (!(t.categorySource === 'default' && t.amount < 0)) return false;
      } else if (category && t.categoryId !== category) return false;
      if (q && !normalize(`${t.counterparty} ${t.description}`).includes(q)) return false;
      return true;
    });
  }, [transactions, month, category, query]);

  const total = useMemo(
    () => filtered.filter((t) => t.currency === 'HUF').reduce((s, t) => s + t.amount, 0),
    [filtered],
  );

  if (loading) return <Loading />;

  const categoryLabel =
    category === UNCATEGORIZED ? 'Besorolatlan' : category ? `${getCategory(category).icon} ${getCategory(category).name}` : null;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.three,
        paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        paddingHorizontal: Spacing.three,
        width: '100%',
        maxWidth: MaxContentWidth,
        alignSelf: 'center',
      }}
      keyboardShouldPersistTaps="handled"
      data={filtered}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => <TransactionRow tx={item} />}
      initialNumToRender={20}
      ListHeaderComponent={
        <View style={{ gap: Spacing.three, marginBottom: Spacing.two }}>
          <Title>Tételek</Title>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Keresés kereskedőre, közleményre…"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
            {month ? <Chip label={`${formatMonth(month)} ✕`} selected onPress={() => setFilter({ month: null })} /> : null}
            {categoryLabel ? <Chip label={`${categoryLabel} ✕`} selected onPress={() => setFilter({ category: null })} /> : null}
            {category !== UNCATEGORIZED ? (
              <Chip label="Besorolatlan" onPress={() => setFilter({ category: UNCATEGORIZED })} />
            ) : null}
            {!category
              ? allCategories().map((c) => (
                  <Chip key={c.id} label={`${c.icon} ${c.name}`} onPress={() => setFilter({ category: c.id })} />
                ))
              : null}
          </ScrollView>
          {filtered.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {filtered.length} tétel · összesen {formatMoney(total)}
            </ThemedText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        transactions.length === 0 ? (
          <Empty
            title="Még nincsenek tételeid"
            body="Importálj egy bankszámlakivonatot."
            action={<Button title="Importálás" onPress={() => router.push('/import')} />}
          />
        ) : (
          <Empty title="Nincs találat" body="Próbálj más keresést vagy szűrőt." />
        )
      }
    />
  );
}
