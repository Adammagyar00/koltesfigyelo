# PDFBox-Android: a JPEG2000-dekóder opcionális függőség, szövegkinyeréshez nem kell.
-dontwarn com.gemalto.jp2.**
# A PDFBox erőforrásokat és osztályokat névvel tölt be, ezért nem tömörítjük.
-keep class com.tom_roush.pdfbox.** { *; }
-keep class com.tom_roush.fontbox.** { *; }
-keep class com.tom_roush.harmony.** { *; }
