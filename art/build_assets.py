"""Builds every Bory asset (BRAND.md) from art/bory/.

    pip install pillow numpy
    python3 art/build_assets.py

The portrait is layers, never one baked picture:

- BoryBack: a dark warm disc behind him, so he reads on any game scene.
- Bory<Mood>: his bust on transparent, cut round to sit inside the ring.
  Moods swap only this layer.
- BoryFrame: the thin gold ring on top, drawn here with a soft sheen.

Writes the in-game textures (addon/Media/*.tga, 128x128, 32-bit,
uncompressed), the Companion window pictures (apps/companion/ui/img/*.png; the window draws
the disc in CSS),
the minimap icon and the Companion app icons (the three layers flattened).
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MOODS_SHEET = ROOT / "art" / "bory" / "bory-moods.jpg"
SUPER = 4

# The sheet is a 2x2 grid on flat grey.
MOODS = {"Idle": (0, 0), "Thinking": (1, 0), "Waiting": (0, 1), "Happy": (1, 1)}
KEY_DISTANCE = 22

# Geometry as a share of the texture side.
RING_OUTER = 0.49
RING_WIDTH = 0.055
# The bust is cut a hair wider than the opening, so the ring covers the cut.
BUST_RADIUS = RING_OUTER - RING_WIDTH + 0.01

# BRAND.md palette.
GOLD = np.array((232, 176, 74), float)
HIGHLIGHT = np.array((245, 210, 122), float)
SHADE = np.array((150, 98, 34), float)
BG = (30, 20, 16)
RAISED = (42, 28, 21)


def key_background(sheet: Image.Image) -> Image.Image:
    """Grey connected to the edges of each cell becomes transparent."""
    rgb = np.asarray(sheet.convert("RGB")).astype(int)
    h, w, _ = rgb.shape
    grey = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    near = np.abs(rgb - grey).max(axis=2) < KEY_DISTANCE
    background = np.zeros((h, w), bool)
    stack = [(y, x) for x in range(w) for y in (0, h - 1)] + [
        (y, x) for y in range(h) for x in (0, w - 1)
    ]
    while stack:
        y, x = stack.pop()
        if background[y, x] or not near[y, x]:
            continue
        background[y, x] = True
        if y > 0:
            stack.append((y - 1, x))
        if y < h - 1:
            stack.append((y + 1, x))
        if x > 0:
            stack.append((y, x - 1))
        if x < w - 1:
            stack.append((y, x + 1))
    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8))
    # A soft, slightly pulled-in edge: no grey halo on the dark disc.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = sheet.convert("RGBA")
    out.putalpha(alpha)
    return out


def cell(keyed: Image.Image, column: int, row: int) -> Image.Image:
    half = keyed.width // 2
    return keyed.crop((column * half, row * half, (column + 1) * half, (row + 1) * half))


def bust(art: Image.Image, size: int) -> Image.Image:
    """The head and scarf centred in the ring opening, cut round."""
    solid = art.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    _, top, _, bottom = solid.getbbox()
    # Framed on the head (ears to cheeks), so a raised paw does not shrink him.
    head = solid.crop((0, top, art.width, top + int((bottom - top) * 0.42))).getbbox()
    left, right = head[0], head[2]
    side = int((right - left) * 1.12)
    cx = (left + right) / 2
    y0 = top - side * 0.05
    square = art.crop((int(cx - side / 2), int(y0), int(cx + side / 2), int(y0 + side)))
    big = size * SUPER
    inner = int(round(2 * BUST_RADIUS * big))
    square = square.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    offset = (big - inner) // 2
    canvas.paste(square, (offset, offset))
    circle = Image.new("L", (big, big), 0)
    ImageDraw.Draw(circle).ellipse((offset, offset, offset + inner - 1, offset + inner - 1), fill=255)
    alpha = np.minimum(np.asarray(canvas.getchannel("A")), np.asarray(circle))
    canvas.putalpha(Image.fromarray(alpha))
    return canvas.resize((size, size), Image.LANCZOS)


def back(size: int) -> Image.Image:
    """A dark warm disc, a touch lighter at the top, under the bust."""
    big = size * SUPER
    yy, xx = np.mgrid[0:big, 0:big].astype(float)
    c = (big - 1) / 2
    r = np.hypot(xx - c, yy - c) / big
    t = np.clip((yy / big - 0.15) / 0.8, 0, 1)[..., None]
    rgb = np.array(RAISED, float) * (1 - t) + np.array(BG, float) * t
    alpha = np.clip((BUST_RADIUS - r) * big, 0, 1) * 255
    image = np.dstack([rgb, alpha]).astype(np.uint8)
    return Image.fromarray(image, "RGBA").resize((size, size), Image.LANCZOS)


def frame(size: int) -> Image.Image:
    """A thin gold ring: light from the top left, a soft sheen, a crisp bevel."""
    big = size * SUPER
    yy, xx = np.mgrid[0:big, 0:big].astype(float)
    c = (big - 1) / 2
    dx, dy = (xx - c) / big, (yy - c) / big
    r = np.hypot(dx, dy)
    outer, inner = RING_OUTER, RING_OUTER - RING_WIDTH
    edge = 1.0 / big
    alpha = np.clip((outer - r) / edge, 0, 1) * np.clip((r - inner) / edge, 0, 1)
    # 0 at the inner edge, 1 at the outer one: a rounded band, brightest just outside the middle.
    across = np.clip((r - inner) / RING_WIDTH, 0, 1)
    bevel = np.sin(np.pi * np.clip(across * 0.9 + 0.08, 0, 1)) ** 0.7
    # Light from the top left; the far side stays warm, never brown.
    angle = np.arctan2(dy, dx)
    light = 0.5 + 0.5 * np.cos(angle - np.deg2rad(-135))
    tone = 0.25 + 0.55 * light + 0.2 * bevel
    rgb = np.where(
        (tone < 0.6)[..., None],
        SHADE + (GOLD - SHADE) * (tone / 0.6)[..., None],
        GOLD + (HIGHLIGHT - GOLD) * ((tone - 0.6) / 0.4)[..., None],
    )
    # The sheen: a soft bright arc across the top left.
    sheen = np.exp(-(((angle - np.deg2rad(-125)) / 0.35) ** 2)) * np.exp(-(((across - 0.55) / 0.22) ** 2))
    rgb = rgb + (np.array((255, 244, 210)) - rgb) * (0.55 * sheen)[..., None]
    # A fine dark line on the inner edge keeps the art and the ring apart.
    lip = np.exp(-((across / 0.12) ** 2)) * 0.45
    rgb = rgb * (1 - lip)[..., None]
    image = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(image, "RGBA").resize((size, size), Image.LANCZOS)


def flat(art: Image.Image, size: int) -> Image.Image:
    out = back(size)
    out.alpha_composite(art.resize((size, size), Image.LANCZOS))
    out.alpha_composite(frame(size))
    return out


def save_tga(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="TGA", compression=None)


def main() -> None:
    keyed = key_background(Image.open(MOODS_SHEET))
    moods = {name: cell(keyed, *at) for name, at in MOODS.items()}
    media = ROOT / "addon" / "Media"
    ui = ROOT / "apps" / "companion" / "ui" / "img"
    ui.mkdir(parents=True, exist_ok=True)
    for name, art in moods.items():
        save_tga(bust(art, 128), media / f"Bory{name}128.tga")
        bust(art, 256).save(ui / f"bory-{name.lower()}.png")
    save_tga(frame(128), media / "BoryFrame128.tga")
    save_tga(back(128), media / "BoryBack128.tga")
    frame(256).save(ui / "bory-frame.png")

    idle = bust(moods["Idle"], 512)
    save_tga(flat(idle, 64), media / "Icon.tga")
    icons = ROOT / "apps" / "companion" / "src-tauri" / "icons"
    flat(idle, 512).save(icons / "icon.png")
    flat(idle, 128).save(icons / "128x128.png")
    flat(idle, 256).save(icons / "128x128@2x.png")
    flat(idle, 32).save(icons / "32x32.png")
    sizes = [16, 24, 32, 48, 64, 128, 256]
    flat(idle, 256).save(icons / "icon.ico", sizes=[(s, s) for s in sizes])


if __name__ == "__main__":
    main()
