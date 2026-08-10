# Criminal-Life
Crime game

## Pages

- `index.html` — CRIMINAL TERMINAL, the board game.
- `game.html` — **BECO**, a wave shooter on the favela street. Rival crews walk
  in from both ends; you move, duck, fire, reload and hold the line. Crouching
  cuts incoming fire to about a third, because a round aimed at a standing chest
  sails clean over — but there is no crouched firing pose, so squeezing the
  trigger stands you up. Standing still gets you killed around wave 4, so the
  street is the mechanic. Rivals are the same sheets with only the cap and
  shorts hue-shifted — skin is left exactly as drawn. Landscape only: the
  picture fills the window at a whole-number pixel scale, with the readouts and
  thumb pads riding over it, and a phone held upright gets a rotate card.
  Keyboard on desktop, thumb pads on a phone.

The three sprite sheets — eleven planted firing poses, a seven-frame walk and a
six-frame crouch-walk — are cut onto one shared grid by
`tools/build_gunman_sheets.py` (needs pillow, numpy, scipy), so a cel from any
cycle can replace a cel from another mid-stride without the character stepping
sideways. Planted poses are anchored on their own feet; a cycle is anchored on
the cap instead, since feet swing through a stride, and the cycle is then slid
so its average footfall matches the planted poses. Only re-run it if the art
changes:

    python3 tools/build_gunman_sheets.py fire.png walk.png crouch.png assets/

`assets/street.webp` is the night favela backdrop, WebP q90 (300 KB, down from a
2.2 MB PNG with no visible loss).
