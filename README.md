# Criminal-Life
Crime game

## Pages

- `index.html` — CRIMINAL TERMINAL, the board game.
- `game.html` — **BECO**, a wave shooter on the favela street. Rival crews walk
  in from both ends; you move, fire, reload and hold the line. Standing still
  gets you killed around wave 4, so the street is the mechanic. Rivals are the
  same sheet with only the cap and shorts hue-shifted — skin is left exactly as
  drawn — which reads at 50px because the cap is the one bit of solid colour up
  top. Landscape only: the picture fills the window at a whole-number pixel
  scale, with the readouts and thumb pads riding over it rather than stacked
  around it, and a phone held upright gets a rotate card instead of a squashed
  game. Keyboard on desktop, thumb pads on a phone.
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
