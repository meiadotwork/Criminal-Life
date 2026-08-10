#!/usr/bin/env python3
"""Cut a free-layout sprite atlas into one indexed, aligned sheet.

    python3 tools/cut_atlas.py <atlas.png> <name> [out_dir]

The generated atlases do not arrive on a grid: poses sit wherever they landed,
at varying sizes, mixed in with scenery props and loose effects — blood, smoke,
brass, an explosion. So nothing is sliced. Every piece is found as a connected
component, classified, aligned and written into one sheet of uniform cels, and a
JSON manifest records what each cel index turned out to be.

Indexing everything rather than grouping it here is deliberate. Which pose
belongs to which animation, and in what order, is a judgement that wants to be
revisable without re-cutting the art, so it lives in the game as data keyed on
these indices.

Alignment follows the same split the rig already uses: a figure is anchored on
its feet and sits on the sheet's common ground row, so any cel can replace any
other without the character stepping sideways or sinking. Props and effects have
no feet, so they are centred in their cel and the manifest says so.

Needs pillow, numpy and scipy.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA = 180        # the renders carry a soft halo; this keeps the silhouette
MIN_AREA = 400     # smaller than this is stray speckle
PAD = 6

src, name = sys.argv[1], sys.argv[2]
out_dir = sys.argv[3] if len(sys.argv) > 3 else 'assets'

rgba = np.asarray(Image.open(src).convert('RGBA')).astype(np.uint8)
lab, _ = ndimage.label(rgba[:, :, 3] > ALPHA, structure=np.ones((3, 3)))

pieces = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    area = int((lab[sl] == i).sum())
    if area < MIN_AREA:
        continue
    pieces.append({'m': lab == i, 'x0': sl[1].start, 'x1': sl[1].stop,
                   'y0': sl[0].start, 'y1': sl[0].stop, 'a': area})
# reading order across the sheet: band by band, then left to right
pieces.sort(key=lambda p: (p['y0'] // 80, p['x0']))


def classify(p):
    """figure / prop / effect, from what the pixels are made of and how they sit.

    Skin alone does not identify a figure — the police are covered head to toe
    and show barely a face. Fill ratio does the heavy lifting instead: a person
    occupies about a third of their bounding box, a crate or a wall fills nearly
    all of theirs, and a puff of smoke or a pool of blood is soft and small.
    """
    px = rgba[:, :, :3][p['m']].astype(int)
    r, g, b = px[:, 0].astype(float), px[:, 1].astype(float), px[:, 2].astype(float)
    mx, mn = px.max(1), px.min(1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    blood = float(((r > 80) & (r > g * 1.9) & (r > b * 1.9)).mean())
    fire = float(((r > 200) & (g > 120) & (b < 130)).mean())
    grey = float((sat < 0.18).mean())
    w, h = p['x1'] - p['x0'], p['y1'] - p['y0']
    fill = p['a'] / float(max(1, w * h))
    # Shape is tested before colour, and that ordering matters. One character
    # wears red-white-blue striped shorts, so 44% of his body is red-dominant
    # and a colour-first test called whole figures blood pools. Nothing that
    # stands a head high with a person's fill ratio is a splatter.
    if h >= 60 and fill < 0.72:
        return 'figure'
    if blood > 0.40:
        return 'blood'
    if fire > 0.30:
        return 'muzzle'
    if h < 34 and grey > 0.7:
        return 'smoke'
    if fill > 0.80 and grey > 0.6:
        return 'prop'
    if h >= 45 and fill < 0.72:
        return 'figure'
    return 'other'


for p in pieces:
    p['kind'] = classify(p)


def foot_anchor(m):
    ys, xs = np.nonzero(m)
    bot, top = ys.max(), ys.min()
    feet = ys > bot - 0.10 * (bot - top)
    return float(xs[feet].mean()), int(bot)


# A figure stands on the ground; anything else just floats in the middle of its
# cel, because there is no meaningful place for a puff of smoke to put its feet.
for p in pieces:
    ys, xs = np.nonzero(p['m'])
    if p['kind'] == 'figure':
        ax, bot = foot_anchor(p['m'])
        p['ax'], p['ay'] = ax, bot
    else:
        p['ax'], p['ay'] = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2 + \
                           (ys.max() - ys.min()) / 2

left = right = up = down = 0.0
for p in pieces:
    ys, xs = np.nonzero(p['m'])
    left, right = min(left, xs.min() - p['ax']), max(right, xs.max() - p['ax'])
    up, down = min(up, ys.min() - p['ay']), max(down, ys.max() - p['ay'])
fw = int(round(right - left)) + 1 + 2 * PAD
fh = int(round(down - up)) + 1 + 2 * PAD
anchor_x = int(round(-left)) + PAD
ground_row = int(round(-up)) + PAD

sheet = np.zeros((fh, fw * len(pieces), 4), np.uint8)
cels = []
for k, p in enumerate(pieces):
    ys, xs = np.nonzero(p['m'])
    sheet[np.round(ys - p['ay'] - up).astype(int) + PAD,
          np.round(xs - p['ax'] - left).astype(int) + PAD + k * fw] = rgba[ys, xs]
    cels.append({'i': k, 'kind': p['kind'],
                 'w': int(xs.max() - xs.min()) + 1, 'h': int(ys.max() - ys.min()) + 1,
                 'src': [int(p['x0']), int(p['y0']), int(p['x1']), int(p['y1'])]})

os.makedirs(out_dir, exist_ok=True)
png = os.path.join(out_dir, name + '.png')
Image.fromarray(sheet, 'RGBA').quantize(colors=64, method=Image.FASTOCTREE) \
     .save(png, optimize=True)

figs = [c for c in cels if c['kind'] == 'figure']
stand = max((c['h'] for c in figs), default=0)
meta = {'cel': [fw, fh], 'count': len(cels), 'anchorX': anchor_x,
        'groundRow': ground_row, 'standPx': stand, 'cels': cels}
with open(os.path.join(out_dir, name + '.json'), 'w') as fh_:
    json.dump(meta, fh_, indent=1)

tally = {}
for c in cels:
    tally[c['kind']] = tally.get(c['kind'], 0) + 1
print('%s.png  %d cels of %dx%d  %d KB' % (name, len(cels), fw, fh,
                                           os.path.getsize(png) // 1024))
print('  anchorX=%d groundRow=%d tallestFigure=%d' % (anchor_x, ground_row, stand))
print('  ' + '  '.join('%s:%d' % kv for kv in sorted(tally.items())))
