#!/usr/bin/env python3
"""
BECO asset pipeline.

Turns the raw commission art (the Dropbox drop: character master atlases,
favela building facades, FX row) into the handful of packed atlases the game
actually loads.

    python3 build_assets.py --src /path/to/dropbox/export --out ../assets

The source art is not in the repo -- it is ~250 MB of 1536x1024 masters. This
script is the record of how ../assets was produced, and re-running it against
the same drop reproduces them byte-for-byte-ish.
"""
import argparse, json, math, os, sys
from PIL import Image
import numpy as np
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

# ---------------------------------------------------------------- utilities

def load_clean(path, halo_lo=40, halo_hi=170):
    """Load RGBA, drop the baked-in green sheet labels, harden the alpha halo.

    The delivered art carries two artefacts the brief tried to prevent: a soft
    glow bleeding into the alpha, and (on one sheet) green frame labels drawn
    into the image. Both have to go before anything can be segmented, because
    the halo connects every figure to its neighbours.
    """
    im = Image.open(path).convert("RGBA")
    A = np.array(im).astype(np.int16)
    r, g, b, a = A[:, :, 0], A[:, :, 1], A[:, :, 2], A[:, :, 3]
    label = (a > 100) & (g > 150) & (g - r > 60) & (g - b > 50)
    if label.any():
        # The green glyphs sit on an opaque black outline that no colour test
        # catches, and it survives as a bar above the first frame of each row.
        # Grow the green seed through connected dark pixels, but only inside
        # the label's own band so the growth cannot walk into a rifle or a cap.
        dark = (a > 50) & (np.maximum(np.maximum(r, g), b) < 80)
        allowed = label | dark
        band = np.zeros_like(label)
        for y0, y1 in label_bands(label):
            band[max(0, y0 - 3):y1 + 4] = True
        grown = ndimage.binary_propagation(label, mask=allowed & band)
        label = ndimage.binary_dilation(grown | label, np.ones((5, 5)))
        A[label] = 0
    a = A[:, :, 3].astype(np.float32)
    A[:, :, 3] = np.clip((a - halo_lo) * (255.0 / (halo_hi - halo_lo)), 0, 255).astype(np.int16)
    return Image.fromarray(A.astype(np.uint8), "RGBA"), label


def label_bands(label, gap=6):
    ys = np.where(label.any(axis=1))[0]
    if len(ys) == 0:
        return []
    out, s, p = [], ys[0], ys[0]
    for y in ys[1:]:
        if y - p > gap:
            out.append((int(s), int(p) + 1))
            s = y
        p = y
    out.append((int(s), int(p) + 1))
    return out


def label_x_starts(label, y0, y1, gap=25):
    xs = np.where(label[y0:y1].any(axis=0))[0]
    if len(xs) == 0:
        return []
    out, s, p = [], xs[0], xs[0]
    for x in xs[1:]:
        if x - p > gap:
            out.append(int(s))
            s = x
        p = x
    out.append(int(s))
    return out


def tight(mask, x0, y0, x1, y1):
    sub = mask[y0:y1, x0:x1]
    if not sub.any():
        return None
    ys = np.where(sub.any(axis=1))[0]
    xs = np.where(sub.any(axis=0))[0]
    return (x0 + int(xs[0]), y0 + int(ys[0]), x0 + int(xs[-1]) + 1, y0 + int(ys[-1]) + 1)


def dominant(mask, x0, y0, x1, y1, join=26):
    """The one figure in this cell, as a boolean mask the size of the cell.

    Cutting a row into equal cells slices through whatever the neighbouring
    pose leaned into this cell -- a trailing foot, a rifle barrel. Keep the
    largest connected blob and anything close enough to belong to it (a muzzle
    flash that broke away from the barrel), and drop the rest.
    """
    sub = mask[y0:y1, x0:x1]
    if not sub.any():
        return None, None
    lab, n = ndimage.label(sub, structure=np.ones((3, 3)))
    if n == 0:
        return None, None
    areas = ndimage.sum(sub, lab, range(1, n + 1))
    main = int(np.argmax(areas)) + 1
    keep = lab == main
    mxs = np.where(keep.any(axis=0))[0]
    mlo, mhi = mxs[0], mxs[-1]
    for i in range(1, n + 1):
        if i == main or areas[i - 1] < 40:
            continue
        comp = lab == i
        cxs = np.where(comp.any(axis=0))[0]
        # near the main blob horizontally -> part of this pose, not the next one
        if cxs[0] - mhi <= join and mlo - cxs[-1] <= join:
            keep |= comp
    ys = np.where(keep.any(axis=1))[0]
    xs = np.where(keep.any(axis=0))[0]
    box = (x0 + int(xs[0]), y0 + int(ys[0]), x0 + int(xs[-1]) + 1, y0 + int(ys[-1]) + 1)
    return box, keep[int(ys[0]):int(ys[-1]) + 1, int(xs[0]):int(xs[-1]) + 1]


