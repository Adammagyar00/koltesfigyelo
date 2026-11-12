import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, CategoryBadge, Empty, Loading, Screen, SectionTitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatMoney, formatMonth, todayISO } from '@/lib/format';
import type { InvestmentMonth } from '@/lib/insights';
import { detectRecurring, investmentTrend, monthOf, savingTips } from '@/lib/insights';
import { useData } from '@/state/data';

export default function InsightsScreen() {
  const theme = useTheme();
  // Az összesítésekhez a forintra számolt tételek kellenek.
  const { baseTransactions: transactions, budgets, loading } = useData();
  const today = todayISO();
  const month = transactions[0] && monthOf(transactions[0].date) < monthOf(today) ? monthOf(transactions[0].date) : monthOf(today);

  const { tips, recurring, investments } = useMemo(
    () => ({
      tips: savingTips(transactions, month, today, budgets),
      investments: investmentTrend(transactions, month, 6),
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

          <InvestmentSection months={investments} />

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

function InvestmentSection({ months }: { months: InvestmentMonth[] }) {
  const theme = useTheme();
  const current = months[months.length - 1];
  const withData = months.filter((m) => m.invested !== 0);
  if (withData.length === 0) return null;
  const max = Math.max(1, ...months.map((m) => Math.abs(m.invested)));
  const avg = withData.reduce((s, m) => s + m.invested, 0) / withData.length;
  return (
    <>
      <SectionTitle>Befektetés, megtakarítás</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {formatMonth(current.month)}: nettó félretett összeg
        </ThemedText>
        <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: '800', color: current.invested >= 0 ? theme.tint : theme.danger }}>
          {formatMoney(current.invested)}
        </ThemedText>
        {current.rate !== null ? (
          <ThemedText type="small" themeColor="textSecondary">
            A bevételed {Math.round(current.rate * 100)}%-a. A pénzügyi tanácsadók gyakran 10–20%-ot javasolnak.
          </ThemedText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: Spacing.two, marginTop: Spacing.two }}>
          {months.map((m) => (
            <View key={m.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              <View
                style={{
                  width: '60%',
                  height: Math.max(2, (Math.abs(m.invested) / max) * 60),
                  backgroundColor: m.invested >= 0 ? theme.tint : theme.danger,
                  borderRadius: 4,
                }}
              />
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                {formatMonth(m.month).split(' ')[1].slice(0, 3)}
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Átlagosan havi {formatMoney(avg)}. Ide számít a befektetési platform (pl. Bybit, Lightyear) és a megtakarítási
          számla (pl. CélBetét); az onnan visszavett pénz levonódik.
        </ThemedText>
      </Card>
    </>
  );
}
