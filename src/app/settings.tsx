import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useUpdate } from '@/components/update-banner';
import { Button, Card, Field, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { isGenericPattern } from '@/lib/text';
import { currentVersion, updatesSupported } from '@/services/updates';
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
  const { userRules, transactions, budgets, removeRule, clearAll, loading } = useData();
  const [message, setMessage] = useState<string | null>(null);
  const upd = useUpdate();

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

      <SectionTitle>Saját számláim</SectionTitle>
      {/* A mentett profil betöltése után jelenik meg, hogy a mezők a mentett értékekkel induljanak. */}
      {loading ? null : <OwnAccountsForm />}

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
                  {isGenericPattern(r.pattern) ? (
                    <ThemedText type="small" style={{ color: theme.warning }}>
                      Túl általános, ezért nem alkalmazzuk (minden kártyás vásárlásra illene). Töröld nyugodtan.
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable onPress={() => remove(r.id)} hitSlop={8} accessibilityLabel={`${r.pattern} szabály törlése`}>
                  <ThemedText style={{ color: theme.danger, fontWeight: '600' }}>Törlés</ThemedText>
                </Pressable>
              </View>
            );
          })
        )}
      </Card>

      <SectionTitle>Verzió</SectionTitle>
      <Card>
        <ThemedText>Költésfigyelő {currentVersion}</ThemedText>
        {updatesSupported ? (
          <>
            {upd.update ? (
              <>
                <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Új verzió: {upd.update.version}</ThemedText>
                <Button title="Frissítés" onPress={upd.install} loading={upd.installing} />
              </>
            ) : upd.checkedOnce && !upd.error ? (
              <ThemedText type="small" themeColor="textSecondary">
                Ez a legfrissebb verzió.
              </ThemedText>
            ) : null}
            {upd.error ? <ThemedText style={{ color: theme.danger }}>{upd.error}</ThemedText> : null}
            {!upd.update ? (
              <Button variant="secondary" title="Frissítések keresése" onPress={() => upd.check(true)} loading={upd.checking} />
            ) : null}
          </>
        ) : null}
      </Card>

      <Button variant="danger" title="Minden adat törlése" onPress={wipe} style={{ marginTop: Spacing.four }} />
    </Screen>
  );
}

function OwnAccountsForm() {
  const theme = useTheme();
  const { transactions, profile, setProfile } = useData();
  const [names, setNames] = useState(profile.names.join('\n'));
  const [accounts, setAccounts] = useState(profile.accounts.join('\n'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const transferCount = transactions.filter((t) => t.categoryId === 'atvezetes').length;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const lines = (s: string) => s.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
      const n = await setProfile({ names: lines(names), accounts: lines(accounts) });
      setMessage(
        n > 0 ? `Mentve. ${n} tétel átkerült az „Átvezetés (saját)” kategóriába.` : 'Mentve. Nem találtunk új saját átvezetést.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: Spacing.three }}>
      <ThemedText type="small" themeColor="textSecondary">
        A saját számláid közötti átutalások nem költések és nem bevételek. Ha megadod a neved, ahogy a bankszámlán
        szerepel, és a saját számlaszámaidat, ezeket az app felismeri, és kihagyja az összesítésekből. A két bankod
        közötti, azonos összegű ki- és bemenő utalást (pl. Erste → Wise) név nélkül is felismeri.
      </ThemedText>
      <Field
        label="Neved (soronként egy, ha több változat van)"
        value={names}
        onChangeText={setNames}
        placeholder="pl. Kovács Anna"
        multiline
        autoCapitalize="words"
        style={{ minHeight: 56, paddingTop: Spacing.two, textAlignVertical: 'top' }}
      />
      <Field
        label="Saját számlaszámaid (soronként egy)"
        value={accounts}
        onChangeText={setAccounts}
        placeholder="pl. 11600006-00000000-12345678"
        multiline
        style={{ minHeight: 56, paddingTop: Spacing.two, textAlignVertical: 'top' }}
      />
      {message ? <ThemedText style={{ color: theme.success }}>{message}</ThemedText> : null}
      <Button title="Mentés és újrasorolás" onPress={save} loading={saving} />
      <ThemedText type="small" themeColor="textSecondary">
        Jelenleg {transferCount} tétel van az „Átvezetés (saját)” kategóriában. Ezeket a Tételek fülön, a kategória
        szűrővel nézheted meg. Ha valamelyik tévesen került oda, a tételre koppintva átsorolhatod.
      </ThemedText>
    </Card>
  );
}
