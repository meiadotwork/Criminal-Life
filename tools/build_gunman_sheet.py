#!/usr/bin/env python3
"""Cut assets/gunman.png out of the original 11-pose shooter render.

The source lays the poses out in two rows on a free layout — no grid, and the
rifles, muzzle flashes and ejected shells spill past each pose's bounding box —
so the poses are separated by connected component and then re-laid on a uniform
grid aligned to each one's own ground line and foot centre. That alignment is
what keeps the character from jittering as the animation cycles.

    python3 tools/build_gunman_sheet.py <source.png> [assets/gunman.png]

Also prints the leg-rig table gunman.html needs: for each pose, the column that
separates the two legs and the row where they part. The page cuts each cel along
those two lines and squashes the legs independently to build the walk cycle.

Needs pillow, numpy and scipy. Only has to be re-run if the source art changes.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else 'gunman-source.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/gunman.png'

PAD = 6            # breathing room around the tightest common box
BODY_PX = 5000     # a pose's own area; anything smaller is brass or smoke

rgba = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.uint8)
solid = rgba[:, :, 3] > 40

# --- 1. one component per pose ----------------------------------------------
lab, _ = ndimage.label(solid, structure=np.ones((3, 3)))
parts = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    area = int((lab[sl] == i).sum())
    if area < 25:                       # keying noise
        continue
    parts.append({'m': lab == i, 'x0': sl[1].start, 'x1': sl[1].stop,
                  'y0': sl[0].start, 'y1': sl[0].stop, 'a': area})
poses = [p for p in parts if p['a'] > BODY_PX]
poses.sort(key=lambda p: (p['y0'] // 500, p['x0']))   # reading order, row by row

# Ejected brass and powder smoke float free of the body. Each belongs to the
# pose it sits over — matched on x, and on y so a shell in the lower row can't
# attach itself to the pose standing above it.
for bit in (p for p in parts if p['a'] <= BODY_PX):
    cx, cy = (bit['x0'] + bit['x1']) / 2, (bit['y0'] + bit['y1']) / 2
    near = [p for p in poses if p['x0'] - 30 <= cx <= p['x1'] + 30
            and p['y0'] - 90 <= cy <= p['y1'] + 30]
    host = min(near, key=lambda p: abs(cx - (p['x0'] + p['x1']) / 2))
    host['m'] |= bit['m']

# --- 2. anchor every pose to its own stance ---------------------------------
# Ground line is the lowest body pixel; the horizontal anchor is the centre of
# the feet, which holds steady even as the stance widens from idle to a straddle.
for p in poses:
    ys, xs = np.nonzero(p['m'])
    bot, top = int(ys.max()), int(ys.min())
    feet = ys > bot - 0.10 * (bot - top)
    p['ax'], p['ay'] = float(xs[feet].mean()), bot

left = right = up = 0.0
for p in poses:
    ys, xs = np.nonzero(p['m'])
    left, right = min(left, xs.min() - p['ax']), max(right, xs.max() - p['ax'])
    up = min(up, ys.min() - p['ay'])
fw = int(round(right - left)) + 1 + 2 * PAD
fh = int(round(-up)) + 1 + 2 * PAD

sheet = np.zeros((fh, fw * len(poses), 4), np.uint8)
for k, p in enumerate(poses):
    ys, xs = np.nonzero(p['m'])
    sheet[np.round(ys - p['ay'] - up).astype(int) + PAD,
          np.round(xs - p['ax'] - left).astype(int) + PAD + k * fw] = rgba[ys, xs]

img = Image.fromarray(sheet, 'RGBA').quantize(colors=64, method=Image.FASTOCTREE)
img.save(OUT, optimize=True)
print('wrote %s — %d cels of %dx%d' % (OUT, len(poses), fw, fh))

# --- 3. leg-rig table -------------------------------------------------------
# Read the split from an ankle row, where the two feet are unambiguously apart,
# then walk up that column to find where the legs meet.
print('\nRIG = [   // splitX, crotchY per cel')
cels = sheet[:, :, 3] > 60
for k in range(len(poses)):
    m = cels[:, k * fw:(k + 1) * fw]
    ys, xs = np.nonzero(m)
    top, bot = int(ys.min()), int(ys.max())
    ankle = int(bot - 0.04 * (bot - top))
    runs, run = [], None
    for x in range(fw):
        if m[ankle, x] and run is None:
            run = x
        elif not m[ankle, x] and run is not None:
            runs.append((run, x - 1)); run = None
    runs = [r for r in runs if r[1] - r[0] > 3]
    split = max(((runs[i + 1][0] - runs[i][1], (runs[i][1] + runs[i + 1][0]) // 2)
                 for i in range(len(runs) - 1)))[1]
    y = ankle
    while y > top and not m[y, max(0, split - 2):split + 3].any():
        y -= 1
    print('  [%3d,%4d],' % (split, y + 1))
print('];')
