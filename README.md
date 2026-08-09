# Criminal-Life
Crime game

## Pages

- `index.html` — CRIMINAL TERMINAL, the game.
- `gunman.html` — shooter sprite animation. A six-cel rig (idle → raise → aim →
  fire → recoil → idle) driven off `assets/gunman.png`, with single / 3-round
  burst / full-auto timelines, a muzzle-flash bloom, and gunfire synthesised at
  runtime through Web Audio — no sound files.

`assets/gunman.png` is cut from the original 6-pose render by
`tools/build_gunman_sheet.py` (needs pillow, numpy, scipy). It only has to be
re-run if the source art changes:

    python3 tools/build_gunman_sheet.py <source.png> assets/gunman.png
