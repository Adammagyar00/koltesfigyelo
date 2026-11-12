import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { useAuth } from '@/state/auth';
import { useData } from '@/state/data';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const { userRules, transactions, removeRule } = useData();
  const [message, setMessage] = useState<string | null>(null);

  const rules = [...userRules].sort((a, b) => a.pattern.localeCompare(b.pattern));

  const remove = async (id: string) => {
    const n = await removeRule(id);
    setMessage(n > 0 ? `Szabály törölve, ${n} tétel újra lett sorolva.` : 'Szabály törölve.');
  };

  return (
    <Screen tabs={false}>
      <SectionTitle>Fiók</SectionTitle>
      <Card>
        <ThemedText>{user?.email}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {transactions.length} tétel · {userRules.length} saját szabály
        </ThemedText>
        <Button variant="secondary" title="Kijelentkezés" onPress={signOut} />
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

      <ThemedText type="small" themeColor="textSecondary">
        Az adataid a saját Firebase-fiókodban vannak, és csak te látod őket.
      </ThemedText>
    </Screen>
  );
}