def feet_anchor(sub, box, rows=10):
    """Horizontal centre of the lowest few pixel rows -- i.e. where he stands.

    More reliable than the nominal anchor column: it self-corrects when a
    group's x-range is a few pixels off, and it is what the renderer actually
    needs to keep a walk cycle from sliding.
    """
    h = sub.shape[0]
    band = sub[max(0, h - rows):]
    xs = np.where(band.any(axis=0))[0]
    if len(xs) == 0:
        return (box[0] + box[2]) / 2.0
    weights = band.sum(axis=0).astype(np.float64)
    return box[0] + float((np.arange(len(weights)) * weights).sum() / weights.sum())


# ------------------------------------------------------- player (labelled atlas)

# The player master atlas carries its own contents list: eight rows of green
# labels, each naming the groups on that row and their frame count. Group x
# origins come from the label positions; a couple of rows need an explicit
# span because an unlabelled extra (a grenade arc, a climb prop) sits between
# two labelled groups and would otherwise be divided into the wrong cells.
# Each entry is (name, frame_count, forced_start, forced_limit). A start is
# needed where an unlabelled extra sits between two groups (the grenade arc on
# the throw row) or where the previous group's trailing foot would otherwise be
# mistaken for the next group's first frame. A limit keeps a sparse animation
# from stretching its cells over the neighbour.
PLAYER_ROWS = [
    [("idle", 4, None, None), ("walk", 8, None, None), ("run", 8, 866, None)],
    [("crouch", 4, None, None), ("crouch_walk", 6, 324, None), ("crouch_fire", 6, 835, None)],
    [("fire", 8, None, 621), ("fire_up", 6, 623, None), ("fire_down", 6, 1077, None)],
    [("reload", 8, None, 600), ("jump", 6, 621, None), ("hit", 4, 1082, None)],
    [("death", 6, None, 700), ("roll", 6, 749, None)],
    [("melee", 6, None, 660)],          # CLIMB follows on this row but has a
                                        # concrete prop painted in -- dropped
    [("throw", 6, None, 570), ("victory", 4, 905, 1260)],
]


def next_ink(proj, x, limit):
    x = max(0, int(x))
    while x < limit and proj[x] <= 0:
        x += 1
    return x


def fit_pitch(proj, left, n, limit, lo=45.0, hi=150.0, empty_w=2.5):
    """Pick the cell pitch whose cut lines pass through the least ink, while
    keeping the group's span tight around actual content.

    Poses spill past their cell -- rifles and muzzle flashes cross into the
    neighbour -- so a fixed span/n division slices figures in half. Searching
    the pitch and scoring the cut columns puts each cut in the thinnest place.
    The emptiness term matters just as much: without it a sparse animation
    (four crouches with air between them) happily fits a pitch twice too wide,
    because every cut then lands in a gap and scores zero.
    """
    best = None
    hi = min(hi, (limit - left) / n)
    if hi <= lo:
        lo, hi = hi * 0.6, max(hi, lo)
    for p in np.arange(lo, hi + 1e-9, 0.25):
        end = left + n * p
        if end > limit + 4:
            continue
        cut_ink = 0.0
        for k in range(1, n + 1):
            xi = int(round(left + k * p))
            cut_ink += proj[max(0, xi - 1):xi + 2].sum()
        seg = proj[int(round(left)):int(round(end))]
        score = cut_ink + empty_w * int((seg <= 0).sum())
        if best is None or score < best[0]:
            best = (score, p)
    return best[1] if best else (limit - left) / n


