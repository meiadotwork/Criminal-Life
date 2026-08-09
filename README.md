# Criminal-Life
Crime game

## Pages

- `index.html` — CRIMINAL TERMINAL, the game.
- `gunman.html` — shooter sprite animation. An eleven-cel rig driven off
  `assets/gunman.png`: he walks a scrolling street, fires on the move, and runs
  single / 3-round burst / full-auto timelines standing still. The walk is
  rigged at runtime — the source art is a front-on firing sequence with no walk
  cycle, so each cel is cut at the crotch and the two legs are squashed and slid
  out of phase to build the gait. Muzzle-flash bloom, recoil kick and all the
  gunfire are generated in the page; no sound files.

`assets/gunman.png` is cut from the original 6-pose render by
`tools/build_gunman_sheet.py` (needs pillow, numpy, scipy). It only has to be
re-run if the source art changes:

    python3 tools/build_gunman_sheet.py <source.png> assets/gunman.png
