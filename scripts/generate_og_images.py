"""Generate 1200x630 Open Graph (link preview) PNGs with Pillow.

LinkedIn, KakaoTalk and X don't render SVG previews, so og:image must be PNG/JPG.

Usage:  python scripts/generate_og_images.py
Output: assets/images/jj-og-default.png
        assets/images/og/envx-second-warrant-2026.png

Fonts: Noto Sans KR (variable) for Korean text, Georgia for the English title.
Paths default to C:/Windows/Fonts; override with OG_FONT_DIR.
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "images"
FONT_DIR = Path(os.environ.get("OG_FONT_DIR", "C:/Windows/Fonts"))

W, H = 1200, 630
BG = (13, 17, 23)          # --bg-primary
BG2 = (22, 27, 34)         # --bg-secondary
BORDER = (48, 54, 61)      # --border
TEXT = (230, 237, 243)     # --text-primary
MUTED = (139, 148, 158)    # --text-secondary
GOLD = (233, 150, 38)      # logo orange
BLUE = (59, 139, 212)      # --accent-blue
GREEN = (63, 185, 80)      # --accent-green


def noto(size, weight=700):
    f = ImageFont.truetype(str(FONT_DIR / "NotoSansKR-VF.ttf"), size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def georgia(size, bold=True):
    return ImageFont.truetype(str(FONT_DIR / ("georgiab.ttf" if bold else "georgia.ttf")), size)


def logo(diameter):
    """Crop the round badge out of jj-logo.png (which has an off-white square background)."""
    src = Image.open(IMG / "jj-logo.png").convert("RGBA")
    cx, cy, r = 504, 540, 452
    src = src.crop((cx - r, cy - r, cx + r, cy + r))
    scale = 4  # supersampled mask for smooth edges
    mask = Image.new("L", (2 * r * scale, 2 * r * scale), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 2 * r * scale - 1, 2 * r * scale - 1), fill=255)
    mask = mask.resize(src.size, Image.LANCZOS)
    src.putalpha(mask)
    return src.resize((diameter, diameter), Image.LANCZOS)


def base():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # subtle bottom band + accent line
    d.rectangle((0, H - 70, W, H), fill=BG2)
    d.line((0, H - 70, W, H - 70), fill=BORDER, width=2)
    d.rectangle((0, 0, W, 8), fill=GOLD)
    return im, d


def save(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Quantize to a palette: flat-colour artwork stays crisp and the file shrinks a lot.
    im.convert("RGB").quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE).save(
        path, "PNG", optimize=True
    )
    print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.1f} KB")


def default_image():
    im, d = base()
    lg = logo(340)
    im.paste(lg, (90, (H - 70 - 340) // 2 + 4), lg)
    x = 490
    d.text((x, 150), "JJ International", font=georgia(64), fill=TEXT)
    d.text((x, 228), "Financial Analysis", font=georgia(64), fill=TEXT)
    d.rectangle((x, 330, x + 90, 335), fill=GOLD)
    d.text((x, 362), "S&P 500 · Bitcoin · Macro · Portfolio", font=noto(30, 500), fill=MUTED)
    d.text((x, 410), "미국 주식 · 크립토 · 매크로 분석", font=noto(30, 500), fill=MUTED)
    d.text((40, H - 52), "jjanalysis.com", font=noto(28, 600), fill=GOLD)
    save(im, IMG / "jj-og-default.png")


def envx_image():
    im, d = base()
    x = 70
    d.text((x, 52), "심층 분석 · DEEP DIVE", font=noto(26, 700), fill=GOLD)
    d.text((x, 92), "에노빅스(ENVX) 2차 워런트 배당", font=noto(64, 800), fill=TEXT)
    d.text((x, 182), "작년 ENVXW와 무엇이 다른가", font=noto(38, 500), fill=MUTED)

    rows = [("행사가", "$8.75", "$3.00"), ("트리거", "$10.50", "$3.30"), ("만기", "2026-10", "2028-04")]
    top, row_h = 268, 82
    card = (x, top - 14, W - x, top + row_h * len(rows) - 6)
    d.rounded_rectangle(card, radius=14, fill=BG2, outline=BORDER, width=2)
    lab_f, old_f, new_f, arr_f = noto(34, 600), noto(40, 500), noto(44, 800), noto(40, 700)
    for i, (lab, old, new) in enumerate(rows):
        cy = top + i * row_h + row_h // 2 - 10
        if i:
            d.line((x + 24, top + i * row_h - 10, W - x - 24, top + i * row_h - 10), fill=BORDER, width=1)
        d.text((x + 40, cy), lab, font=lab_f, fill=MUTED, anchor="lm")
        d.text((x + 400, cy), old, font=old_f, fill=MUTED, anchor="rm")
        d.text((x + 480, cy), "→", font=arr_f, fill=GOLD, anchor="mm")
        d.text((x + 560, cy), new, font=new_f, fill=GREEN, anchor="lm")

    lg = logo(46)
    im.paste(lg, (40, H - 58), lg)
    d.text((100, H - 35), "jjanalysis.com", font=noto(28, 600), fill=GOLD, anchor="lm")
    d.text((W - 40, H - 35), "JJ International Financial Analysis", font=noto(24, 500), fill=MUTED, anchor="rm")
    save(im, IMG / "og" / "envx-second-warrant-2026.png")


if __name__ == "__main__":
    default_image()
    envx_image()
