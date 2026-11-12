import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TransactionRow } from '@/components/transaction-row';
import { Button, Card, CategoryBadge, Chip, Screen, SectionTitle, Title } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCategory } from '@/lib/categories';
import { parseStatement, type ColumnMapping, type ParseNeedsMapping, type ParseSuccess } from '@/lib/csv/statement';
import { base64ToBytes, decodeBankFile } from '@/lib/encoding';
import { formatDate, formatMoney } from '@/lib/format';
import type { BankId } from '@/lib/types';
import { parsePdfStatement } from '@/lib/pdf/statement-pdf';
import { useData } from '@/state/data';

import { extractPdfText, isPdfSupported } from '../../../modules/pdf-text';

const BANKS: { id: BankId; name: string; hint: string }[] = [
  { id: 'erste', name: 'Erste', hint: 'George app → Számla → Kivonatok → PDF letöltése, vagy George netbank → Tranzakciók → Exportálás → CSV' },
  { id: 'mbh', name: 'MBH', hint: 'MBH App / Netbank → Számlatörténet → Letöltés → CSV' },
  { id: 'wise', name: 'Wise', hint: 'Wise → Egyenleg → Kivonatok → CSV' },
];

type Step =
  | { kind: 'pick' }
  | { kind: 'mapping'; text: string; fileName: string; result: ParseNeedsMapping }
  | { kind: 'preview'; fileName: string; result: ParseSuccess; warnings?: string[]; pdfText?: string }
  | { kind: 'pdf-failed'; fileName: string; text: string }
  | { kind: 'done'; added: number; duplicates: number };

async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (asset.base64) return base64ToBytes(asset.base64);
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  const res = await fetch(asset.uri);
  return new Uint8Array(await res.arrayBuffer());
}

