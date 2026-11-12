import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CUSTOM_ICONS } from '@/lib/categories';
import { parseAmount } from '@/lib/csv/values';
import { base64ToBytes, decodeUtf8Strict } from '@/lib/encoding';
import { todayISO } from '@/lib/format';
import { DEFAULT_RATES } from '@/lib/settings';
import { disableMonthlyReminder, enableMonthlyReminder, REMINDER_DAY, REMINDER_HOUR, remindersSupported } from '@/services/reminder';
import { useData } from '@/state/data';

function confirmAsync(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Mégse', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Biztonsági mentés fájlba (megosztással, pl. Google Drive-ra) és visszatöltés. */
export function BackupSection() {
  const theme = useTheme();
  const { exportBackup, restoreBackup, transactions } = useData();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const json = await exportBackup();
      const name = `koltesfigyelo-mentes-${todayISO()}.json`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, name);
        if (file.exists) file.delete();
        file.create();
        await file.write(json);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Mentés helye (pl. Google Drive)' });
      }
      setMessage({ ok: true, text: `Elkészült a mentés (${transactions.length} tétel). Tedd biztos helyre, pl. Google Drive-ra.` });
    } catch (e) {
      setMessage({ ok: false, text: `A mentés nem sikerült: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setMessage(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], base64: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const ok = await confirmAsync(
      'Visszaállítás mentésből',
      'A telefonon lévő összes jelenlegi adat (tételek, szabályok, keretek, beállítások) lecserélődik a mentés tartalmára.',
      'Visszaállítás',
    );
    if (!ok) return;
    setBusy('import');
    try {
      const bytes = asset.base64
        ? base64ToBytes(asset.base64)
        : asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
      const text = decodeUtf8Strict(bytes);
      if (text === null) throw new Error('A fájl nem olvasható.');
      const n = await restoreBackup(text);
      setMessage({ ok: true, text: `Visszaállítva: ${n} tétel és minden beállítás.` });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SectionTitle>Biztonsági mentés</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Az adataid csak ezen a telefonon vannak. Készíts róluk mentést (pl. Google Drive-ra), hogy telefoncsere
          vagy az app törlése után is vissza tudd tölteni őket.
        </ThemedText>
        {message ? <ThemedText style={{ color: message.ok ? theme.success : theme.danger }}>{message.text}</ThemedText> : null}
        <Button title="Mentés fájlba" onPress={save} loading={busy === 'export'} disabled={busy !== null} />
        <Button variant="secondary" title="Visszaállítás fájlból" onPress={restore} loading={busy === 'import'} disabled={busy !== null} />
      </Card>
    </>
  );
}

/** Havi emlékeztető a kivonat importálására. */
export function ReminderSection() {
  const theme = useTheme();
  const { settings, updateSettings } = useData();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!remindersSupported) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      if (on) {
        const granted = await enableMonthlyReminder();
        if (!granted) {
          setNote('Az értesítések nincsenek engedélyezve. A telefon beállításaiban engedélyezd őket a Költésfigyelőnek.');
          return;
        }
      } else {
        await disableMonthlyReminder();
      }
      await updateSettings({ reminder: on });
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>Emlékeztető</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <ThemedText style={{ flex: 1, fontWeight: '600' }}>Havi emlékeztető az importra</ThemedText>
          <Switch value={settings.reminder} onValueChange={toggle} disabled={busy} trackColor={{ true: theme.tint }} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Minden hónap {REMINDER_DAY}-án {REMINDER_HOUR} órakor szól, hogy töltsd le az előző havi kivonatot. Koppintásra
          az Import fül nyílik meg.
        </ThemedText>
        {note ? <ThemedText style={{ color: theme.warning }}>{note}</ThemedText> : null}
      </Card>
    </>
  );
}

/** Árfolyamok a nem forintos tételek átszámításához. */
export function RatesSection() {
  const theme = useTheme();
  const { settings, updateSettings, transactions } = useData();
  const currencies = useMemo(() => {
    const used = new Set(transactions.map((t) => t.currency).filter((c) => c !== 'HUF'));
    used.add('EUR');
    return [...used].sort();
  }, [transactions]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(currencies.map((c) => [c, String(settings.rates[c] ?? '')])),
  );
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const rates = { ...settings.rates };
    for (const c of currencies) {
      const v = parseAmount(values[c] ?? '');
      if (v && v > 0) rates[c] = v;
    }
    await updateSettings({ rates });
    setSaved(true);
  };

  return (
    <>
      <SectionTitle>Árfolyamok</SectionTitle>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          A nem forintos tételeket (pl. euró-számla, Revolut, Wise) ezzel az árfolyammal számoljuk forintra az
          összesítésekben. Az alapértékek becslések, írd át a pontos árfolyamra.
        </ThemedText>
        {currencies.map((c) => (
          <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <ThemedText style={{ width: 70, fontWeight: '600' }}>1 {c} =</ThemedText>
            <View style={{ flex: 1 }}>
              <Field
                value={values[c] ?? ''}
                onChangeText={(v) => {
                  setSaved(false);
                  setValues({ ...values, [c]: v });
                }}
                keyboardType="decimal-pad"
                placeholder={String(DEFAULT_RATES[c] ?? '')}
              />
            </View>
            <ThemedText>Ft</ThemedText>
          </View>
        ))}
        {saved ? <ThemedText style={{ color: theme.success }}>Mentve.</ThemedText> : null}
        <Button variant="secondary" title="Árfolyamok mentése" onPress={save} />
      </Card>
    </>
  );
}

/** Saját kiadási kategóriák létrehozása és törlése. */
export function CustomCategoriesSection() {
  const theme = useTheme();
  const { settings, addCategory, removeCategory, transactions } = useData();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(CUSTOM_ICONS[0]);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addCategory(name, icon);
      setName('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, label: string) => {
    const count = transactions.filter((t) => t.categoryId === id).length;
    const ok = await confirmAsync(
      `„${label}” törlése`,
      `${count} tétel újra automatikus besorolást kap, a kategóriára mutató szabályok és keret törlődik.`,
      'Törlés',
    );
    if (!ok) return;
    await removeCategory(id);
  };

  return (
    <>
      <SectionTitle>Saját kategóriák</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        {settings.customCategories.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Ha a beépített kategóriák nem elegek (pl. „Roller”, „Ajándék”, „Kutya”), hozz létre sajátot. A tételeknél
            és a kereteknél ugyanúgy választható.
          </ThemedText>
        ) : (
          settings.customCategories.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <ThemedText style={{ fontSize: 20 }}>{c.icon}</ThemedText>
              <ThemedText style={{ flex: 1, fontWeight: '600' }}>{c.name}</ThemedText>
              <Pressable onPress={() => remove(c.id, c.name)} hitSlop={8} accessibilityLabel={`${c.name} törlése`}>
                <ThemedText style={{ color: theme.danger, fontWeight: '600' }}>Törlés</ThemedText>
              </Pressable>
            </View>
          ))
        )}
        <Field label="Új kategória neve" value={name} onChangeText={setName} placeholder="pl. Roller" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {CUSTOM_ICONS.map((i) => (
            <Chip key={i} label={i} selected={i === icon} onPress={() => setIcon(i)} />
          ))}
        </View>
        <Button title="Kategória hozzáadása" onPress={add} loading={busy} disabled={!name.trim()} />
      </Card>
    </>
  );
}

