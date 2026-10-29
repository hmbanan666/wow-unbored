"""Builds every mascot asset from art/mascot-wisp.jpg.

    pip install pillow numpy
    python3 art/build_assets.py

Writes the in-game portraits (Media/*.tga), the companion icons
(companion/src-tauri/icons) and the window images (companion/ui/img).
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art" / "mascot-wisp.jpg"
CENTER = (513, 508)
RADIUS = 492
SUPER = 4


def portrait(size: int, image: Image.Image) -> Image.Image:
    left = CENTER[0] - RADIUS
    top = CENTER[1] - RADIUS
    crop = image.crop((left, top, left + 2 * RADIUS, top + 2 * RADIUS))
    big = size * SUPER
    crop = crop.resize((big, big), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    crop.putalpha(mask)
    return crop.resize((size, size), Image.LANCZOS)


def thinking(image: Image.Image) -> Image.Image:
    """Cooler and dimmer, with three dots, as if lost in thought."""
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(0.75)
    rgb = ImageEnhance.Brightness(rgb).enhance(0.82)
    tint = Image.new("RGB", rgb.size, (40, 70, 160))
    rgb = Image.blend(rgb, tint, 0.18)
    draw = ImageDraw.Draw(rgb)
    r = 30
    for i in range(3):
        cx = 655 + i * 85
        cy = 855
        draw.ellipse((cx - r - 6, cy - r - 6, cx + r + 6, cy + r + 6), fill=(20, 40, 60))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(235, 250, 255))
    return rgb


def happy(image: Image.Image) -> Image.Image:
    """Brighter and warmer, with a few sparkles."""
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.25)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.12)
    glow = Image.new("RGB", rgb.size, (255, 215, 120))
    rgb = Image.blend(rgb, glow, 0.08)
    sparkles = Image.new("L", rgb.size, 0)
    draw = ImageDraw.Draw(sparkles)
    for cx, cy, s in ((250, 250, 55), (790, 210, 45), (230, 760, 40), (820, 640, 35)):
        draw.polygon([(cx, cy - s), (cx + s // 4, cy), (cx, cy + s), (cx - s // 4, cy)], fill=255)
        draw.polygon([(cx - s, cy), (cx, cy - s // 4), (cx + s, cy), (cx, cy + s // 4)], fill=255)
    sparkles = sparkles.filter(ImageFilter.GaussianBlur(2))
    gold = Image.new("RGB", rgb.size, (255, 240, 170))
    rgb.paste(gold, (0, 0), sparkles)
    return rgb


def glow(size: int) -> Image.Image:
    """Soft teal ring for the pulse animation behind the portrait."""
    y, x = np.mgrid[0:size, 0:size]
    c = (size - 1) / 2
    d = np.sqrt((x - c) ** 2 + (y - c) ** 2) / c
    alpha = np.clip(np.exp(-((d - 0.82) ** 2) / 0.012), 0, 1)
    alpha[d > 1] = 0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = 120
    rgba[..., 1] = 255
    rgba[..., 2] = 220
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def save_tga(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="TGA", compression=None)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    states = {"Idle": source, "Thinking": thinking(source), "Happy": happy(source)}
    media = ROOT / "Media"
    for name, image in states.items():
        for size in (64, 128):
            save_tga(portrait(size, image), media / f"Wisp{name}{size}.tga")
    save_tga(portrait(64, source), media / "Icon.tga")
    save_tga(glow(128), media / "WispGlow.tga")

    icons = ROOT / "companion" / "src-tauri" / "icons"
    big = portrait(512, source)
    big.save(icons / "icon.png")
    portrait(128, source).save(icons / "128x128.png")
    portrait(256, source).save(icons / "128x128@2x.png")
    portrait(32, source).save(icons / "32x32.png")
    sizes = [16, 24, 32, 48, 64, 128, 256]
    portrait(256, source).save(icons / "icon.ico", sizes=[(s, s) for s in sizes])

    ui = ROOT / "companion" / "ui" / "img"
    ui.mkdir(parents=True, exist_ok=True)
    for name, image in states.items():
        portrait(256, image).save(ui / f"wisp-{name.lower()}.png")


if __name__ == "__main__":
    main()
