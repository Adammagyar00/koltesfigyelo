import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, CategoryBadge, Field, Loading, ProgressBar, Screen, SectionTitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES } from '@/lib/categories';
import { parseAmount } from '@/lib/csv/values';
import { formatMoney, formatMonth, todayISO } from '@/lib/format';
import { budgetStatuses, monthlyTrend, monthOf, shiftMonth, summarizeMonth } from '@/lib/insights';
import { useData } from '@/state/data';

export default function BudgetsScreen() {
  const theme = useTheme();
  const { transactions, budgets, setBudget, loading } = useData();
  const today = todayISO();
  const month = monthOf(today);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const { statuses, averages } = useMemo(() => {
    const summary = summarizeMonth(transactions, month);
    // Az előző 3 lezárt hónap átlaga – ebből javasolunk keretet.
    const past = monthlyTrend(transactions, shiftMonth(month, -1), 3).filter((s) => s.spent > 0);
    const avg = new Map<string, number>();
    for (const c of CATEGORIES) {
      if (past.length === 0) break;
      const total = past.reduce((s, p) => s + (p.byCategory.find((x) => x.categoryId === c.id)?.total ?? 0), 0);
      if (total > 0) avg.set(c.id, total / past.length);
    }
    const all = budgetStatuses(
      CATEGORIES.filter((c) => c.kind === 'expense').map((c) => ({
        categoryId: c.id,
        monthlyLimit: budgets.find((b) => b.categoryId === c.id)?.monthlyLimit ?? 0,
      })),
      summary,
      today,
    );
    return { statuses: new Map(all.map((s) => [s.categoryId, s])), averages: avg };
  }, [transactions, budgets, month, today]);

  if (loading) return <Loading />;

  const totalLimit = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = budgets.reduce((s, b) => s + (statuses.get(b.categoryId)?.spent ?? 0), 0);

  const startEdit = (categoryId: string) => {
    const current = budgets.find((b) => b.categoryId === categoryId)?.monthlyLimit;
    const suggestion = averages.get(categoryId);
    setEditing(categoryId);
    setValue(current ? String(current) : suggestion ? String(Math.round((suggestion * 0.9) / 1000) * 1000) : '');
  };

  const save = async (categoryId: string, limit: number | null) => {
    setSaving(true);
    try {
      await setBudget(categoryId, limit);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Title>Keretek</Title>
      <ThemedText themeColor="textSecondary">
        Adj meg havi keretet a kategóriáknak. Szólunk, ha a költési tempód alapján túllépnéd. {formatMonth(month)}
      </ThemedText>

      {budgets.length > 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Összes keret
          </ThemedText>
          <ThemedText style={{ fontSize: 24, fontWeight: '800' }}>
            {formatMoney(totalSpent)} / {formatMoney(totalLimit)}
          </ThemedText>
          <ProgressBar ratio={totalLimit ? totalSpent / totalLimit : 0} color={totalSpent > totalLimit ? theme.danger : theme.tint} />
        </Card>
      ) : null}

      <SectionTitle>Kategóriák</SectionTitle>
      {CATEGORIES.filter((c) => c.kind === 'expense').map((c) => {
        const st = statuses.get(c.id);
        const limit = budgets.find((b) => b.categoryId === c.id)?.monthlyLimit;
        const avg = averages.get(c.id);
        const color = st?.state === 'over' ? theme.danger : st?.state === 'warning' ? theme.warning : theme.tint;
        const isEditing = editing === c.id;
        return (
          <Card key={c.id}>
            <Pressable onPress={() => (isEditing ? setEditing(null) : startEdit(c.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <CategoryBadge categoryId={c.id} size={32} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>{c.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatMoney(st?.spent ?? 0)}
                  {limit ? ` / ${formatMoney(limit)}` : ' · nincs keret'}
                  {avg ? ` · átlag ${formatMoney(avg)}` : ''}
                </ThemedText>
              </View>
              <ThemedText style={{ color: theme.tint, fontWeight: '600' }}>{isEditing ? 'Bezár' : limit ? 'Módosít' : 'Beállít'}</ThemedText>
            </Pressable>
            {limit ? <ProgressBar ratio={st?.ratio ?? 0} color={color} /> : null}
            {limit && st && st.state === 'warning' && st.projected > limit ? (
              <ThemedText type="small" style={{ color: theme.warning }}>
                Ezzel a tempóval a hónap végére kb. {formatMoney(st.projected)} lesz.
              </ThemedText>
            ) : null}
            {isEditing ? (
              <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                <Field
                  label="Havi keret (Ft)"
                  value={value}
                  onChangeText={setValue}
                  keyboardType="number-pad"
                  placeholder="pl. 60000"
                  autoFocus
                />
                {avg && !limit ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Javaslat: az elmúlt hónapok átlagánál 10%-kal kevesebb.
                  </ThemedText>
                ) : null}
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  {limit ? (
                    <Button variant="secondary" title="Törlés" onPress={() => save(c.id, null)} style={{ flex: 1 }} />
                  ) : null}
                  <Button
                    title="Mentés"
                    loading={saving}
                    style={{ flex: 2 }}
                    disabled={!(parseAmount(value) ?? 0)}
                    onPress={() => save(c.id, Math.abs(parseAmount(value) ?? 0))}
                  />
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
