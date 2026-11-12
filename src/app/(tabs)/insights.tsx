import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, CategoryBadge, Empty, Loading, Screen, SectionTitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatMoney, todayISO } from '@/lib/format';
import { detectRecurring, monthOf, savingTips } from '@/lib/insights';
import { useData } from '@/state/data';

export default function InsightsScreen() {
  const theme = useTheme();
  const { transactions, budgets, loading } = useData();
  const today = todayISO();
  const month = transactions[0] && monthOf(transactions[0].date) < monthOf(today) ? monthOf(transactions[0].date) : monthOf(today);

  const { tips, recurring } = useMemo(
    () => ({
      tips: savingTips(transactions, month, today, budgets),
      recurring: detectRecurring(transactions, today),
    }),
    [transactions, budgets, month, today],
  );

  if (loading) return <Loading />;

  const totalSaving = tips.reduce((s, t) => s + (t.monthlySaving ?? 0), 0);
  const recurringHuf = recurring.filter((r) => r.currency === 'HUF');
  const recurringMonthly = recurringHuf.reduce((s, r) => s + r.averageAmount, 0);

  return (
    <Screen>
      <Title>Spórolás</Title>

      {transactions.length === 0 ? (
        <Empty
          title="Még nincs mit elemezni"
          body="Legalább 2-3 hónapnyi kivonat kell, hogy az app összehasonlíthassa a hónapokat és felismerje az előfizetéseket."
          action={<Button title="Importálás" onPress={() => router.push('/import')} />}
        />
      ) : (
        <>
          {totalSaving > 0 ? (
            <Card style={{ backgroundColor: `${theme.tint}22` }}>
              <ThemedText type="small" themeColor="textSecondary">
                Becsült lehetséges megtakarítás
              </ThemedText>
              <ThemedText style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', color: theme.tint }}>
                {formatMoney(totalSaving)} / hó
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Ez évente kb. {formatMoney(totalSaving * 12)}, ha az alábbi javaslatokat megfogadod.
              </ThemedText>
            </Card>
          ) : null}

          <SectionTitle>Javaslatok</SectionTitle>
          {tips.length === 0 ? (
            <Card>
              <ThemedText>👍 Most nincs kiugró tétel. A költéseid a szokásos szinten vannak.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Minél több hónapot importálsz, annál pontosabbak az összehasonlítások.
              </ThemedText>
            </Card>
          ) : (
            tips.map((tip) => (
              <Card key={tip.id}>
                <ThemedText style={{ fontWeight: '700', fontSize: 17 }}>
                  {tip.icon} {tip.title}
                </ThemedText>
                <ThemedText themeColor="textSecondary">{tip.body}</ThemedText>
                {tip.monthlySaving ? (
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    Lehetséges megtakarítás: {formatMoney(tip.monthlySaving)} / hó
                  </ThemedText>
                ) : null}
              </Card>
            ))
          )}

          <SectionTitle>Rendszeres terhelések</SectionTitle>
          {recurring.length === 0 ? (
            <Card>
              <ThemedText themeColor="textSecondary">
                Nem találtunk havonta ismétlődő terhelést. Ehhez legalább 3 hónapnyi adat kell.
              </ThemedText>
            </Card>
          ) : (
            <Card>
              {recurringHuf.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Havonta {formatMoney(recurringMonthly)}, évente {formatMoney(recurringMonthly * 12)}
                </ThemedText>
              ) : null}
              {recurring.map((r) => (
                <Pressable
                  key={`${r.merchant}-${r.currency}`}
                  onPress={() => router.push({ pathname: '/transactions', params: { category: r.categoryId } })}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Spacing.three,
                    paddingVertical: Spacing.two,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <CategoryBadge categoryId={r.categoryId} size={32} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: '600' }}>{r.merchant}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {r.months} hónapja · utoljára {formatDate(r.lastDate)}
                    </ThemedText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <ThemedText style={{ fontWeight: '700' }}>{formatMoney(r.averageAmount, r.currency)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatMoney(r.yearlyCost, r.currency)}/év
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