def cut_player(path):
    im, label = load_clean(path)
    W, H = im.size
    alpha = np.array(im)[:, :, 3]
    mask = alpha > 70
    bands = label_bands(label)
    if len(bands) != len(PLAYER_ROWS) + 1 and len(bands) != len(PLAYER_ROWS):
        print(f"  warn: {len(bands)} label bands for {len(PLAYER_ROWS)} rows", file=sys.stderr)
    tops = [b[1] for b in bands]
    bots = [b[0] - 2 for b in bands[1:]] + [H]

    anims = {}
    for ri, groups in enumerate(PLAYER_ROWS):
        y0, y1 = tops[ri], bots[ri]
        proj = mask[y0:y1].sum(axis=0).astype(np.float64)
        left = next_ink(proj, 0, W)
        for gi, (name, n, forced_start, forced_limit) in enumerate(groups):
            if forced_start is not None:
                left = next_ink(proj, forced_start, W)
            limit = forced_limit
            if limit is None:
                nxt = next((g[2] for g in groups[gi + 1:] if g[2] is not None), None)
                limit = nxt if nxt is not None else W
            pitch = fit_pitch(proj, left, n, limit)
            frames = []
            for k in range(n):
                cx0 = int(round(left + k * pitch))
                cx1 = int(round(left + (k + 1) * pitch))
                box, sub = dominant(mask, cx0, y0, cx1, y1)
                if box is None or (box[2] - box[0]) * (box[3] - box[1]) < 600:
                    continue
                frames.append({"box": box, "ax": feet_anchor(sub, box), "sub": sub})
            if frames:
                anims[name] = frames
            left = next_ink(proj, int(round(left + n * pitch)) + 1, W)
    return im, anims


# ------------------------------------------- police / fx (unlabelled atlas)

def cut_components(path, min_area=500, athresh=70, row_tol=75):
    """Segment an unlabelled sheet into figures by connected component."""
    im, _ = load_clean(path)
    alpha = np.array(im)[:, :, 3]
    m = alpha > athresh
    lab, _n = ndimage.label(m, structure=np.ones((3, 3)))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        if (lab[sl] == i + 1).sum() < min_area:
            continue
        boxes.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
    boxes.sort(key=lambda b: b[3])
    rows, cur, base = [], [boxes[0]], boxes[0][3]
    for b in boxes[1:]:
        if b[3] - base <= row_tol:
            cur.append(b)
        else:
            rows.append(cur)
            cur, base = [b], b[3]
    rows.append(cur)
    ordered = []
    for r in rows:
        r.sort(key=lambda b: b[0])
        ordered.extend(r)
    return im, ordered, m


# Hand-mapped from the indexed component dump of the police master atlas.
# The police sheet came with no labels and a looser layout than the player's,
# so these ranges were read off a numbered contact sheet.
POLICE_ANIMS = {
    "idle":   [0, 1, 2, 3],
    "aim":    [6, 7, 8, 9, 10, 11],
    "walk":   [12, 13, 14, 15, 16, 17, 18, 19],
    "fire":   [36, 37, 38, 39, 40],
    "crouch": [24, 25, 26, 27],
    "crouch_fire": [30, 31, 32, 33, 34],
    "dead":   [64],
}

# FX picked out of the player atlas's bottom row plus the police sheet.
PLAYER_FX_ROW = 7


