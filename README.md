# Criminal-Life
Crime game

## Pages

- `index.html` — CRIMINAL TERMINAL, the game.
- `gunman.html` — shooter sprite animation. An eleven-cel rig walking the
  favela: he paces the street, fires on the move, and runs single / 3-round
  burst / full-auto timelines standing still. He is drawn at one fixed size in
  background pixels — about 50px, worked out from the parked car at roughly 29
  pixels to the metre — so the CLOSE / STREET / WIDE buttons move the camera
  without ever resizing him. The walk is rigged at runtime: the source art is a
  front-on firing sequence with no walk cycle, so each cel is cut at the crotch
  and the two legs are squashed and slid out of phase. His feet follow a ground
  curve read off the art, since the street climbs the hill. Muzzle-flash bloom,
  recoil kick and all the gunfire are generated in the page; no sound files.

`assets/gunman.png` is cut from the original 11-pose render by
`tools/build_gunman_sheet.py` (needs pillow, numpy, scipy). It only has to be
re-run if the source art changes:

    python3 tools/build_gunman_sheet.py <source.png> assets/gunman.png

`assets/street.webp` is the night favela backdrop, WebP q90 (300 KB, down from a
2.2 MB PNG with no visible loss).
