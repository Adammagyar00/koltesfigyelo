import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { transactionTitle } from '@/components/transaction-row';
import { Button, Card, Empty, Field, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, getCategory } from '@/lib/categories';
import { countMatches, suggestRulePattern } from '@/lib/categorize';
import { formatDate, formatMoney } from '@/lib/format';
import { useData } from '@/state/data';

const BANK_NAMES: Record<string, string> = { erste: 'Erste', mbh: 'MBH', wise: 'Wise', other: 'Egyéb' };

export default function TransactionScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, userRules, rules, setCategory, removeTransaction } = useData();
  const tx = transactions.find((t) => t.id === id);

  const [picked, setPicked] = useState<string | null>(null);
  const categoryId = picked ?? tx?.categoryId ?? '';
  const [makeRule, setMakeRule] = useState(true);
  const [pattern, setPattern] = useState(tx ? suggestRulePattern(tx) : '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const matches = useMemo(() => (tx ? countMatches(transactions, pattern, tx.id) : 0), [transactions, pattern, tx]);

  if (!tx) {
    return (
      <Screen tabs={false}>
        <Empty title="A tétel nem található" action={<Button title="Vissza" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const rule = tx.ruleId ? rules.find((r) => r.id === tx.ruleId) : undefined;
  const changed = categoryId !== tx.categoryId || tx.categorySource !== 'user';

  const save = async () => {
    setBusy(true);
    try {
      const n = await setCategory(tx, categoryId, makeRule && pattern.trim() ? pattern : undefined);
      if (makeRule && pattern.trim()) {
        setResult(n > 0 ? `Szabály mentve, és ${n} másik tétel is átkerült.` : 'Szabály mentve. A jövőbeli importoknál is így soroljuk be.');
      } else {
        router.back();
      }
    } catch (e) {
      setResult(`Hiba: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeTransaction(tx.id);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const existingRule = userRules.find((r) => r.pattern === pattern.trim().toUpperCase());

  return (
    <Screen tabs={false}>
      <Card>
        <ThemedText style={{ fontSize: 30, fontWeight: '800', color: tx.amount > 0 ? theme.success : theme.text }}>
          {tx.amount > 0 ? '+' : ''}
          {formatMoney(tx.amount, tx.currency)}
        </ThemedText>
        <ThemedText style={{ fontSize: 18, fontWeight: '600' }}>{transactionTitle(tx)}</ThemedText>
        {tx.counterparty && tx.description ? <ThemedText themeColor="textSecondary">{tx.description}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(tx.date)} · {BANK_NAMES[tx.bank] ?? tx.bank}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {tx.categorySource === 'user'
            ? 'Kézzel besorolva'
            : tx.ruleId === 'own:pair'
              ? 'Saját átvezetés: ugyanennyi ment ki az egyik bankodból és jött be a másikba'
              : tx.ruleId?.startsWith('own:')
                ? 'Saját átvezetés: a neved vagy a számlaszámod szerepel benne'
                : rule
              ? `Szabály alapján: „${rule.pattern}”`
              : 'Nem találtunk illő szabályt'}
        </ThemedText>
      </Card>

      <SectionTitle>Kategória</SectionTitle>
      <View style={styles.grid}>
        {CATEGORIES.map((c) => {
          const selected = c.id === categoryId;
          return (
            <Pressable
              key={c.id}
              onPress={() => setPicked(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: selected ? `${c.color}33` : theme.backgroundElement,
                  borderColor: selected ? c.color : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText style={{ fontSize: 22 }}>{c.icon}</ThemedText>
              <ThemedText type="small" numberOfLines={2} style={{ textAlign: 'center' }}>
                {c.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <ThemedText style={{ flex: 1, fontWeight: '600' }}>Jegyezze meg az app</ThemedText>
          <Switch value={makeRule} onValueChange={setMakeRule} trackColor={{ true: theme.tint }} />
        </View>
        {makeRule ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Minden tétel, amiben ez a szó szerepel, „{getCategory(categoryId).name}” lesz, most és a jövőbeli
              importoknál is.
            </ThemedText>
            <Field value={pattern} onChangeText={setPattern} autoCapitalize="characters" autoCorrect={false} />
            <ThemedText type="small" themeColor="textSecondary">
              {pattern.trim() ? `${matches} másik tételre illik.` : 'Adj meg egy kulcsszót.'}
              {existingRule ? ` A meglévő „${existingRule.pattern}” szabályt lecseréli.` : ''}
            </ThemedText>
          </>
        ) : null}
      </Card>

      {result ? (
        <Card>
          <ThemedText>{result}</ThemedText>
          <Button title="Kész" onPress={() => router.back()} />
        </Card>
      ) : (
        <Button title="Mentés" onPress={save} loading={busy} disabled={!changed && !makeRule} />
      )}

      <Button variant="ghost" title="Tétel törlése" onPress={remove} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: 12,
    borderWidth: 2,
  },
});
