import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MonthSwitcher } from '@/components/month-switcher';
import { ThemedText } from '@/components/themed-text';
import { UpdateBanner } from '@/components/update-banner';
import { Button, Card, CategoryBadge, Empty, Loading, ProgressBar, Screen, SectionTitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { formatMoney, formatMonth, todayISO } from '@/lib/format';
import { budgetStatuses, monthlyTrend, monthOf, savingTips, shiftMonth, summarizeMonth } from '@/lib/insights';
import { useData } from '@/state/data';

export default function OverviewScreen() {
  const theme = useTheme();
  const { transactions, budgets, loading, error } = useData();
  const today = todayISO();
  const currentMonth = monthOf(today);
  const latestMonth = transactions[0] ? monthOf(transactions[0].date) : currentMonth;
  const [picked, setPicked] = useState<string | null>(null);
  // Ha az aktuális hónapban még nincs adat, a legutóbbi importált hónapot mutatjuk.
  const month = picked ?? (latestMonth < currentMonth ? latestMonth : currentMonth);

  const data = useMemo(() => {
    const summary = summarizeMonth(transactions, month);
    // Folyamatban lévő hónapnál az előző hónap azonos időszakával vetjük össze (1..mai nap).
    const isCurrent = month === monthOf(today);
    const previous = summarizeMonth(transactions, shiftMonth(month, -1), 'HUF', isCurrent ? Number(today.slice(8, 10)) : undefined);
    return {
      summary,
      previous,
      trend: monthlyTrend(transactions, month, 6),
      budgets: budgetStatuses(budgets, summary, today).filter((b) => b.state !== 'ok'),
      tips: savingTips(transactions, month, today, budgets).slice(0, 2),
      transfers: transactions.filter((t) => monthOf(t.date) === month && t.categoryId === 'atvezetes').length,
      uncategorized: transactions.filter(
        (t) => monthOf(t.date) === month && t.amount < 0 && t.categorySource === 'default',
      ).length,
    };
  }, [transactions, budgets, month, today]);

  if (loading) return <Loading />;

  const header = (
    <Title
      right={
        <Pressable accessibilityLabel="Beállítások" hitSlop={12} onPress={() => router.push('/settings')}>
          <ThemedText style={{ fontSize: 24 }}>⚙️</ThemedText>
        </Pressable>
      }>
      Áttekintés
    </Title>
  );

  if (transactions.length === 0) {
    return (
      <Screen>
        {header}
        <UpdateBanner />
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
        <Empty
          title="Még nincsenek tételeid"
          body="Töltsd le a számlatörténetedet CSV-ben az Erste, MBH vagy Wise netbankjából, és importáld be."
          action={<Button title="Kivonat importálása" onPress={() => router.push('/import')} style={{ marginTop: Spacing.two }} />}
        />
      </Screen>
    );
  }

  const { summary, previous, trend } = data;
  const change = previous.spent > 0 ? (summary.spent / previous.spent - 1) * 100 : null;
  const maxTrend = Math.max(1, ...trend.map((t) => t.spent));

  return (
    <Screen>
      {header}
      <UpdateBanner />
      <MonthSwitcher month={month} onChange={setPicked} max={currentMonth} />

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Kiadás
        </ThemedText>
        <ThemedText style={styles.big}>{formatMoney(summary.spent)}</ThemedText>
        {change !== null ? (
          <ThemedText type="small" style={{ color: change > 0 ? theme.danger : theme.success }}>
            {change > 0 ? '▲' : '▼'} {Math.abs(Math.round(change))}%{' '}
            {month === currentMonth ? 'az előző hónap azonos időszakához képest' : 'az előző hónaphoz képest'}
          </ThemedText>
        ) : null}
        <View style={styles.row}>
          <Stat label="Bevétel" value={formatMoney(summary.income)} />
          <Stat
            label="Egyenleg"
            value={formatMoney(summary.income - summary.spent)}
            color={summary.income - summary.spent >= 0 ? theme.success : theme.danger}
          />
        </View>
        {data.transfers > 0 ? (
          <Pressable onPress={() => router.push({ pathname: '/transactions', params: { month, category: 'atvezetes' } })}>
            <ThemedText type="small" themeColor="textSecondary">
              🔄 {data.transfers} saját számlák közötti átvezetés nincs benne az összegekben ›
            </ThemedText>
          </Pressable>
        ) : null}
        {summary.otherCurrencyCount > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {summary.otherCurrencyCount} nem forintos tétel (pl. Wise EUR) nincs benne az összegekben.
          </ThemedText>
        ) : null}
      </Card>

      {data.uncategorized > 0 ? (
        <Pressable onPress={() => router.push({ pathname: '/transactions', params: { month, category: 'uncategorized' } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <ThemedText style={{ fontSize: 20 }}>🏷️</ThemedText>
            <ThemedText style={{ flex: 1 }}>
              {data.uncategorized} besorolatlan tétel. Ha besorolod, az app megtanulja a kereskedőt.
            </ThemedText>
            <ThemedText themeColor="textSecondary">›</ThemedText>
          </Card>
        </Pressable>
      ) : null}

      {data.budgets.length > 0 ? (
        <>
          <SectionTitle>Figyelmeztetések</SectionTitle>
          {data.budgets.map((b) => {
            const cat = getCategory(b.categoryId);
            const color = b.state === 'over' ? theme.danger : theme.warning;
            return (
              <Card key={b.categoryId}>
                <View style={styles.row}>
                  <ThemedText style={{ flex: 1, fontWeight: '600' }}>
                    {cat.icon} {cat.name}
                  </ThemedText>
                  <ThemedText style={{ color, fontWeight: '700' }}>{Math.round(b.ratio * 100)}%</ThemedText>
                </View>
                <ProgressBar ratio={b.ratio} color={color} />
                <ThemedText type="small" themeColor="textSecondary">
                  {formatMoney(b.spent)} / {formatMoney(b.limit)}
                  {b.state === 'warning' && b.projected > b.limit ? ` · várhatóan ${formatMoney(b.projected)}` : ''}
                </ThemedText>
              </Card>
            );
          })}
        </>
      ) : null}

      <SectionTitle>Hova ment a pénz</SectionTitle>
      <Card>
        {summary.byCategory.length === 0 ? (
          <ThemedText themeColor="textSecondary">Ebben a hónapban nincs kiadás.</ThemedText>
        ) : (
          summary.byCategory.map((c) => {
            const cat = getCategory(c.categoryId);
            const share = summary.spent > 0 ? c.total / summary.spent : 0;
            return (
              <Pressable
                key={c.categoryId}
                onPress={() => router.push({ pathname: '/transactions', params: { month, category: c.categoryId } })}
                style={({ pressed }) => [styles.catRow, { opacity: pressed ? 0.6 : 1 }]}>
                <CategoryBadge categoryId={c.categoryId} size={32} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.row}>
                    <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                      {cat.name}
                    </ThemedText>
                    <ThemedText style={{ fontWeight: '700' }}>{formatMoney(c.total)}</ThemedText>
                  </View>
                  <ProgressBar ratio={share} color={cat.color} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {Math.round(share * 100)}% · {c.count} tétel
                  </ThemedText>
                </View>
              </Pressable>
            );
          })
        )}
      </Card>

      <SectionTitle>Utolsó 6 hónap</SectionTitle>
      <Card>
        <View style={styles.chart}>
          {trend.map((t) => (
            <Pressable key={t.month} style={styles.barCol} onPress={() => setPicked(t.month)}>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                {t.spent > 0 ? `${Math.round(t.spent / 1000)}e` : ''}
              </ThemedText>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, (t.spent / maxTrend) * 120),
                    backgroundColor: t.month === month ? theme.tint : theme.backgroundSelected,
                  },
                ]}
              />
              <ThemedText type="small" themeColor={t.month === month ? 'text' : 'textSecondary'} style={{ fontSize: 12 }}>
                {formatMonth(t.month).split(' ')[1].slice(0, 3)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </Card>

      {data.tips.length > 0 ? (
        <>
          <SectionTitle>Spórolási lehetőségek</SectionTitle>
          {data.tips.map((tip) => (
            <Card key={tip.id}>
              <ThemedText style={{ fontWeight: '700' }}>
                {tip.icon} {tip.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {tip.body}
              </ThemedText>
            </Card>
          ))}
          <Button variant="ghost" title="Összes tipp és előfizetés" onPress={() => router.push('/insights')} />
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, marginTop: Spacing.two }}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={{ fontSize: 18, fontWeight: '700', color }}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 36, lineHeight: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '55%', borderRadius: 6 },
});
