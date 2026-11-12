"""App-ikonok generálása (Költésfigyelő): zöld háttér, fehér "Ft" és csökkenő trendvonal.
Futtatás: python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
GREEN = (31, 122, 85, 255)
LIGHT = (155, 227, 191, 255)
WHITE = (255, 255, 255, 255)
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'


def glyph(size: int, color=WHITE, accent=LIGHT, scale=1.0) -> Image.Image:
    """A jel átlátszó háttéren; `scale` a rajz mérete a vászonhoz képest."""
    s = size * 4  # túlmintavételezés a sima élekért
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = s / 2
    u = s * scale / 100  # egység: a rajzolható terület 1%-a
    font = ImageFont.truetype(FONT, int(42 * u))
    text = 'Ft'
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text((c - w / 2 - box[0], c - h / 2 - box[1] - 8 * u), text, font=font, fill=color)
    # Csökkenő trendvonal nyíllal
    pts = [(c - 30 * u, c + 22 * u), (c - 10 * u, c + 30 * u), (c + 4 * u, c + 24 * u), (c + 26 * u, c + 36 * u)]
    d.line(pts, fill=accent, width=int(6 * u), joint='curve')
    tip = pts[-1]
    d.polygon([(tip[0] + 6 * u, tip[1] + 3 * u), (tip[0] - 9 * u, tip[1] + 6 * u), (tip[0] - 2 * u, tip[1] - 8 * u)], fill=accent)
    return im.resize((size, size), Image.LANCZOS)


def solid(size: int, color=GREEN) -> Image.Image:
    return Image.new('RGBA', (size, size), color)


def rounded(size: int) -> Image.Image:
    s = size * 4
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s, s), radius=int(s * 0.22), fill=255)
    im = solid(s)
    im.alpha_composite(glyph(s, scale=0.8))
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


# Android adaptív ikon: az előtér a középső ~66%-os biztonságos zónában maradjon.
solid(512).save(ROOT / 'android-icon-background.png')
glyph(512, scale=0.62).save(ROOT / 'android-icon-foreground.png')
glyph(432, color=WHITE, accent=WHITE, scale=0.62).save(ROOT / 'android-icon-monochrome.png')
# Általános ikon (teljes, kitöltött négyzet – a platform maga kerekíti le)
icon = solid(1024)
icon.alpha_composite(glyph(1024, scale=0.8))
icon.convert('RGB').save(ROOT / 'icon.png')
# Indítóképernyő: a jel a zöld háttéren (a háttérszínt az app.json adja)
glyph(512, scale=0.95).save(ROOT / 'splash-icon.png')
rounded(64).save(ROOT / 'favicon.png')
print('kész')