def cut_player_fx(path):
    im, label = load_clean(path)
    alpha = np.array(im)[:, :, 3]
    m = alpha > 70
    bands = label_bands(label)
    y0 = bands[PLAYER_FX_ROW][1]
    y1 = im.size[1]
    lab, _ = ndimage.label(m[y0:y1], structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        if (lab[sl] == i + 1).sum() < 120:
            continue
        out.append([sl[1].start, y0 + sl[0].start, sl[1].stop, y0 + sl[0].stop])
    out.sort(key=lambda b: b[0])
    return im, out


# ------------------------------------------------------------------ packing

def pack(entries, padding=2, max_width=2048):
    """Shelf-pack (w,h) entries. Returns (W, H, [(x, y), ...])."""
    order = sorted(range(len(entries)), key=lambda i: -entries[i][1])
    places = [None] * len(entries)
    x = y = shelf_h = 0
    W = 0
    for i in order:
        w, h = entries[i]
        if x + w + padding > max_width:
            x = 0
            y += shelf_h + padding
            shelf_h = 0
        places[i] = (x, y)
        x += w + padding
        shelf_h = max(shelf_h, h)
        W = max(W, x)
    H = y + shelf_h
    return W, H, places


def emit_atlas(im, groups, out_png, out_json, scale=1.0, quality=None, unit_from=None,
               muzzles=None):
    """groups: {anim: [ {box, ax, ay} ]} -> packed sheet + frame table."""
    flat = []
    for anim, frames in groups.items():
        for fi, f in enumerate(frames):
            flat.append((anim, fi, f))
    crops, sizes = [], []
    for _a, _i, f in flat:
        c = im.crop(f["box"])
        sub = f.get("sub")
        if sub is not None:
            # zero everything that is not this pose (neighbour bleed)
            arr = np.array(c)
            arr[:, :, 3] = np.where(sub, arr[:, :, 3], 0)
            c = Image.fromarray(arr, "RGBA")
        if scale != 1.0:
            c = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.LANCZOS)
        crops.append(c)
        sizes.append((c.width, c.height))
    W, H, places = pack(sizes)
    sheet = Image.new("RGBA", (max(W, 1), max(H, 1)), (0, 0, 0, 0))
    table = {}
    for (anim, fi, f), c, (px, py) in zip(flat, crops, places):
        sheet.alpha_composite(c, (px, py))
        table.setdefault(anim, []).append({
            "x": px, "y": py, "w": c.width, "h": c.height,
            # offset of this frame's top-left from the character's anchor
            # (feet centre) -- what the renderer adds to the world position
            "dx": round((f["box"][0] - f["ax"]) * scale, 2),
            "dy": round((f["box"][1] - f["ay"]) * scale, 2),
        })
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    if out_png.endswith(".webp"):
        sheet.save(out_png, quality=quality or 88, method=6)
    else:
        sheet.save(out_png, optimize=True)
    meta = {"image": os.path.basename(out_png),
            "size": [sheet.width, sheet.height],
            "anims": table}
    if muzzles:
        meta["muzzle"] = {k: [round(v[0] * scale, 1), round(v[1] * scale, 1)]
                          for k, v in muzzles.items()}
    if unit_from and unit_from in table:
        # Standing height in atlas pixels. The two character sheets were drawn
        # at different scales -- the police run about 1.4x the player -- so the
        # renderer sizes everyone off this instead of trusting raw pixels.
        meta["unit"] = max(f["h"] for f in table[unit_from])
    with open(out_json, "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    kb = os.path.getsize(out_png) / 1024
    print(f"  {os.path.basename(out_png):22s} {sheet.width}x{sheet.height}  {kb:7.1f} KB  "
          f"{sum(len(v) for v in table.values())} frames")
    return table


# Animations whose height comes from the simulation, not the artwork. The jump
# sheet draws the airborne frames lifted inside their cell; keeping that lift
# would add to the physics arc and launch him twice as high, so each frame is
# pinned to its own soles instead.
PHYSICS_DRIVEN = {"jump"}


def muzzle_offsets(anims, names):
    """Where each firing pose's barrel tip sits, relative to the feet anchor.

    Everyone in this art faces right, and in a firing pose the furthest-right
    thing on the sprite is the end of the barrel. So the rightmost inked column
    gives x, and the vertical centre of that column gives y -- which stays
    correct for the angled poses, where the tip is also the lowest or highest
    point. Reading it off the art beats hand-tuned constants: the game spawns
    its flash, its brass and its bullets here, and twenty pixels out is a
    muzzle flash floating in front of the character's chest.

    Frames whose flash is already painted in are skipped -- they run far wider
    than the rest of the cycle, and measuring them puts the muzzle out at the
    tip of the flame instead of the end of the barrel. Of what remains, the
    75th percentile rather than the max: recoil frames pull the rifle back.
    """
    out = {}
    for name in names:
        frames = [f for f in anims.get(name, []) if f.get("sub") is not None]
        if not frames:
            continue
        widths = [f["box"][2] - f["box"][0] for f in frames]
        cut = np.median(widths) * 1.12
        lean = [f for f, w in zip(frames, widths) if w <= cut] or frames
        xs_, ys_ = [], []
        for f in lean:
            sub = f["sub"]
            cols = np.where(sub.any(axis=0))[0]
            rx = int(cols[-1])
            band = np.where(sub[:, max(0, rx - 2):rx + 1].any(axis=1))[0]
            xs_.append(f["box"][0] + rx - f["ax"])
            ys_.append(f["box"][1] + float(band.mean()) - f["ay"])
        out[name] = [round(float(np.percentile(xs_, 75)), 1),
                     round(float(np.median(ys_)), 1)]
    return out


def add_anchors(anims):
    """Fill in each frame's anchor y -- the animation's ground line.

    Median rather than max: one frame picked up from the wrong atlas row would
    otherwise define the floor and leave the whole animation hovering.
    """
    for name, frames in anims.items():
        ground = float(np.median([f["box"][3] for f in frames]))
        for f in frames:
            f["ay"] = f["box"][3] if name in PHYSICS_DRIVEN else ground
    return anims


# ---------------------------------------------------------------- buildings

def build_buildings(src, out_dir, target_h=520, quality=84):
    d = os.path.join(src, "Props", "buildings")
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(".png"))
    entries = []
    crops = []
    for f in files:
        im, _ = load_clean(os.path.join(d, f), halo_lo=30, halo_hi=140)
        a = np.array(im)[:, :, 3]
        m = a > 40
        if not m.any():
            continue
        box = tight(m, 0, 0, im.width, im.height)
        c = im.crop(box)
        s = min(1.0, target_h / c.height)
        if s < 1.0:
            c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
        crops.append(c)
        entries.append((c.width, c.height))
    W, H, places = pack(entries, padding=2, max_width=4096)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    table = []
    for c, (px, py) in zip(crops, places):
        sheet.alpha_composite(c, (px, py))
        table.append({"x": px, "y": py, "w": c.width, "h": c.height})
    png = os.path.join(out_dir, "buildings.webp")
    sheet.save(png, quality=quality, method=6)
    with open(os.path.join(out_dir, "buildings.json"), "w") as fh:
        json.dump({"image": "buildings.webp", "size": [W, H], "frames": table},
                  fh, separators=(",", ":"))
    print(f"  {'buildings.webp':22s} {W}x{H}  {os.path.getsize(png)/1024:7.1f} KB  {len(table)} facades")


