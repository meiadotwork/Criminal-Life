# BECO

A 2D side-scrolling run-and-gun set in a favela. You hold four alleys — *becos* —
against a police assault, moving right, using the lajes for height, and trying to
reach the end of each street still standing.

Play it by serving this folder and opening `index.html`:

```sh
cd beco && python3 -m http.server
# then http://localhost:8000
```

It has to be served over HTTP rather than opened as a `file://` — the sprite
atlases are fetched at boot. Once loaded it caches itself and runs offline.

## Controls

| | |
|---|---|
| Move | `A` / `D` or `←` `→` |
| Aim up / down | `W` / `S`, held while firing |
| Fire | `J`, `Z` or `Space` |
| Jump · Roll | `K` · `L` |
| Reload · Grenade | `R` · `G` |
| Run | `Shift` |
| Pause · Mute · Debug | `P` · `M` · `` ` `` |

Gamepad works (left stick or d-pad, `A` jump, `B` roll, `X` reload, right
trigger fire). On a touchscreen an on-screen pad appears the first time you
touch the canvas.

## What is here

```
index.html      page shell
game.js         the whole engine — no dependencies, canvas 2D
assets/         four packed atlases + frame tables (4.2 MB total)
tools/          the asset pipeline that produced assets/
```

The engine is one file on purpose: fixed-timestep simulation at 120 Hz, a
960×540 logical canvas letterboxed to whatever it is given, and no build step.
Audio is synthesised at runtime with WebAudio, because the art drop had no
sound in it.

## Assets

The art is a commission pack: character master atlases, 41 favela building
facades, and a row of FX sprites. `tools/build_assets.py` turns the ~250 MB of
1536×1024 masters into the four atlases the game loads. The source art is not
in the repo; the script is the record of how `assets/` was produced.

```sh
cd tools && python3 build_assets.py --src /path/to/art --out ../assets
```

Three things in the pipeline are worth knowing about, because they are what
made the art usable:

**The frames had to be found, not sliced.** The player atlas is a contact sheet
whose eight rows carry green labels naming each animation and its frame count.
The frames within a row sit on a uniform grid, but the poses spill past their
cells — rifles and muzzle flashes cross into the neighbour — so a plain
`span / n` division cuts figures in half. The pipeline instead searches for the
cell pitch whose cut lines pass through the least ink, with a penalty for
leaving dead space inside the group, and then keeps only the dominant connected
blob in each cell so nothing of the neighbouring pose survives the crop.

**Anchors come from the feet.** Every frame is stored tight-cropped with an
offset from the point between the character's soles, found as the horizontal
centre of the sprite's lowest few pixel rows. That is what keeps a walk cycle
from sliding, and it self-corrects when a group's measured span is a few pixels
off. The jump is the exception: its frames are pinned to their own soles, since
the arc comes from the simulation and using the artwork's lift as well would
launch him twice as high.

**Muzzles are measured, not guessed.** Everyone in the art faces right, so in a
firing pose the furthest-right inked column is the end of the barrel. The
pipeline records that offset per pose and the game spawns bullets, brass and
muzzle light from it. Frames with a flash already painted in are skipped when
measuring — they run wide, and including them puts the muzzle out at the tip of
the flame.

The delivered art also carried two artefacts the original commission brief had
explicitly asked against: a soft glow bleeding into the alpha, which connected
every figure on a sheet to its neighbours and had to be hardened away before
anything could be segmented, and baked-in frame labels on one sheet, whose
opaque black outline no colour test catches and which survived as a bar above
the first frame of each row until the label mask was grown through the
connected dark pixels.

The police sheet arrived unlabelled, with a looser layout and drawn about 1.4×
the player's scale. Its animations are hand-mapped by component index against a
numbered contact sheet, and each atlas records the character's standing height
so the renderer can size both to the same world height.
