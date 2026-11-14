import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Empty, Loading, Screen, SectionTitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth, formatMoney, formatMonth, todayISO } from '@/lib/format';
import type { InvestmentLine, InvestmentMonth } from '@/lib/insights';
import { investmentBreakdown, investmentTrend, monthOf, savingTips } from '@/lib/insights';
import { useData } from '@/state/data';

export default function InsightsScreen() {
  const theme = useTheme();
  // Az összesítésekhez a forintra számolt tételek kellenek.
  const { baseTransactions: transactions, budgets, loading, settings, subscriptions } = useData();
  const today = todayISO();
  const month = transactions[0] && monthOf(transactions[0].date) < monthOf(today) ? monthOf(transactions[0].date) : monthOf(today);

  const { tips, investments, investmentLines } = useMemo(
    () => ({
      tips: savingTips(transactions, month, today, budgets, 'HUF', settings.passPrice),
      investments: investmentTrend(transactions, month, 6),
      investmentLines: investmentBreakdown(transactions, month),
    }),
    [transactions, budgets, month, today, settings.passPrice],
  );

  if (loading) return <Loading />;

  const totalSaving = tips.reduce((s, t) => s + (t.monthlySaving ?? 0), 0);
  const activeSubs = subscriptions.filter((s) => !s.stale && s.type === 'subscription');
  const subsMonthly = activeSubs.reduce(
    (sum, s) => sum + (s.currency === 'HUF' ? s.amount : s.amount * (settings.rates[s.currency] ?? 0)),
    0,
  );

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

          <InvestmentSection months={investments} lines={investmentLines} />

          <SectionTitle>Előfizetések</SectionTitle>
          <Pressable onPress={() => router.push('/subscriptions')}>
            <Card>
              {activeSubs.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  Még nem találtunk előfizetést. Az „Előfizetések” kategóriájú és a havonta ismétlődő terheléseket
                  ismerjük fel.
                </ThemedText>
              ) : (
                <>
                  <ThemedText style={{ fontWeight: '700' }}>
                    {activeSubs.length} előfizetés · havi {formatMoney(subsMonthly)}, évente {formatMoney(subsMonthly * 12)}
                  </ThemedText>
                  {activeSubs.slice(0, 4).map((s) => (
                    <View key={s.key} style={{ flexDirection: 'row', gap: Spacing.two }}>
                      <ThemedText style={{ flex: 1 }} numberOfLines={1}>
                        {s.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDayMonth(s.nextDate)}
                      </ThemedText>
                      <ThemedText style={{ fontWeight: '700', minWidth: 80, textAlign: 'right' }}>
                        {formatMoney(s.amount, s.currency)}
                      </ThemedText>
                    </View>
                  ))}
                </>
              )}
              <ThemedText type="small" style={{ color: theme.tint, fontWeight: '600' }}>
                Megújulási dátumok és értesítések ›
              </ThemedText>
            </Card>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

function InvestmentSection({ months, lines }: { months: InvestmentMonth[]; lines: InvestmentLine[] }) {
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
        {lines.length > 0 ? (
          <View style={{ gap: 6, marginTop: Spacing.two }}>
            {lines.map((l) => (
              <Pressable
                key={l.label}
                onPress={() => router.push({ pathname: '/transactions', params: { month: current.month, category: 'befektetes' } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <ThemedText numberOfLines={1} style={{ fontWeight: '600' }}>
                    {l.label}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    be: {formatMoney(l.deposited)}
                    {l.withdrawn ? ` · vissza: ${formatMoney(l.withdrawn)}` : ''}
                  </ThemedText>
                </View>
                <ThemedText style={{ fontWeight: '700', color: l.net >= 0 ? theme.text : theme.danger }}>
                  {formatMoney(l.net)}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Átlagosan havi {formatMoney(avg)}. Ide számít a befektetési platform (pl. Bybit, Lightyear) és a megtakarítási
          számla (pl. CélBetét); az onnan visszavett pénz levonódik. Ha valamelyik sor nem befektetés, koppints rá, és
          sorold át a tételt.
        </ThemedText>
      </Card>
    </>
  );
}
