"""Draws docs/img/wisp-preview.png for the README: Wisp's bubble and a
tooltip line, from the addon's own portrait, icons, sizes and strings.

    pip install pillow
    python3 art/build_preview.py

It is a preview, not an in-game capture; replace it with a real screenshot
once there is one (Screenshots/README.md).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
K = 2
TEAL = (94, 227, 212)
GOLD = (255, 209, 0)
WHITE = (255, 255, 255)
MUTED = (158, 178, 178)
SUB = (191, 209, 209)
BG = (8, 20, 23, 235)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SIZE = 52
BUBBLE = 260
PAD = 10
ACTION = 24


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size * K)


def media(name, size):
    image = Image.open(ROOT / "Media" / f"{name}.tga").convert("RGBA")
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


def panel(draw, box, alpha=235):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle((x0, y0, x1, y1), radius=6 * K, fill=BG[:3] + (alpha,), outline=TEAL + (230,), width=K)


def background(width, height):
    image = Image.new("RGB", (width, height))
    px = image.load()
    for y in range(height):
        for x in range(width):
            t = y / height
            u = x / width
            px[x, y] = (int(18 + 30 * u), int(40 + 40 * t), int(52 + 30 * (1 - t)))
    glow = Image.new("L", (width, height), 0)
    ImageDraw.Draw(glow).ellipse((width * 0.55, -height * 0.4, width * 1.3, height * 0.7), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    image.paste((140, 200, 190), (0, 0), glow)
    return image.convert("RGBA")


def text_block(draw, x, y, text, fnt, color, width):
    for line in wrap(draw, text, fnt, width):
        draw.text((x, y), line, font=fnt, fill=color)
        y += int(fnt.size * 1.3)
    return y


def main():
    width, height = 1240, 610
    image = background(width, height)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    px, py = 40, 110
    portrait = media("WispIdle128", SIZE)
    layer.alpha_composite(portrait, (px, py))

    bx = px + (SIZE + 8) * K
    by = py
    inner = BUBBLE - PAD * 2
    small, normal = font(10), font(12)
    header, message = font(12, True), font(13)

    # Measure first, then draw the bubble behind the text.
    y = by + (PAD - 2) * K
    rows = [
        ("1/5 · ~45 min", small, MUTED, inner - 48),
        ("Your full plan comes after a refresh. The quick one is ready now.", header, GOLD, inner),
        ("Fly to the Onyxia's Lair door in Dustwallow Marsh", message, WHITE, inner),
        ("Onyxian Drake drops from Onyxia. Solo is easy at max level.", small, SUB, inner),
        ("Point 1/2: Wyrmbog · 240 yd", small, GOLD, inner),
    ]
    heights = []
    for text, fnt, _, w in rows:
        heights.append(len(wrap(draw, text, fnt, w)) * int(fnt.size * 1.3) + 5 * K)
    bar_y = y + sum(heights) + 4 * K
    bottom = bar_y + ACTION * K + PAD * K
    panel(draw, (bx, by, bx + BUBBLE * K, bottom))

    echo_text = "Done: Check the mailbox in Stormwind"
    echo_w = int(draw.textlength(echo_text, font=small)) + PAD * 2 * K
    echo = Image.new("RGBA", image.size, (0, 0, 0, 0))
    panel(ImageDraw.Draw(echo), (bx, by - 30 * K, bx + echo_w, by - 6 * K))
    ImageDraw.Draw(echo).text((bx + PAD * K, by - 25 * K), echo_text, font=small, fill=WHITE)
    echo.putalpha(echo.getchannel("A").point(lambda a: int(a * 0.7)))
    layer.alpha_composite(echo)

    for (text, fnt, color, w), h in zip(rows, heights):
        text_block(draw, bx + PAD * K, y, text, fnt, color, w)
        y += h

    for i, name in enumerate(("IconChevron", "IconMenu")):
        layer.alpha_composite(tinted(name, 16, TEAL), (bx + (BUBBLE - 24 - i * 22) * K, by + 4 * K))

    x = bx + PAD * K
    for icon, label in (("IconDone", None), ("IconSkip", None), ("IconList", None),
                        ("IconRefresh", "Refresh"), (None, "Later")):
        w = ACTION
        if label:
            w = int(draw.textlength(label, font=small) / K) + (5 + 16 + 3 + 8 if icon else 18)
        draw.rounded_rectangle((x, bar_y, x + w * K, bar_y + ACTION * K), radius=4 * K,
                               fill=(13, 41, 43, 235), outline=TEAL + (140,), width=K)
        if icon and not label:
            layer.alpha_composite(tinted(icon, 16, TEAL), (x + 4 * K, bar_y + 4 * K))
        elif icon:
            layer.alpha_composite(tinted(icon, 16, TEAL), (x + 5 * K, bar_y + 4 * K))
            draw.text((x + 24 * K, bar_y + 5 * K), label, font=small, fill=WHITE)
        else:
            draw.text((x + 9 * K, bar_y + 5 * K), label, font=small, fill=WHITE)
        x += (w + 6) * K

    tx, ty = 760, 110
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
    draw.text((tx + 8 * K, ty2 + 2 * K), "Wisp:", font=small, fill=TEAL)
    off = draw.textlength("Wisp: ", font=small)
    draw.text((tx + 8 * K + off, ty2 + 2 * K), "Send to Mira (Alchemy): mail it", font=small, fill=WHITE)

    image.alpha_composite(layer)
    note = "Preview drawn from Wisp's own art and layout, not an in-game capture."
    ImageDraw.Draw(image).text((40, height - 40), note, font=font(9), fill=(200, 220, 220))
    out = ROOT / "docs" / "img" / "wisp-preview.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
