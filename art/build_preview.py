"""Draws docs/img/bory-preview.png for the README: Bory's plan card and a
tooltip line, from the addon's own portrait layers, icons, sizes, palette
and strings.

    pip install pillow
    python3 art/build_preview.py

It is a preview, not an in-game capture; replace it with a real screenshot
once there is one (Screenshots/README.md).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
K = 2
# ns.PALETTE in addon/Core/Namespace.lua (BRAND.md).
ACCENT = (232, 176, 74)
GOLD = (245, 210, 122)
CREAM = (234, 219, 192)
MUTED = (184, 163, 133)
BG = (30, 20, 16, 240)
RAISED = (42, 28, 21, 235)
EPIC = (163, 53, 238)
WHITE = (255, 255, 255)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SIZE = 52
BUBBLE = 300
PAD = 10
ACTION = 24


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size * K)


def media(name, size):
    image = Image.open(ROOT / "addon" / "Media" / f"{name}.tga").convert("RGBA")
    return image.resize((size * K, size * K), Image.LANCZOS)


def tinted(name, size, color):
    icon = media(name, size)
    solid = Image.new("RGBA", icon.size, color + (255,))
    solid.putalpha(icon.getchannel("A"))
    return solid


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for word in text.split():
        probe = (line + " " + word).strip()
        if draw.textlength(probe, font=fnt) <= width * K:
            line = probe
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def panel(draw, box, alpha=240):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle((x0, y0, x1, y1), radius=6 * K, fill=BG[:3] + (alpha,), outline=ACCENT + (230,), width=K)


def background(width, height):
    """A dusky, warm-ish game scene stand-in."""
    image = Image.new("RGB", (width, height))
    px = image.load()
    for y in range(height):
        for x in range(width):
            t = y / height
            u = x / width
            px[x, y] = (int(40 + 40 * u), int(46 + 24 * t), int(58 + 20 * (1 - t)))
    glow = Image.new("L", (width, height), 0)
    ImageDraw.Draw(glow).ellipse((width * 0.55, -height * 0.4, width * 1.3, height * 0.7), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    image.paste((210, 170, 120), (0, 0), glow)
    return image.convert("RGBA")


def text_block(draw, x, y, text, fnt, color, width):
    for line in wrap(draw, text, fnt, width):
        draw.text((x, y), line, font=fnt, fill=color)
        y += int(fnt.size * 1.3)
    return y


def portrait(size):
    out = Image.new("RGBA", (size * K, size * K), (0, 0, 0, 0))
    for layer in ("BoryBack128", "BoryIdle128", "BoryFrame128"):
        out.alpha_composite(media(layer, size))
    return out


def main():
    width, height = 1240, 560
    image = background(width, height)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    px, py = 40, 110
    layer.alpha_composite(portrait(SIZE), (px, py))

    bx = px + (SIZE + 8) * K
    by = py
    inner = BUBBLE - PAD * 2
    small, normal = font(10), font(12)
    title, message = font(12, True), font(13)

    # The closed card (docs/adr/0038): title, the step, one why, the main reward, Show more.
    y = by + (PAD - 2) * K
    rows = [
        ("Bory", small, ACCENT, inner - 48, 8),
        ("Ashes in one evening", title, GOLD, inner, 8),
        ("Fall from a great height", message, CREAM, inner, 6),
        ("It is a quick Going Down? on the way", small, MUTED, inner, 10),
        ("[Ashes of Al'ar]", small, EPIC, inner, 10),
        ("Show more", small, ACCENT, inner, 6),
    ]
    heights = []
    for text, fnt, _, w, gap in rows:
        heights.append(len(wrap(draw, text, fnt, w)) * int(fnt.size * 1.3) + gap * K)
    bar_y = y + sum(heights) + 4 * K
    bottom = bar_y + ACTION * K + PAD * K
    panel(draw, (bx, by, bx + BUBBLE * K, bottom))

    for (text, fnt, color, w, _), h in zip(rows, heights):
        text_block(draw, bx + PAD * K, y, text, fnt, color, w)
        y += h

    for i, name in enumerate(("IconChevron", "IconMenu")):
        layer.alpha_composite(tinted(name, 16, ACCENT), (bx + (BUBBLE - 24 - i * 22) * K, by + 4 * K))

    x = bx + PAD * K
    for icon in ("IconDone", "IconSkip"):
        draw.rounded_rectangle((x, bar_y, x + ACTION * K, bar_y + ACTION * K), radius=4 * K,
                               fill=RAISED, outline=ACCENT + (140,), width=K)
        layer.alpha_composite(tinted(icon, 16, ACCENT), (x + 4 * K, bar_y + 4 * K))
        x += (ACTION + 6) * K

    tx, ty = 800, 110
    tip = [
        ("Peacebloom", font(12, True), WHITE),
        ("Crafting Reagent", small, (102, 187, 255)),
        ("Herb", small, WHITE),
        ("Sell Price: 4 copper", small, WHITE),
    ]
    tw = 215 * K
    th = 14 * K + sum(int(f.size * 1.35) for _, f, _ in tip) + 22 * K
    draw.rounded_rectangle((tx, ty, tx + tw, ty + th), radius=4 * K, fill=(6, 6, 18, 240),
                           outline=(120, 120, 140, 255), width=K)
    ty2 = ty + 8 * K
    for text, fnt, color in tip:
        draw.text((tx + 8 * K, ty2), text, font=fnt, fill=color)
        ty2 += int(fnt.size * 1.35)
    draw.text((tx + 8 * K, ty2 + 2 * K), "Bory:", font=small, fill=ACCENT)
    off = draw.textlength("Bory: ", font=small)
    draw.text((tx + 8 * K + off, ty2 + 2 * K), "Send to Mira (Alchemy): mail it", font=small, fill=WHITE)

    image.alpha_composite(layer)
    note = "Preview drawn from Bory's own art and layout, not an in-game capture."
    ImageDraw.Draw(image).text((40, height - 40), note, font=font(9), fill=CREAM)
    out = ROOT / "docs" / "img" / "bory-preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
