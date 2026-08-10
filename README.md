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

Three character atlases drive the game — the gunman, your crew and the police — each
delivered as one free-layout render and cut by `tools/cut_atlas.py` (needs
pillow, numpy, scipy). Nothing is sliced — every pose is found as a connected
component, classified as figure, prop or effect, aligned on a common ground row
and written to one indexed sheet with a JSON manifest. Which cels form which
animation lives in `game.html` as data keyed on those indices, because the
sheets did not arrive one cycle per row and that mapping wants to be revisable
without re-cutting the art:

    python3 tools/cut_atlas.py <atlas.png> <name> assets/atlas

`assets/street.webp` is the night favela backdrop, WebP q90 (300 KB, down from a
2.2 MB PNG with no visible loss).
