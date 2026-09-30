#!/usr/bin/env python3
"""Build the Open Graph preview image, 1200x630, in the site's monochrome style."""
from PIL import Image, ImageDraw, ImageFont
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "og.png"

W, H = 1200, 630
BLACK = (23, 23, 23)       # neutral-900
GREY = (115, 115, 115)     # neutral-500
LINE = (229, 229, 229)     # neutral-200
WHITE = (255, 255, 255)

F = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
FR = "/usr/share/fonts/truetype/freefont/FreeSans.ttf"

def font(path, size):
    return ImageFont.truetype(path, size)

img = Image.new("RGB", (W, H), WHITE)
d = ImageDraw.Draw(img)

PAD = 84

# Logo mark: black rounded square with a G, same as the site header.
M = 76
d.rounded_rectangle([PAD, PAD, PAD + M, PAD + M], radius=18, fill=BLACK)
gf = font(F, 46)
gb = d.textbbox((0, 0), "G", font=gf)
d.text((PAD + (M - (gb[2] - gb[0])) / 2 - gb[0],
        PAD + (M - (gb[3] - gb[1])) / 2 - gb[1]), "G", font=gf, fill=WHITE)

wf = font(F, 40)
d.text((PAD + M + 24, PAD + (M - 40) / 2 - 4), "GetCited", font=wf, fill=BLACK)

# Headline
hf = font(F, 82)
y = 262
for line in ["Win more clients.", "Get cited by AI."]:
    d.text((PAD, y), line, font=hf, fill=BLACK)
    y += 96

# Rule, then the supporting line
d.line([PAD, 494, W - PAD, 494], fill=LINE, width=2)

sf = font(FR, 30)
d.text((PAD, 524), "See how often AI recommends your brand", font=sf, fill=GREY)

uf = font(FR, 30)
url = "getcited.space"
ub = d.textbbox((0, 0), url, font=uf)
d.text((W - PAD - (ub[2] - ub[0]), 524), url, font=uf, fill=BLACK)

img.save(OUT)
print(f"wrote {OUT} ({W}x{H})")
