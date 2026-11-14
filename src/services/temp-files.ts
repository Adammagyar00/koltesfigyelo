import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * A fájlválasztó minden kiválasztott fájlról (bankkivonat, mentés) másolatot tesz az app gyorsítótárába
 * ("DocumentPicker" mappa). Ezeket beolvasás után töröljük, hogy a kivonat ne maradjon a telefonon az
 * app tárhelyén; induláskor a korábbi maradékokat és a régi mentésfájlokat is eltakarítjuk.
 */
export function cleanupPickedFiles(): void {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.cache, 'DocumentPicker');
    if (dir.exists) dir.delete();
  } catch {
    // A takarítás nem kritikus.
  }
}

/** A "Mentés fájlba" által a gyorsítótárba írt, már megosztott mentésfájlok törlése. */
export function cleanupExportedBackups(): void {
  if (Platform.OS === 'web') return;
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && /^koltesfigyelo-mentes-.*\.json$/.test(item.name)) item.delete();
    }
  } catch {
    // A takarítás nem kritikus.
  }
}
