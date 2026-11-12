import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { compareVersions } from '@/lib/version';

/**
 * Frissítés GitHub Releases-ből (a Play Áruház nélkül telepített apphoz).
 * Az új verzió APK-ja a repó legutóbbi kiadásához van csatolva; az app letölti,
 * majd megnyitja az Android telepítőjét (a "Telepítés" gombot az Android mindig jóváhagyatja).
 */
const REPO = 'Adammagyar00/koltesfigyelo';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string;
  sizeBytes: number;
}

export const currentVersion = Application.nativeApplicationVersion ?? '0.0.0';

export const updatesSupported = Platform.OS === 'android';

interface GithubRelease {
  tag_name: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/** Null, ha nincs újabb verzió. Hálózati hibánál kivételt dob. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!updatesSupported) return null;
  const res = await fetch(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null; // még nincs kiadás, vagy a repó nem nyilvános
  if (!res.ok) throw new Error(`GitHub: ${res.status}`);
  const rel = (await res.json()) as GithubRelease;
  if (rel.draft || rel.prerelease) return null;
  if (compareVersions(rel.tag_name, currentVersion) <= 0) return null;
  const apk = rel.assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
  if (!apk) return null;
  return {
    version: rel.tag_name.replace(/^v/i, ''),
    notes: (rel.body ?? '').trim(),
    apkUrl: apk.browser_download_url,
    sizeBytes: apk.size,
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
