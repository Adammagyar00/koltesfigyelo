import { requireOptionalNativeModule } from 'expo';

interface PdfTextNative {
  extractText(uri: string): Promise<string[]>;
}

const native = requireOptionalNativeModule<PdfTextNative>('PdfText');

/** Igaz, ha ezen a platformon (Android) elérhető a PDF-beolvasás. */
export const isPdfSupported = native != null;

/** A PDF szövege oldalanként. */
export async function extractPdfText(uri: string): Promise<string[]> {
  if (!native) throw new Error('A PDF-beolvasás ezen az eszközön nem érhető el.');
  return native.extractText(uri);
}