# -------------------------------------------------------------------- main

PLAYER_ATLAS = "Props/Photo Aug 10 2026, 2 31 15 PM.png"
POLICE_ATLAS = "Props/Photo Aug 10 2026, 2 31 15 PM (2).png"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="root of the extracted art drop")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "assets"))
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--skip-buildings", action="store_true")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    print("player:")
    pim, panims = cut_player(os.path.join(args.src, PLAYER_ATLAS))
    add_anchors(panims)
    pmuz = muzzle_offsets(panims, ["fire", "fire_up", "fire_down", "crouch_fire"])
    emit_atlas(pim, panims, os.path.join(out, "player.png"), os.path.join(out, "player.json"),
               args.scale, unit_from="idle", muzzles=pmuz)
    print("  muzzles:", pmuz)

    print("fx:")
    fim, fxboxes = cut_player_fx(os.path.join(args.src, PLAYER_ATLAS))
    # The FX row runs muzzle flashes, brass, blood, grenades, smoke -- left to
    # right, in that order, under their own labels.
    fx = {"muzzle": [], "casing": [], "blood": [], "grenade": [], "smoke": []}
    for b in fxboxes:
        kind = ("muzzle" if b[0] < 410 else
                "casing" if b[0] < 690 else
                "blood" if b[0] < 990 else
                "grenade" if b[0] < 1225 else
                "smoke")
        fx[kind].append({"box": b, "ax": (b[0] + b[2]) / 2, "ay": (b[1] + b[3]) / 2})
    fx = {k: v for k, v in fx.items() if v}
    emit_atlas(fim, fx, os.path.join(out, "fx.png"), os.path.join(out, "fx.json"), args.scale)

    print("police:")
    oim, boxes, omask = cut_components(os.path.join(args.src, POLICE_ATLAS))
    panims2 = {}
    for name, idxs in POLICE_ANIMS.items():
        fr = []
        for i in idxs:
            if i >= len(boxes):
                continue
            b = boxes[i]
            sub = omask[b[1]:b[3], b[0]:b[2]]
            fr.append({"box": tuple(b), "ax": feet_anchor(sub, b), "sub": sub})
        if fr:
            panims2[name] = fr
    add_anchors(panims2)
    omuz = muzzle_offsets(panims2, ["fire", "crouch_fire"])
    emit_atlas(oim, panims2, os.path.join(out, "police.png"), os.path.join(out, "police.json"),
               args.scale, unit_from="idle", muzzles=omuz)
    print("  muzzles:", omuz)

    if not args.skip_buildings:
        print("buildings:")
        build_buildings(args.src, out)

    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f"\ntotal assets: {total/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
