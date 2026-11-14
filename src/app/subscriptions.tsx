import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, CategoryBadge, Chip, Empty, Loading, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth, formatMoney, relativeDays } from '@/lib/format';
import type { Subscription } from '@/lib/subscriptions';
import { remindersSupported } from '@/services/reminder';
import { useData } from '@/state/data';

const DAYS_BEFORE = [
  { value: 0, label: 'Aznap' },
  { value: 1, label: '1 nappal előtte' },
  { value: 3, label: '3 nappal előtte' },
];

export default function SubscriptionsScreen() {
  const theme = useTheme();
  const { subscriptions, settings, setSubscriptionAlerts, hideSubscription, unhideSubscription, loading } = useData();
  const [note, setNote] = useState<string | null>(null);

  if (loading) return <Loading />;

  const active = subscriptions.filter((s) => !s.stale);
  const subs = active.filter((s) => s.type === 'subscription');
  const recurring = active.filter((s) => s.type === 'recurring');
  const stale = subscriptions.filter((s) => s.stale);
  const toHuf = (s: Subscription) => (s.currency === 'HUF' ? s.amount : s.amount * (settings.rates[s.currency] ?? 0));
  const subsMonthly = subs.reduce((sum, s) => sum + toHuf(s), 0);
  const recurringMonthly = recurring.reduce((sum, s) => sum + toHuf(s), 0);

  const toggle = async (on: boolean) => {
    setNote(null);
    const ok = await setSubscriptionAlerts(on);
    if (!ok) setNote('Az értesítések nincsenek engedélyezve. A telefon beállításaiban engedélyezd őket a Költésfigyelőnek.');
  };

  return (
    <Screen tabs={false}>
      {subscriptions.length === 0 && settings.ignoredSubscriptions.length === 0 ? (
        <Empty
          title="Még nem találtunk előfizetést"
          body="Az „Előfizetések” kategóriájú tételeket (pl. Netflix, Spotify) és a havonta azonos összeggel ismétlődő terheléseket ismerjük fel. Importálj kivonatot, vagy sorolj egy tételt az Előfizetések kategóriába."
        />
      ) : (
        <>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {subs.length} előfizetés
            </ThemedText>
            <ThemedText style={styles.big}>{formatMoney(subsMonthly)} / hó</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Ez évente kb. {formatMoney(subsMonthly * 12)}.
              {recurring.length > 0
                ? ` Ezen felül ${recurring.length} egyéb rendszeres terhelés (lakbér, rezsi, bérlet, díjak): havi ${formatMoney(recurringMonthly)}.`
                : ''}
            </ThemedText>
          </Card>

          {remindersSupported ? (
            <Card>
              <View style={styles.row}>
                <ThemedText style={{ flex: 1, fontWeight: '600' }}>Értesítés megújulás előtt</ThemedText>
                <Switch value={settings.subscriptionAlerts} onValueChange={toggle} trackColor={{ true: theme.tint }} />
              </View>
              {settings.subscriptionAlerts ? (
                <View style={styles.chips}>
                  {DAYS_BEFORE.map((d) => (
                    <Chip
                      key={d.value}
                      label={d.label}
                      selected={settings.alertDaysBefore === d.value}
                      onPress={() => setSubscriptionAlerts(true, d.value)}
                    />
                  ))}
                </View>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                Reggel 9-kor szól, pl. „Holnap megújul: Netflix, 4 490 Ft”. Az értesítéseket az app minden
                megnyitáskor frissíti, ezért havonta legalább egyszer nyisd meg (pl. az importnál).
              </ThemedText>
              {note ? <ThemedText style={{ color: theme.warning }}>{note}</ThemedText> : null}
            </Card>
          ) : null}

          {subs.length > 0 ? (
            <>
              <SectionTitle>Előfizetések – következő megújulás</SectionTitle>
              <Card style={{ gap: 0 }}>
                {subs.map((s, i) => (
                  <SubscriptionRow key={s.key} sub={s} first={i === 0} onHide={() => hideSubscription(s.key)} />
                ))}
              </Card>
            </>
          ) : null}

          {recurring.length > 0 ? (
            <>
              <SectionTitle>Rendszeres terhelések – következő esedékesség</SectionTitle>
              <Card style={{ gap: 0 }}>
                {recurring.map((s, i) => (
                  <SubscriptionRow key={s.key} sub={s} first={i === 0} onHide={() => hideSubscription(s.key)} hideLabel="Elrejtés" />
                ))}
              </Card>
            </>
          ) : null}

          {stale.length > 0 ? (
            <>
              <SectionTitle>Lehet, hogy már lemondtad</SectionTitle>
              <Card style={{ gap: 0 }}>
                <ThemedText type="small" themeColor="textSecondary">
                  Több mint két hónapja nem volt terhelés, ezért ezekre nem küldünk értesítést.
                </ThemedText>
                {stale.map((s, i) => (
                  <SubscriptionRow key={s.key} sub={s} first={i === 0} onHide={() => hideSubscription(s.key)} />
                ))}
              </Card>
            </>
          ) : null}

          {settings.ignoredSubscriptions.length > 0 ? (
            <>
              <SectionTitle>Elrejtve</SectionTitle>
              <Card style={{ gap: 0 }}>
                {settings.ignoredSubscriptions.map((key) => (
                  <View key={key} style={[styles.row, { paddingVertical: Spacing.two }]}>
                    <ThemedText style={{ flex: 1 }} themeColor="textSecondary">
                      {key.split('|')[0]}
                    </ThemedText>
                    <Pressable onPress={() => unhideSubscription(key)} hitSlop={8}>
                      <ThemedText style={{ color: theme.tint, fontWeight: '600' }}>Visszaállítás</ThemedText>
                    </Pressable>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary">
            A megújulás napját a korábbi terhelésekből számoljuk (a bank könyvelési napja, ezért 1-2 nap eltérés lehet).
            A „becsült” jelölésű tételeknél csak egy terhelést láttunk, ott havi megújulást feltételezünk.
          </ThemedText>
        </>
      )}
    </Screen>
  );
}

function SubscriptionRow({
  sub,
  first,
  onHide,
  hideLabel = 'Nem előfizetés – elrejtés',
}: {
  sub: Subscription;
  first: boolean;
  onHide: () => void;
  hideLabel?: string;
}) {
  const theme = useTheme();
  const soon = !sub.stale && sub.daysUntil <= 3;
  return (
    <View style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <CategoryBadge categoryId={sub.categoryId} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={{ fontWeight: '700' }} numberOfLines={1}>
          {sub.name}
        </ThemedText>
        {sub.stale ? (
          <ThemedText type="small" themeColor="textSecondary">
            Utoljára: {formatDayMonth(sub.lastDate)}
          </ThemedText>
        ) : (
          <ThemedText type="small" style={{ color: soon ? theme.warning : theme.textSecondary, fontWeight: soon ? '700' : '500' }}>
            {formatDayMonth(sub.nextDate)} · {relativeDays(sub.daysUntil)}
          </ThemedText>
        )}
        <View style={styles.tags}>
          {!sub.confirmed ? <Tag text="becsült" color={theme.textSecondary} /> : <Tag text={`${sub.months} hónapja`} color={theme.textSecondary} />}
          {sub.priceChange ? (
            <Tag
              text={`${sub.priceChange.to > sub.priceChange.from ? 'Drágult' : 'Olcsóbb lett'}: ${formatMoney(sub.priceChange.from, sub.currency)} → ${formatMoney(sub.priceChange.to, sub.currency)}`}
              color={sub.priceChange.to > sub.priceChange.from ? theme.danger : theme.success}
            />
          ) : null}
        </View>
        <Pressable onPress={onHide} hitSlop={6} accessibilityLabel={`${sub.name} elrejtése`}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            {hideLabel}
          </ThemedText>
        </Pressable>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <ThemedText style={{ fontWeight: '800' }}>{formatMoney(sub.amount, sub.currency)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatMoney(sub.yearlyCost, sub.currency)}/év
        </ThemedText>
      </View>
    </View>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <ThemedText type="small" style={{ color, fontSize: 12, lineHeight: 16 }}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 30, lineHeight: 36, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, paddingVertical: Spacing.three },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 2 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
});
