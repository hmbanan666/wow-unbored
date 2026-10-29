"""Builds the bubble's action icons (addon/Media/Icon*.tga), one family.

    pip install pillow
    python3 art/build_icons.py

White glyphs on transparent 64x64, drawn at 4x and scaled down. The game
tints them with SetVertexColor, so every button shares one look.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SIZE = 64
SUPER = 4
BIG = SIZE * SUPER
WHITE = (255, 255, 255, 255)
STROKE = 7 * SUPER


def canvas():
    image = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def s(value: float) -> float:
    return value * SUPER


def line(draw, points, width=STROKE):
    pts = [(s(x), s(y)) for x, y in points]
    draw.line(pts, fill=WHITE, width=width, joint="curve")
    r = width / 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)


def dot(draw, x, y, r):
    draw.ellipse((s(x - r), s(y - r), s(x + r), s(y + r)), fill=WHITE)


def done():
    image, draw = canvas()
    line(draw, [(14, 33), (27, 46), (50, 19)])
    return image


def skip():
    image, draw = canvas()
    line(draw, [(14, 16), (30, 32), (14, 48)])
    line(draw, [(32, 16), (48, 32), (32, 48)])
    return image


def chevron():
    image, draw = canvas()
    line(draw, [(38, 14), (22, 32), (38, 50)])
    return image


def back():
    image, draw = canvas()
    line(draw, [(48, 32), (16, 32)])
    line(draw, [(30, 18), (16, 32), (30, 46)])
    return image


def listing():
    image, draw = canvas()
    for y in (18, 32, 46):
        dot(draw, 15, y, 4.5)
        line(draw, [(26, y), (50, y)], width=6 * SUPER)
    return image


def menu():
    image, draw = canvas()
    for x in (16, 32, 48):
        dot(draw, x, 32, 5.5)
    return image


def send():
    image, draw = canvas()
    draw.polygon([(s(10), s(12)), (s(54), s(32)), (s(10), s(52)), (s(18), s(32))], fill=WHITE)
    return image


def refresh():
    image, draw = canvas()
    box = (s(13), s(13), s(51), s(51))
    draw.arc(box, start=-60, end=230, fill=WHITE, width=STROKE)
    angle = math.radians(-60)
    cx, cy, r = 32, 32, 19
    tip_x, tip_y = cx + r * math.cos(angle), cy + r * math.sin(angle)
    draw.polygon(
        [(s(tip_x + 9), s(tip_y - 3)), (s(tip_x - 6), s(tip_y - 9)), (s(tip_x - 1), s(tip_y + 9))],
        fill=WHITE,
    )
    return image


def close():
    image, draw = canvas()
    line(draw, [(18, 18), (46, 46)])
    line(draw, [(46, 18), (18, 46)])
    return image


def flag():
    image, draw = canvas()
    line(draw, [(18, 12), (18, 54)])
    draw.polygon([(s(20), s(12)), (s(50), s(20)), (s(20), s(30))], fill=WHITE)
    return image


ICONS = {
    "IconDone": done,
    "IconSkip": skip,
    "IconChevron": chevron,
    "IconBack": back,
    "IconList": listing,
    "IconMenu": menu,
    "IconSend": send,
    "IconRefresh": refresh,
    "IconClose": close,
    "IconPlan": flag,
}


def main() -> None:
    media = ROOT / "addon" / "Media"
    for name, build in ICONS.items():
        image = build().resize((SIZE, SIZE), Image.LANCZOS)
        image.save(media / f"{name}.tga", format="TGA", compression=None)


if __name__ == "__main__":
    main()
