import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { compareVersions } from '@/lib/version';

/**
 * Frissítés a GitHub-repó `releases` ágáról (a Play Áruház nélkül telepített apphoz).
 * Az ágon mindig csak a legutolsó verzió van: `latest.json` (verzió, leírás, fájlnév) és maga az APK.
 * Az app letölti az APK-t, majd megnyitja az Android telepítőjét
 * (a "Telepítés" gombot az Android mindig jóváhagyatja).
 */
const BASE = 'https://raw.githubusercontent.com/Adammagyar00/koltesfigyelo/releases';

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string;
  sizeBytes: number;
}

export const currentVersion = Application.nativeApplicationVersion ?? '0.0.0';

export const updatesSupported = Platform.OS === 'android';

interface LatestManifest {
  version: string;
  notes?: string;
  apk: string;
  size?: number;
}

/** Null, ha nincs újabb verzió. Hálózati hibánál kivételt dob. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!updatesSupported) return null;
  // Időbélyeg a címben, hogy ne egy gyorsítótárazott régi választ kapjunk.
  const res = await fetch(`${BASE}/latest.json?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (res.status === 404) return null; // még nincs kiadás, vagy a repó nem nyilvános
  if (!res.ok) throw new Error(`GitHub: ${res.status}`);
  const m = (await res.json()) as LatestManifest;
  if (!m.version || !m.apk || compareVersions(m.version, currentVersion) <= 0) return null;
  return {
    version: m.version,
    notes: (m.notes ?? '').trim(),
    apkUrl: `${BASE}/${encodeURIComponent(m.apk)}`,
    sizeBytes: m.size ?? 0,
  };
}

/** Letölti az új verziót, és megnyitja a telepítőt. */
export async function downloadAndInstall(update: UpdateInfo): Promise<void> {
  const target = new File(Paths.cache, `koltesfigyelo-${update.version}.apk`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(update.apkUrl, target);
  // Androidon a File objektum a FileProvideren keresztüli content:// címet is ismeri
  // (a típusdefiníció nem tartalmazza).
  const contentUri = (file as unknown as { contentUri: string }).contentUri;
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
