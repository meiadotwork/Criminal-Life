#!/usr/bin/env python3
"""Cut the gunman's three cycles onto one shared grid.

    python3 tools/build_gunman_sheets.py fire.png walk.png crouch.png [assets/]

The sources are three separate renders — an eleven-pose firing sequence laid out
over two rows, a seven-frame walk, and a six-frame crouch-walk — each on a free
layout with the rifle, muzzle flash and ejected brass spilling past every pose.
Poses are separated by connected component rather than sliced, then re-laid on
one grid so a cel from any of the three can be swapped for another mid-stride
without the character jumping.

Two rules do the alignment, and they are different on purpose:

  * A planted pose is anchored on its own feet — that is the point it occupies
    on the ground, and holding it steady is what stops the figure drifting as
    the stance widens from idle to a straddle.
  * A cycle is anchored on the cap instead. Feet swing through a stride, so
    anchoring a walk on them would cancel the very motion the frames exist to
    show; the head barely translates. The cycle as a whole is then slid so its
    average foot position matches the planted poses, which is what keeps
    standing, walking and crouching on the same spot.

Vertically every frame of a cycle shares one baseline — the lowest pixel in the
whole cycle — so the natural bob survives instead of being flattened frame by
frame.

Needs pillow, numpy and scipy. Only re-run it if the art changes.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA = 40         # anything fainter is the render's glow, not the character
BODY_PX = 4000     # a pose's own area; anything smaller is brass or smoke
PAD = 6

fire_src, walk_src, crouch_src = sys.argv[1], sys.argv[2], sys.argv[3]
out_dir = sys.argv[4] if len(sys.argv) > 4 else 'assets'


def load(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.uint8)


def poses(rgba, rows=1):
    """Split a sheet into poses, in reading order, brass and smoke folded in."""
    solid = rgba[:, :, 3] > ALPHA
    lab, _ = ndimage.label(solid, structure=np.ones((3, 3)))
    parts = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        area = int((lab[sl] == i).sum())
        if area < 25:
            continue
        parts.append({'m': lab == i, 'x0': sl[1].start, 'x1': sl[1].stop,
                      'y0': sl[0].start, 'y1': sl[0].stop, 'a': area})
    body = [p for p in parts if p['a'] > BODY_PX]
    band = rgba.shape[0] / rows
    body.sort(key=lambda p: (int(p['y0'] // band), p['x0']))
    # Loose brass and powder smoke belong to the pose they sit over — matched on
    # x, and on y so a shell in the lower row cannot attach to the row above.
    for bit in (p for p in parts if p['a'] <= BODY_PX):
        cx, cy = (bit['x0'] + bit['x1']) / 2, (bit['y0'] + bit['y1']) / 2
        near = [p for p in body if p['x0'] - 30 <= cx <= p['x1'] + 30
                and p['y0'] - 90 <= cy <= p['y1'] + 30]
        if near:
            min(near, key=lambda p: abs(cx - (p['x0'] + p['x1']) / 2))['m'] |= bit['m']
    return body


def cap_x(rgba, mask):
    """Centre of the blue cap — the only strong blue anywhere on the sheets."""
    px = rgba[:, :, :3].astype(int)
    b, r = px[:, :, 2], px[:, :, 0]
    blue = mask & (b == px.max(2)) & (b - r > 28) & (b > 60)
    if blue.sum() < 200:
        return None
    return float(np.nonzero(blue.any(0))[0].mean())


def foot_x(mask):
    ys, xs = np.nonzero(mask)
    bot, top = ys.max(), ys.min()
    feet = ys > bot - 0.10 * (bot - top)
    return float(xs[feet].mean())


def place(rgba, body, cyclic):
    """Return (mask, dx, dy) per pose: how far to shift it onto the grid."""
    ground = max(int(np.nonzero(p['m'])[0].max()) for p in body)
    out = []
    for p in body:
        m = p['m']
        if cyclic:
            ax = cap_x(rgba, m)
            if ax is None:
                ax = foot_x(m)
            dy = -ground              # one baseline for the whole cycle
        else:
            ax = foot_x(m)
            dy = -int(np.nonzero(m)[0].max())
        out.append({'m': m, 'ax': ax, 'dy': dy})
    if cyclic:
        # slide the cycle bodily so its average footfall sits where the planted
        # poses stand — within the cycle nothing moves relative to anything else
        drift = np.mean([foot_x(o['m']) - o['ax'] for o in out])
        for o in out:
            o['ax'] += drift
    return out


fire_rgba, walk_rgba, crouch_rgba = load(fire_src), load(walk_src), load(crouch_src)
sheets = [
    ('gunman.png',        fire_rgba,   place(fire_rgba,   poses(fire_rgba, 2),   False)),
    ('gunman-walk.png',   walk_rgba,   place(walk_rgba,   poses(walk_rgba),      True)),
    ('gunman-crouch.png', crouch_rgba, place(crouch_rgba, poses(crouch_rgba),    True)),
]

# one cel size for all three, so any cel can stand in for any other
left = right = up = 0.0
for _, _, placed in sheets:
    for o in placed:
        ys, xs = np.nonzero(o['m'])
        left, right = min(left, xs.min() - o['ax']), max(right, xs.max() - o['ax'])
        up = min(up, ys.min() + o['dy'])
fw = int(round(right - left)) + 1 + 2 * PAD
fh = int(round(-up)) + 1 + 2 * PAD
anchor_x = int(round(-left)) + PAD
ground_row = fh - PAD - 1

os.makedirs(out_dir, exist_ok=True)
for name, rgba, placed in sheets:
    sheet = np.zeros((fh, fw * len(placed), 4), np.uint8)
    for k, o in enumerate(placed):
        ys, xs = np.nonzero(o['m'])
        sheet[np.round(ys + o['dy'] - up).astype(int) + PAD,
              np.round(xs - o['ax'] - left).astype(int) + PAD + k * fw] = rgba[ys, xs]
    # 64 colours is indistinguishable from the original here and cuts the file
    # to a fraction of its size
    img = Image.fromarray(sheet, 'RGBA').quantize(colors=64, method=Image.FASTOCTREE)
    path = os.path.join(out_dir, name)
    img.save(path, optimize=True)
    print('%-20s %2d cels  %5d KB' % (name, len(placed), os.path.getsize(path) // 1024))

ys0 = np.nonzero(sheets[0][2][0]['m'])[0]
stand = int(ys0.max() - ys0.min()) + 1
print('\nCEL %dx%d   ANCHOR_X=%d   GROUND_ROW=%d   STAND_PX=%d'
      % (fw, fh, anchor_x, ground_row, stand))
