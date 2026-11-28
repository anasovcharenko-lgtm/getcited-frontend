#!/usr/bin/env python3
"""Build the Apple touch icon, 180x180, matching the site's logo mark.

The mark lives in three places that have to agree: the header component, the
favicon SVG and this PNG. The first two are text and get renamed with the rest
of the code; this one is pixels, so when the brand letter changes it has to be
rebuilt here or the home-screen icon quietly keeps the old initial.
"""
from PIL import Image, ImageDraw, ImageFont
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "apple-touch-icon.png"
LETTER = sys.argv[2] if len(sys.argv) > 2 else "N"

S = 180
BLACK = (23, 23, 23, 255)   # neutral-900, same as the favicon and the header
WHITE = (255, 255, 255, 255)
RADIUS = 40                  # ~22% of the side, matching favicon.svg's rx=14/64

F = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"

# Drawn at 4x and downsampled: PIL has no antialiasing on shapes or text, and
# at 180px a hard-edged rounded corner is visible on a retina home screen.
SCALE = 4
img = Image.new("RGBA", (S * SCALE, S * SCALE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S * SCALE - 1, S * SCALE - 1],
                    radius=RADIUS * SCALE, fill=BLACK)

f = ImageFont.truetype(F, 104 * SCALE)
b = d.textbbox((0, 0), LETTER, font=f)
d.text(((S * SCALE - (b[2] - b[0])) / 2 - b[0],
        (S * SCALE - (b[3] - b[1])) / 2 - b[1]), LETTER, font=f, fill=WHITE)

img.resize((S, S), Image.LANCZOS).save(OUT)
print(f"wrote {OUT} ({S}x{S}, letter {LETTER!r})")
