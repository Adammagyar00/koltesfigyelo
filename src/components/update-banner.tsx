import { useCallback, useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { checkForUpdate, downloadAndInstall, updatesSupported, type UpdateInfo } from '@/services/updates';

// Egy app-futás alatt egyszer kérdezzük le automatikusan.
let cached: Promise<UpdateInfo | null> | null = null;

export function useUpdate() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const check = useCallback(async (force = false) => {
    if (!updatesSupported) return;
    if (force || !cached) cached = checkForUpdate();
    setChecking(true);
    setError(null);
    try {
      setUpdate(await cached);
    } catch {
      cached = null;
      setError('Nem sikerült ellenőrizni a frissítést (nincs internet?).');
    } finally {
      setChecking(false);
      setCheckedOnce(true);
    }
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setInstalling(true);
    setError(null);
    try {
      await downloadAndInstall(update);
    } catch (e) {
      setError(`A letöltés nem sikerült: ${(e as Error).message}`);
    } finally {
      setInstalling(false);
    }
  }, [update]);

  return { update, checking, installing, error, checkedOnce, check, install };
}

/** Az Áttekintés tetején jelenik meg, ha van újabb verzió. */
export function UpdateBanner() {
  const theme = useTheme();
  const { update, installing, error, check, install } = useUpdate();

  useEffect(() => {
    check();
  }, [check]);

  if (!update) return null;
  const mb = update.sizeBytes ? ` (${(update.sizeBytes / 1024 / 1024).toFixed(0)} MB)` : '';
  return (
    <Card style={{ borderColor: theme.tint, borderWidth: 1 }}>
      <ThemedText style={{ fontWeight: '700' }}>🎉 Új verzió érhető el: {update.version}</ThemedText>
      {update.notes ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={4}>
          {update.notes}
        </ThemedText>
      ) : null}
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Button title={installing ? 'Letöltés…' : `Frissítés${mb}`} onPress={install} loading={installing} />
      <ThemedText type="small" themeColor="textSecondary">
        Letöltés után az Android megkérdezi, telepítse-e: válaszd a „Telepítés” gombot. Az adataid megmaradnak.
      </ThemedText>
    </Card>
  );
}
