#!/usr/bin/env python3
"""Cut assets/gunman.png out of the original 6-pose shooter render.

The source art is a flat RGB image with the "transparency" checkerboard baked in
as real pixels, and with the poses laid out in 256px cells whose rifle barrels
and muzzle flash spill over into the neighbouring cell. This script keys the
checkerboard out, separates the poses by connected component rather than by a
straight slice, un-composites the ground shadow back to semi-transparent black,
and re-lays the poses on a uniform grid that keeps the original alignment.

    python3 tools/build_gunman_sheet.py <source.png> [assets/gunman.png]

Needs pillow, numpy and scipy. Only has to be re-run if the source art changes.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else 'gunman-source.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/gunman.png'

CELL = 256                # cell pitch in the source layout
NFRAMES = 6
PAD = 6                   # breathing room around the tightest common box
SHADOW_TOP = 718          # first row of the flat ground shadow
FLASH_X = (1050, 1082)    # pose 4's muzzle flash overlaps pose 5's arm

rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int16)
h, w, _ = rgb.shape
mx, mn = rgb.max(2), rgb.min(2)
grey = rgb.mean(2)

# --- 1. key out the checkerboard -------------------------------------------
# Flood the "paper white" colour in from the borders so bright *interior*
# pixels (cap logo, belt buckle, muzzle flash core) survive the key.
paper = (mn > 236) & ((mx - mn) < 16)
lab, n_paper = ndimage.label(paper)
outside = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
outside.discard(0)
# The ground shadow bridges the gap between the legs, so the background trapped
# in there never reaches a border. Such a pocket is still background if it
# carries both checkerboard tones; a flat white patch is artwork.
light = grey > 249
for i in range(1, n_paper + 1):
    if i in outside:
        continue
    m = lab == i
    if int(m.sum()) < 200:
        continue
    if 0.12 < float(light[m].mean()) < 0.88:
        outside.add(i)
fg = ~np.isin(lab, list(outside))

# Shave the anti-aliased rim. Those pixels are the artwork half-blended with the
# checkerboard, and left in they read as a white halo once the sheet is
# quantised. Only near-white boundary pixels go, so dark outlines, the ground
# shadow and the muzzle smoke all keep their shape.
for _ in range(2):
    rim = fg & ~ndimage.binary_erosion(fg, np.ones((3, 3)))
    fg &= ~(rim & (mn > 200))

# --- 2. split the poses -----------------------------------------------------
xs = np.arange(w)[None, :].repeat(h, 0)
flash = (rgb[:, :, 0] >= 225) & (rgb[:, :, 1] >= 140) & (rgb[:, :, 2] <= 175) \
        & (xs >= FLASH_X[0]) & (xs < FLASH_X[1]) & fg

lab2, _ = ndimage.label(fg & ~flash, structure=np.ones((3, 3)))
frames = [np.zeros((h, w), bool) for _ in range(NFRAMES)]
for i in range(1, lab2.max() + 1):
    blob = lab2 == i
    if int(blob.sum()) < 12:            # stray keying noise
        continue
    cx = float(np.nonzero(blob.any(0))[0].mean())
    frames[min(int(cx) // CELL, NFRAMES - 1)] |= blob
frames[3] |= flash                      # hand the flash back to the firing pose

# --- 3. un-composite the ground shadow --------------------------------------
shadow = fg & (mx - mn <= 20) & (mn >= 95) & (mn <= 245)
shadow[:SHADOW_TOP, :] = False

# --- 4. lay the poses out on a uniform grid ---------------------------------
# Each pose keeps its original y and its original x relative to the centre of
# its cell, so the character never jitters from frame to frame.
lo, hi, top, bot = 10 ** 6, -10 ** 6, 10 ** 6, -10 ** 6
for i, m in enumerate(frames):
    ys, xx = np.nonzero(m)
    c = CELL * i + CELL // 2
    lo, hi = min(lo, xx.min() - c), max(hi, xx.max() - c)
    top, bot = min(top, ys.min()), max(bot, ys.max())
fw, fh = int(hi - lo) + 1 + 2 * PAD, int(bot - top) + 1 + 2 * PAD

sheet = np.zeros((fh, fw * NFRAMES, 4), np.uint8)
for i, m in enumerate(frames):
    ys, xx = np.nonzero(m)
    c = CELL * i + CELL // 2
    dx = (xx - c - lo + PAD) + i * fw
    dy = ys - top + PAD
    sh = shadow[ys, xx]
    sheet[dy, dx, :3] = np.where(sh[:, None], 0, rgb[ys, xx]).astype(np.uint8)
    sheet[dy, dx, 3] = np.where(sh, np.clip(255 - grey[ys, xx], 0, 255), 255)

# 64 colours is indistinguishable from the 60k-colour original here and cuts the
# file from ~600 KB to ~100 KB.
img = Image.fromarray(sheet, 'RGBA').quantize(colors=64, method=Image.FASTOCTREE)
img.save(OUT, optimize=True)
print('wrote %s — %d cels of %dx%d' % (OUT, NFRAMES, fw, fh))
