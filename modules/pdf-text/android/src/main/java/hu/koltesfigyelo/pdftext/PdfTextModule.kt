package hu.koltesfigyelo.pdftext

import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.InputStream

class PdfPasswordException : CodedException("ERR_PDF_PASSWORD", "A PDF jelszóval védett.", null)
class PdfReadException(cause: Throwable) : CodedException("ERR_PDF_READ", "A PDF nem olvasható: ${cause.message}", cause)

/**
 * Szöveg kinyerése PDF-ből, oldalanként, a szöveg helyzete szerint rendezve
 * (így a táblázatos kivonatok sorai egyben maradnak). Az oszlopok közé tabulátor kerül.
 */
class PdfTextModule : Module() {
  private var initialized = false

  override fun definition() = ModuleDefinition {
    Name("PdfText")

    AsyncFunction("extractText") { uriString: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (!initialized) {
        PDFBoxResourceLoader.init(context)
        initialized = true
      }
      val uri = Uri.parse(uriString)
      val input: InputStream = when (uri.scheme) {
        "content" -> context.contentResolver.openInputStream(uri)
          ?: throw PdfReadException(IllegalStateException("A fájl nem nyitható meg"))
        "file", null -> File(uri.path ?: uriString).inputStream()
        else -> throw PdfReadException(IllegalArgumentException("Ismeretlen fájlcím: ${uri.scheme}"))
      }
      try {
        input.use { stream ->
          PDDocument.load(stream).use { doc ->
            if (doc.isEncrypted) {
              try {
                doc.setAllSecurityToBeRemoved(true)
              } catch (e: Exception) {
                throw PdfPasswordException()
              }
            }
            val stripper = PDFTextStripper().apply {
              sortByPosition = true
              lineSeparator = "\n"
              // A pozíció alapján beszúrt szóközök (oszlopközök) tabulátorok lesznek; a PDF-ben ténylegesen
              // szereplő szóköz karakterek (pl. ezres tagolás: "12 450") szóközök maradnak.
              wordSeparator = "\t"
            }
            val pages = mutableListOf<String>()
            for (i in 1..doc.numberOfPages) {
              stripper.startPage = i
              stripper.endPage = i
              pages.add(stripper.getText(doc))
            }
            pages
          }
        }
      } catch (e: CodedException) {
        throw e
      } catch (e: com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException) {
        throw PdfPasswordException()
      } catch (e: Exception) {
        throw PdfReadException(e)
      }
    }
  }
}
