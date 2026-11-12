import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { useData } from '@/state/data';

function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Mégse', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Törlés', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { userRules, transactions, budgets, removeRule, clearAll } = useData();
  const [message, setMessage] = useState<string | null>(null);

  const rules = [...userRules].sort((a, b) => a.pattern.localeCompare(b.pattern));

  const remove = async (id: string) => {
    const n = await removeRule(id);
    setMessage(n > 0 ? `Szabály törölve, ${n} tétel újra lett sorolva.` : 'Szabály törölve.');
  };

  const wipe = async () => {
    const ok = await confirm(
      'Minden adat törlése',
      `${transactions.length} tétel, ${userRules.length} szabály és ${budgets.length} keret törlődik a telefonról. Ez nem vonható vissza.`,
    );
    if (!ok) return;
    await clearAll();
    setMessage('Minden adat törölve.');
  };

  return (
    <Screen tabs={false}>
      <SectionTitle>Adatok</SectionTitle>
      <Card>
        <ThemedText>
          {transactions.length} tétel · {userRules.length} saját szabály · {budgets.length} keret
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Minden adat csak ezen a telefonon van tárolva, nem kerül fel semmilyen szerverre. Ha törlöd az appot, az
          adatok is törlődnek; a kivonatokat bármikor újra beimportálhatod.
        </ThemedText>
      </Card>

      <SectionTitle>Saját szabályok</SectionTitle>
      {message ? <ThemedText style={{ color: theme.success }}>{message}</ThemedText> : null}
      <Card style={{ gap: 0 }}>
        {rules.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            Még nincs saját szabályod. Ha egy tételt átsorolsz, az app felajánlja, hogy megjegyezze.
          </ThemedText>
        ) : (
          rules.map((r) => {
            const c = getCategory(r.categoryId);
            return (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two, gap: Spacing.two }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }}>{r.pattern}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    → {c.icon} {c.name}
                  </ThemedText>
                </View>
                <Pressable onPress={() => remove(r.id)} hitSlop={8} accessibilityLabel={`${r.pattern} szabály törlése`}>
                  <ThemedText style={{ color: theme.danger, fontWeight: '600' }}>Törlés</ThemedText>
                </Pressable>
              </View>
            );
          })
        )}
      </Card>

      <Button variant="danger" title="Minden adat törlése" onPress={wipe} style={{ marginTop: Spacing.four }} />
    </Screen>
  );
}