export default function ImportScreen() {
  const theme = useTheme();
  const { preview, importTransactions } = useData();
  const [bank, setBank] = useState<BankId>('erste');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv', 'application/vnd.ms-excel', '*/*'],
        base64: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (/\.xlsx?$/i.test(asset.name)) {
        setError('Ez Excel-fájl. Kérlek, a netbankban CSV formátumban exportáld a számlatörténetet.');
        return;
      }
      setBusy(true);
      if (/\.pdf$/i.test(asset.name) || asset.mimeType === 'application/pdf') {
        await importPdf(asset);
        return;
      }
      const { text } = decodeBankFile(await readPickedFile(asset));
      const result = parseStatement(text, { bank });
      if (result.ok) {
        if (result.transactions.length === 0) setError('A fájlban nem találtunk importálható tételt.');
        else setStep({ kind: 'preview', fileName: asset.name, result });
      } else if (result.reason === 'empty') {
        setError('A fájl üres.');
      } else {
        setStep({ kind: 'mapping', text, fileName: asset.name, result });
      }
    } catch (e) {
      setError(`Nem sikerült beolvasni a fájlt: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const importPdf = async (asset: DocumentPicker.DocumentPickerAsset) => {
    if (!isPdfSupported) {
      setError('A PDF-beolvasás csak a telefonos appban működik.');
      return;
    }
    let pages: string[];
    try {
      pages = await extractPdfText(asset.uri);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === 'ERR_PDF_PASSWORD'
          ? 'Ez a PDF jelszóval védett, így nem tudjuk kiolvasni. Töltsd le jelszó nélkül, ha a bank engedi.'
          : `A PDF nem olvasható: ${(e as Error).message}`,
      );
      return;
    }
    const text = pages.join('\n');
    if (!text.trim()) {
      setError('Ebben a PDF-ben nincs kiolvasható szöveg (valószínűleg beszkennelt kép).');
      return;
    }
    const r = parsePdfStatement(pages, bank);
    if (r.transactions.length === 0) {
      setStep({ kind: 'pdf-failed', fileName: asset.name, text });
      return;
    }
    setStep({
      kind: 'preview',
      fileName: asset.name,
      warnings: r.warnings,
      pdfText: text,
      result: {
        ok: true,
        bank,
        transactions: r.transactions,
        skipped: r.skipped,
        headers: [],
        mapping: { date: 0, counterparty: [], description: [] },
      },
    });
  };

  const confirm = async (result: ParseSuccess) => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await importTransactions(result.transactions);
      setStep({ kind: 'done', ...outcome });
    } catch (e) {
      setError(`Mentés sikertelen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Importálás</Title>
      {error ? (
        <Card style={{ borderColor: theme.danger, borderWidth: 1 }}>
          <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>
        </Card>
      ) : null}

      {step.kind === 'pick' ? (
        <>
          <SectionTitle>Melyik bank kivonata?</SectionTitle>
          <View style={styles.chips}>
            {BANKS.map((b) => (
              <Chip key={b.id} label={b.name} selected={bank === b.id} onPress={() => setBank(b.id)} />
            ))}
          </View>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Így töltheted le:
            </ThemedText>
            <ThemedText>{BANKS.find((b) => b.id === bank)?.hint}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              A menüpontok neve banki verziónként eltérhet. A PDF-kivonatot és a CSV-exportot is beolvassuk. A
              Wise-t a fájl alapján magától is felismerjük.
            </ThemedText>
          </Card>
          <Button title="Kivonat kiválasztása (PDF vagy CSV)" onPress={pick} loading={busy} />
          <ThemedText type="small" themeColor="textSecondary">
            Ugyanazt az időszakot nyugodtan importálhatod újra: a már meglévő tételeket felismerjük és kihagyjuk, a
            kézi besorolásaid megmaradnak.
          </ThemedText>
        </>
      ) : null}

      {step.kind === 'mapping' ? (
        <MappingStep
          step={step}
          onCancel={() => setStep({ kind: 'pick' })}
          onParsed={(result) => setStep({ kind: 'preview', fileName: step.fileName, result })}
          bank={bank}
        />
      ) : null}

      {step.kind === 'preview' ? (
        <PreviewStep
          fileName={step.fileName}
          result={step.result}
          warnings={step.warnings}
          pdfText={step.pdfText}
          selectedBank={bank}
          rows={preview(step.result.transactions)}
          busy={busy}
          onConfirm={() => confirm(step.result)}
          onCancel={() => setStep({ kind: 'pick' })}
        />
      ) : null}

      {step.kind === 'pdf-failed' ? (
        <Card>
          <ThemedText style={{ fontWeight: '700' }}>Nem találtunk tételeket ebben a PDF-ben</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            A PDF szövegét ki tudtuk olvasni, de nem ismertük fel benne a tételsorokat. Ha a kiolvasott szöveget
            elküldöd, a beolvasás hozzáigazítható a bankod formátumához. Elküldés előtt nézd át: a szövegben benne
            lehet a neved és a számlaszámod is.
          </ThemedText>
          <Button
            title="Kiolvasott szöveg megosztása"
            onPress={() => Share.share({ title: step.fileName, message: step.text.slice(0, 20000) })}
          />
          <Button variant="secondary" title="Vissza" onPress={() => setStep({ kind: 'pick' })} />
        </Card>
      ) : null}

      {step.kind === 'done' ? (
        <Card style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four }}>
          <ThemedText style={{ fontSize: 40 }}>✅</ThemedText>
          <ThemedText style={{ fontSize: 20, fontWeight: '700' }}>{step.added} új tétel importálva</ThemedText>
          {step.duplicates > 0 ? (
            <ThemedText themeColor="textSecondary">{step.duplicates} tétel már korábban is megvolt, azokat kihagytuk.</ThemedText>
          ) : null}
          <Button title="Áttekintés megnyitása" onPress={() => router.navigate('/')} style={{ alignSelf: 'stretch' }} />
          <Button variant="ghost" title="Újabb fájl importálása" onPress={() => setStep({ kind: 'pick' })} />
        </Card>
      ) : null}
    </Screen>
  );
}

function PreviewStep({
  fileName,
  result,
  warnings,
  pdfText,
  selectedBank,
  rows,
  busy,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  result: ParseSuccess;
  warnings?: string[];
  pdfText?: string;
  selectedBank: BankId;
  rows: ReturnType<ReturnType<typeof useData>['preview']>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [showSkipped, setShowSkipped] = useState(false);
  const fresh = rows.filter((r) => !r.duplicate);
  const dates = result.transactions.map((t) => t.date).sort();
  const currencies = [...new Set(result.transactions.map((t) => t.currency))];

  const byCategory = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const { tx } of fresh) {
      if (tx.amount >= 0) continue;
      const c = m.get(tx.categoryId) ?? { total: 0, count: 0 };
      c.total += -tx.amount;
      c.count++;
      m.set(tx.categoryId, c);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [fresh]);

  const uncategorized = fresh.filter((r) => r.tx.categorySource === 'default' && r.tx.amount < 0).length;

  return (
    <>
      <Card>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {fileName}
        </ThemedText>
        <ThemedText style={{ fontSize: 22, fontWeight: '700' }}>{result.transactions.length} tétel a fájlban</ThemedText>
        <ThemedText themeColor="textSecondary">
          {formatDate(dates[0])} – {formatDate(dates[dates.length - 1])} · {currencies.join(', ')}
        </ThemedText>
        {warnings?.map((w) => (
          <ThemedText key={w} style={{ color: theme.warning }}>
            {w}
          </ThemedText>
        ))}
        {result.detectedBank && result.detectedBank !== selectedBank ? (
          <ThemedText style={{ color: theme.warning }}>
            Ez {result.detectedBank === 'wise' ? 'Wise' : result.detectedBank}-kivonatnak tűnik, úgy dolgoztuk fel.
          </ThemedText>
        ) : null}
        <ThemedText>
          <ThemedText style={{ fontWeight: '700' }}>{fresh.length}</ThemedText> új
          {rows.length - fresh.length > 0 ? `, ${rows.length - fresh.length} már megvan` : ''}
          {uncategorized > 0 ? `, ${uncategorized} besorolatlan lesz` : ''}
        </ThemedText>
        {result.skipped.length > 0 ? (
          <>
            <Button
              variant="ghost"
              title={`${result.skipped.length} sor kihagyva ${showSkipped ? '▲' : '▼'}`}
              onPress={() => setShowSkipped(!showSkipped)}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 32 }}
            />
            {showSkipped
              ? result.skipped.slice(0, 30).map((s) => (
                  <ThemedText key={s.row} type="small" themeColor="textSecondary">
                    {s.row}. sor: {s.reason}
                  </ThemedText>
                ))
              : null}
          </>
        ) : null}
      </Card>

      {byCategory.length > 0 ? (
        <>
          <SectionTitle>Automatikus besorolás</SectionTitle>
          <Card>
            {byCategory.map(([id, v]) => (
              <View key={id} style={styles.catRow}>
                <CategoryBadge categoryId={id} size={28} />
                <ThemedText style={{ flex: 1 }}>{getCategory(id).name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {v.count} db
                </ThemedText>
                <ThemedText style={{ fontWeight: '700', minWidth: 96, textAlign: 'right' }}>
                  {formatMoney(v.total, currencies.length === 1 ? currencies[0] : 'HUF')}
                </ThemedText>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Első tételek</SectionTitle>
      <Card style={{ gap: 0 }}>
        {rows.slice(0, 8).map(({ tx, duplicate }) => (
          <View key={tx.id} style={{ opacity: duplicate ? 0.45 : 1 }}>
            <TransactionRow tx={tx} onPress={() => {}} />
          </View>
        ))}
      </Card>

      <Button title={fresh.length > 0 ? `${fresh.length} tétel importálása` : 'Nincs új tétel'} onPress={onConfirm} loading={busy} disabled={fresh.length === 0} />
      <Button variant="secondary" title="Mégse" onPress={onCancel} />
      {pdfText ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Hibásak a tételek? Oszd meg a PDF-ből kiolvasott szöveget, és a beolvasás hozzáigazítható a bankod
            formátumához. Küldés előtt nézd át: benne lehet a neved és a számlaszámod is.
          </ThemedText>
          <Button
            variant="secondary"
            title="Kiolvasott szöveg megosztása"
            onPress={() => Share.share({ title: fileName, message: pdfText.slice(0, 20000) })}
          />
        </Card>
      ) : null}
    </>
  );
}

type MappableRole = 'date' | 'amount' | 'counterparty' | 'description';
const ROLE_LABELS: Record<MappableRole, string> = {
  date: 'Dátum *',
  amount: 'Összeg (előjeles) *',
  counterparty: 'Partner / kereskedő',
  description: 'Közlemény',
};

function MappingStep({
  step,
  bank,
  onParsed,
  onCancel,
}: {
  step: Extract<Step, { kind: 'mapping' }>;
  bank: BankId;
  onParsed: (r: ParseSuccess) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { rows, delimiter } = step.result;
  const [headerRow, setHeaderRow] = useState(step.result.headerRow);
  const [cols, setCols] = useState<Partial<Record<MappableRole, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const headers = rows[headerRow] ?? [];

  const apply = () => {
    if (cols.date === undefined || cols.amount === undefined) {
      setError('A dátum és az összeg oszlopot mindenképp ki kell választani.');
      return;
    }
    const mapping: ColumnMapping = {
      date: cols.date,
      amount: cols.amount,
      counterparty: cols.counterparty !== undefined ? [cols.counterparty] : [],
      description: cols.description !== undefined ? [cols.description] : [],
    };
    const r = parseStatement(step.text, { bank, mapping, headerRow, delimiter });
    if (!r.ok || r.transactions.length === 0) {
      setError('Ezzel a párosítással nem sikerült tételeket kiolvasni. Ellenőrizd a dátum és az összeg oszlopot.');
      return;
    }
    onParsed(r);
  };

  return (
    <>
      <Card>
        <ThemedText style={{ fontWeight: '700' }}>Nem ismertük fel az oszlopokat</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Válaszd ki, melyik sor a fejléc, és melyik oszlopban van a dátum, az összeg és a partner.
        </ThemedText>
      </Card>

      <SectionTitle>Előnézet</SectionTitle>
      <ScrollView horizontal style={{ borderRadius: 12, backgroundColor: theme.backgroundElement }}>
        <View style={{ padding: Spacing.two }}>
          {rows.slice(0, 10).map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', backgroundColor: i === headerRow ? `${theme.tint}33` : undefined }}>
              <ThemedText type="code" style={{ width: 28, color: theme.textSecondary }}>
                {i + 1}
              </ThemedText>
              {r.map((c, j) => (
                <ThemedText key={j} type="code" numberOfLines={1} style={{ width: 120, paddingRight: 8 }}>
                  {c}
                </ThemedText>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <SectionTitle>Fejlécsor</SectionTitle>
      <View style={styles.chips}>
        {rows.slice(0, 10).map((_, i) => (
          <Chip key={i} label={`${i + 1}. sor`} selected={i === headerRow} onPress={() => { setHeaderRow(i); setCols({}); }} />
        ))}
      </View>

      {(Object.keys(ROLE_LABELS) as MappableRole[]).map((role) => (
        <View key={role} style={{ gap: Spacing.two }}>
          <SectionTitle>{ROLE_LABELS[role]}</SectionTitle>
          <View style={styles.chips}>
            {headers.map((h, j) => (
              <Chip
                key={j}
                label={h || `${j + 1}. oszlop`}
                selected={cols[role] === j}
                onPress={() => setCols({ ...cols, [role]: cols[role] === j ? undefined : j })}
              />
            ))}
          </View>
        </View>
      ))}

      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Button title="Feldolgozás" onPress={apply} />
      <Button variant="secondary" title="Mégse" onPress={onCancel} />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 2 },
});
