# Art requests — BECO

What the game still needs, in the order it would help.

This is the companion to `sprite-prompts.md` in the art drop, which covered the
characters. That pack came through well: 102 player frames across 17
animations are in the game and working. What is missing is almost entirely
**environment** — the world the characters stand in.

---

## Why this list looks like this

Everything below is something the game currently fakes, drops, or does without.
Not a wishlist — a defect list.

**Drawn procedurally because no art exists.** These are hand-drawn in canvas
next to painted photographic facades, and the seam shows:

| In the game now | Drawn as |
|---|---|
| The lajes you climb on | Rectangles with brick courses, a concrete cap and rebar stubs |
| The street | A vertical gradient with procedural grit specks |
| The sky | A three-stop gradient |
| Medkit / ammo pickups | Coloured rectangles, ~22 px |
| End-of-street marker | A dashed green line |
| Bullet impacts | 2 px squares |

The lajes are the worst of it. They are the only thing the player physically
interacts with besides the ground, they are on screen constantly, and they are
the one element that looks drawn rather than painted.

**Dropped from the delivered pack.** `A16 CLIMB` has a concrete block painted
into all six frames — the character is climbing a specific prop rather than
climbing. Block 0 asked for exactly the opposite ("Draw only the character — no
ladder, no steps, no handrail, nothing to hold"), so it is unusable and the
game has no climb.

**Thin coverage.** The player has 17 animations. The police have 7, and one of
them is a single frame:

```
player  idle 4 · walk 8 · run 8 · crouch 4 · crouch_walk 6 · crouch_fire 6
        fire 8 · fire_up 6 · fire_down 6 · reload 8 · jump 6 · hit 4
        death 6 · roll 6 · melee 6 · throw 6 · victory 4
police  idle 4 · aim 6 · walk 8 · fire 5 · crouch 4 · crouch_fire 5 · dead 1
```

The police have no hit reaction and no death — they snap to a body frame the
instant they die. The player gets a six-frame fall; they get a cut. It reads as
cheap every single time, and it happens more than anything else in the game.

---

## Block P0 — the standing brief for props

Paste this above every prop request. It is the environment counterpart to
Block 0 in `sprite-prompts.md`, and it exists because three things in the last
delivery cost real pipeline work.

```text
You are producing prop art for a 2D side-scrolling game set in a Brazilian
favela. Match the existing art: painted, photographic-detail texture, hard
readable silhouette, lit from the upper left, worn and weathered — cracked
render, rust streaks, damp staining, sun-bleached paint.

SCALE LOCK — this is the most important rule:
- Draw everything at 180 pixels per metre.
- For reference, an adult man is 1.8 m, so 320 px tall. Do not deviate.
- State the real-world size you drew to in the same units I gave you.

VIEW: flat side elevation, seen straight on from the street, no perspective
convergence, no three-quarter view, no vanishing point. The camera is a long
way away with a long lens. Objects with depth (a vehicle, a staircase) may show
a shallow, consistent side view only.

GROUND LINE: whatever rests on the ground must sit with its base on the very
bottom row of the image. No empty margin under it.

OUTPUT FORMAT — hard requirements, not preferences:
- PNG with a real alpha channel (RGBA, 32-bit).
- Background 100% transparent: alpha = 0 on every pixel that is not the prop.
- DO NOT draw a transparency checkerboard. Do not paint grey and white squares
  to "represent" transparency. Real alpha only.
- DO NOT add a background of any kind: no colour, no gradient, no vignette, no
  glow, no halo, no haze, no scenery, no sky, no ground plane.
- DO NOT draw a drop shadow or a contact shadow. The game casts its own.
- No soft outer glow bleeding into the alpha. The silhouette edge must be
  crisp within 1-2 pixels.
- No text, no labels, no dimension lines, no borders, no watermark.

ONE PROP PER IMAGE unless the request says otherwise. If a request asks for a
set, put each item in its own file rather than arranging them on a sheet.
```

Three notes on why those rules are blunt, from what the last pack cost:

1. **A soft glow was baked into the alpha.** Every figure on every sheet was
   joined to its neighbours by a faint halo, so nothing could be separated
   until the alpha was thresholded and rescaled — which eats into the
   silhouette. Props are worse than characters here: a halo on a tileable
   ground piece shows as a seam.
2. **Frame labels were painted into one sheet**, in green with an opaque black
   outline that no colour test catches. It survived as a bar above the first
   frame of every row and had to be removed by growing the label mask through
   the connected dark pixels.
3. **Poses crossed cell boundaries**, so frames had to be located by searching
   for the cut lines that pass through the least ink, rather than by slicing on
   a grid.

None of this is hard to avoid at generation time, and all of it is expensive
afterwards.

---

# Tier 1 — fixes something visibly broken

## P1 · LAJE MODULES — 5 pieces

The single highest-value request. Unfinished concrete roof slabs on brick or
block walls: what you stand on, climb, and take cover behind.

```text
Five separate images, one per file: unfinished favela roof slabs (lajes).
Flat side elevation. Each is a concrete slab cap sitting on a wall of exposed
brick or grey block, with rebar stubs poking out of the top — the tell that
another floor was always coming.

  laje_a  2.0 m wide x 1.2 m tall   ( 360 x 216 px )  low, a single course
  laje_b  3.0 m wide x 2.0 m tall   ( 540 x 360 px )  waist height for cover
  laje_c  4.0 m wide x 3.0 m tall   ( 720 x 540 px )  a full storey
  laje_d  2.5 m wide x 4.0 m tall   ( 450 x 720 px )  tall and narrow
  laje_e  6.0 m wide x 2.4 m tall   (1080 x 432 px )  a long low run

The slab cap is 20-30 cm of grey concrete, slightly proud of the wall on both
sides, with a bright top edge and a dark shadow line under its lip. The wall
below is red-orange clay brick or grey concrete block, laid in visible courses,
part rendered and part bare. Vary the five: one fully rendered and painted a
faded colour, one bare brick, one half-rendered with the render falling off,
one stained with damp running down from the cap, one with a strip of ceramic
tile near the base.

The TOP SURFACE of the cap must be flat and level across the whole width —
the player walks on it. Nothing may stand proud of it except the rebar, which
should be thin enough to read as ignorable.

Left and right edges are cut flat and square, so pieces can butt against each
other.
```

## P2 · STAIRCASES — 4 pieces

The favela is vertical and the game currently is not. There are stair
references already in the drop under `REFERENCE/BUILDINGS/stairs/`.

```text
Four separate images, one per file: narrow favela concrete staircases, flat
side elevation, rising left-to-right.

  stair_short   1.5 m run x 1.2 m rise  ( 270 x 216 px )   ~5 steps
  stair_mid     2.5 m run x 2.0 m rise  ( 450 x 360 px )   ~9 steps
  stair_long    4.0 m run x 3.2 m rise  ( 720 x 576 px )  ~14 steps
  stair_turn    2.0 m run x 3.2 m rise  ( 360 x 576 px )  a switchback with a
                                                           half-landing

Rough poured concrete, no two steps quite the same height, edges chipped, a
painted line or a strip of tile on some treads. A thin steel pipe handrail on
the near side only, rusted, with at least one section bent or missing. Weeds
in the joints.

The step surfaces must read clearly as a staircase in silhouette alone — this
gets turned into a collision ramp, so the rise and run have to be consistent
and legible.
```

## P3 · STREET AND GROUND — 6 tileable pieces

```text
Six separate images, one per file. Horizontally tileable strips of favela
ground surface, flat top-down-ish side view as the game sees it (the ground
recedes only slightly).

Each is 4.0 m wide x 1.2 m tall ( 720 x 216 px ), and the LEFT AND RIGHT EDGES
MUST TILE SEAMLESSLY against themselves — the same strip repeated end to end
must show no visible seam. This is a hard requirement, not a preference.

  ground_concrete   cracked poured concrete, patched, oil-stained
  ground_cobble     old irregular paving stones, some missing
  ground_dirt       packed red-brown earth, ruts, puddles
  ground_broken     concrete breaking up into rubble and exposed earth
  ground_drain      concrete with an open drainage channel running along it
  ground_debris     concrete strewn with grit, litter and broken block

Unlike the props, these are FULLY OPAQUE across the whole image — no alpha
holes, no transparent edges. Top edge is where the character's feet rest.
```

## P4 · POLICE HIT AND DEATH — 2 sheets

Uses the original Block 0 from `sprite-prompts.md`, with the character lock
swapped to the police officer already delivered: grey-blue tactical uniform,
black beret, body armour, blue-and-yellow shoulder patch, black boots.

```text
Sheet 1: HIT REACTION, 3 frames, 1152 x 448.
Taking a bullet while standing. Plays once.
1. Impact — torso snapping back, head recoiling, rifle jolted in the grip.
2. Stagger — a half step back, shoulders hunched, head down.
3. Recovering — straightening back toward a normal stance.
No blood spray — the game draws its own.

Sheet 2: DEATH, 6 frames, 2304 x 448.
Shot and falling. Plays once and holds on the last frame.
1. Impact — body arching back, arms flying out, rifle leaving the hands.
2. Knees buckling, rifle dropping away.
3. Falling backward, body about 45 degrees, one hand reaching down.
4. Hitting the ground on the back and shoulder, rifle landing separately.
5. Settling — body flat, one knee up, head turned.
6. At rest — flat on the ground line, limbs slack, beret fallen off beside the
   head, rifle lying nearby.
Frames 4 to 6 lie ALONG the ground line, not standing on it. Frame 6 is what
the game leaves on screen, so make it read clearly as a body.
```

## P5 · CLIMB, REDRAWN — 1 sheet per character

The delivered `A16 CLIMB` has a concrete block painted into every frame.

```text
Re-deliver A16 CLIMB exactly as specified in Block 0 of sprite-prompts.md,
6 frames, 2304 x 448, with ONE correction:

Draw ONLY the character. No block, no wall, no ledge, no ladder, no steps, no
handrail, no surface of any kind. The character's hands close on empty air.
The game supplies whatever he is climbing.

Deliver this for the player and for the police officer.
```

## P6 · IMPACT FX — 4 short sheets

```text
Four separate sheets, one per file, laid out as one horizontal row of square
cells. State the cell size you used.

  fx_concrete  5 frames — a bullet striking concrete: a grey-white dust puff
               with chips flying out, expanding and thinning. ~0.5 m across.
  fx_metal     4 frames — a bullet striking metal: a hot orange spark burst
               with a short streak of sparks. ~0.4 m across.
  fx_dirt      5 frames — a bullet striking earth: a brown-grey spray, lower
               and wider than the concrete puff. ~0.6 m across.
  fx_pool      4 frames — a blood pool spreading on the ground, seen as the
               game sees the floor. Frame 1 small, frame 4 about 1.2 m across.
               This one does not animate in a loop; it is a growth sequence.

Transparent background, no ground plane, no shadow. These are drawn additively
over the scene, so keep the darks genuinely dark rather than grey.
```

---

# Tier 2 — depth and variety

## P7 · ALLEY CLUTTER — 12 props

The beco is currently empty between buildings. This set is what fills it.

```text
Twelve separate images, one per file. Flat side elevation, base on the bottom
row, transparent background.

  drum_rusted        0.6 x 0.9 m  (108 x 162)  oil drum, rust, dented
  drum_painted       0.6 x 0.9 m  (108 x 162)  drum used as a water butt
  botijao            0.35 x 0.55 m ( 63 x  99)  a P13 cooking gas cylinder
  crate_wood         0.8 x 0.6 m  (144 x 108)  slatted produce crate
  crate_stack        0.9 x 1.3 m  (162 x 234)  three crates stacked crooked
  tyres              1.2 x 0.7 m  (216 x 126)  a heap of bald car tyres
  bucket_pile        0.7 x 0.5 m  (126 x  90)  plastic buckets and basins
  bags_rubbish       1.2 x 0.8 m  (216 x 144)  split black rubbish bags
  blocks_stacked     1.0 x 0.8 m  (180 x 144)  concrete blocks on a pallet
  sacks_cement       0.9 x 0.6 m  (162 x 108)  cement sacks, one burst
  caixa_dagua        1.1 x 1.2 m  (198 x 216)  the blue rooftop water tank
  sandbags           1.5 x 0.9 m  (270 x 162)  a low sandbag barricade

Each should read instantly in silhouette. Anything the player could plausibly
stand on (crates, blocks, sandbags) needs a flat, level top.
```

## P8 · THE CAVEIRÃO — 1 prop

The armoured police truck. This is the set piece the last level wants.

```text
One image: a Brazilian military police armoured personnel carrier — the
"caveirão". Flat side elevation, seen from the left side.

6.5 m long x 3.0 m tall ( 1170 x 540 px ).

Boxy steel body on a truck chassis, matt grey-blue, heavy riveted plate, small
armoured gun slits along the flank, a roof hatch, a turret-like cupola, mesh
over the windscreen, spotlights, POLÍCIA MILITAR in white on the flank, a
skull-and-crossed-pistols emblem on the door. Chipped paint, road dirt up the
lower third, one headlight cracked.

Deliver a second version of the same vehicle: doors open, one tyre flat,
scorched along one flank, smoke damage — the wrecked state.
```

## P9 · VEHICLES — 3 props

```text
Three separate images, one per file. Flat side elevation, left side of the
vehicle, base on the bottom row.

  moto        2.0 x 1.2 m  (360 x 216)  a battered 125cc commuter motorbike,
                                        the workhorse of the morro, with a
                                        milk-crate strapped over the tail
  carro       4.2 x 1.5 m  (756 x 270)  a 1990s hatchback, sun-bleached, one
                                        door a different colour, no hubcaps
  carro_wreck 4.2 x 1.5 m  (756 x 270)  the same car burnt out: black shell,
                                        no glass, wheels gone, roof buckled
```

## P10 · POLES AND WIRING — 5 props

The tangled illegal power hookups (*gatos*) are the most recognisable thing in
a favela skyline and the game has none.

```text
Five separate images, one per file. Flat side elevation.

  poste          0.3 x 9.0 m  ( 54 x 1620)  concrete power pole, transformer
                                            drum near the top, a crossbar, and
                                            an enormous tangled knot of illegal
                                            cable hookups
  poste_lamp     0.3 x 8.0 m  ( 54 x 1440)  the same with a street lamp arm
  wires_span_a   6.0 x 1.5 m  (1080 x 270)  a horizontal span of drooping
                                            cables, thick bundle, tileable
                                            left-to-right
  wires_span_b   6.0 x 2.0 m  (1080 x 360)  a messier span, some cables cut
                                            and hanging down
  varal          3.0 x 2.0 m  (540 x 360)   a washing line strung across the
                                            alley, clothes and sheets hanging,
                                            colours faded

The spans and the washing line are drawn as FOREGROUND — the camera passes
behind them — so they need to read at low contrast without becoming mush.
```

## P11 · OPENINGS — 6 props

Drawn as separate pieces so a facade can be varied without redrawing it.

```text
Six separate images, one per file. Flat elevation, no wall around them — just
the opening and its frame, on transparent background.

  door_steel      1.0 x 2.1 m  (180 x 378)  a plain steel door, painted, dented
  door_wood       0.9 x 2.0 m  (162 x 360)  a warped wooden door, gap at the
                                            bottom, padlock hasp
  gate_grille     1.2 x 2.2 m  (216 x 396)  a welded steel security grille gate
  shutter_closed  2.5 x 2.4 m  (450 x 432)  a roll-down shop shutter, closed,
                                            covered in tags
  shutter_open    2.5 x 2.4 m  (450 x 432)  the same shutter rolled up, dark
                                            opening below
  window_barred   0.9 x 1.1 m  (162 x 198)  a small window with steel bars and
                                            a plant pot on the sill
```

## P12 · CIVILIANS — 3 sheets

A street with nothing on it but shooters reads as a shooting range. These are
non-combatants who scatter when the firing starts.

```text
Three characters, each following Block 0 of sprite-prompts.md exactly — same
384 x 448 cells, ground line y = 416, anchor column x = 160, 320 px standing
height, facing right, never mirrored.

  civ_woman   40s, flip-flops, shorts and a t-shirt, carrying a plastic basin
              of washing on her hip
  civ_boy     ~11, football shirt, shorts, barefoot, holding a kite
  civ_old_man 70s, thin, straw hat, shirt buttoned to the neck, walking stick

Each needs three sheets:
  IDLE   4 frames · 1536 x 448 — standing, small breathing loop
  WALK   6 frames · 2304 x 448 — unhurried
  FLEE   6 frames · 2304 x 448 — running away in a panic, head down, arms up,
         whatever they were carrying dropped

They carry no weapons and never take a firing pose.
```

## P13 · A SECOND ENEMY — 1 character

Every enemy in the game is currently the same officer. One more silhouette
doubles the perceived variety.

```text
A second police type, following Block 0 of sprite-prompts.md exactly.

CHARACTER LOCK: a shotgun officer. Same grey-blue uniform family as the
delivered officer so they read as the same force, but distinct in silhouette:
no beret — a black ballistic helmet with the visor up; a heavy vest with
shotgun shells in loops across the chest; a short pump-action shotgun instead
of a rifle; noticeably broader.

Sheets needed, all following the delivered conventions:
  IDLE 4 · WALK 8 · AIM 4 · FIRE 6 · HIT 3 · DEATH 6

The FIRE sheet must show the pump action working: fire, then the forend
cycling back and forward with a shell ejecting, then back to ready.
```

---

# Tier 3 — polish

## P14 · GRAFFITI AND SIGNAGE — 10 decals

```text
Ten separate images, one per file, on transparent background. These are
overlaid onto the building facades, so they must be flat-on, with no wall
texture of their own and no shadow — just the paint.

  tag_a / tag_b / tag_c    1.5-3.0 m wide  · São Paulo pixação: tall, narrow,
                           angular black letterforms, sprayed fast
  piece_a / piece_b        3.0-4.5 m wide  · a full colour graffiti piece
  mural_kids               2.5 m wide      · a naive painted mural of children
  sign_boteco              1.8 x 0.6 m     · a hand-painted bar sign, beer
                                             brand colours, "BAR DO ZÉ"
  sign_mercado             2.2 x 0.7 m     · a small grocery sign, "MERCADINHO"
  sign_lanchonete          1.6 x 0.5 m     · a snack bar sign, faded
  number_plate             0.4 x 0.3 m     · a hand-painted house number

Deliver the graffiti with slightly soft spray edges and visible overspray, and
the signs with hard painted edges and some paint loss.
```

## P15 · FIRE AND SMOKE — 3 sheets

```text
Three sheets, one horizontal row each, transparent background, no ground plane.

  fx_fire_loop     8 frames · a burning fire about 1.2 m tall, seamless loop,
                   orange-yellow core with dark smoke lifting off the top
  fx_molotov       6 frames · a bottle bursting into a spreading pool of
                   flame, plays once, ends about 2 m wide
  fx_smoke_column  6 frames · a thick black smoke column rising, seamless
                   loop, about 4 m tall

The delivered FX row already covers muzzle flashes, brass, blood splatter,
grenades and white smoke — these are the gaps.
```

## P16 · VEGETATION — 4 props

```text
Four separate images, one per file. Flat side elevation, base on the bottom row.

  banana_plant   1.8 x 2.4 m  (324 x 432)  a banana plant, leaves torn
  weeds_wall     1.2 x 0.5 m  (216 x  90)  weeds growing out of a wall joint,
                                           drawn to sit against a vertical face
  bush_scrub     1.5 x 1.2 m  (270 x 216)  dusty roadside scrub
  pot_plants     0.6 x 0.7 m  (108 x 126)  plants in cut-down paint tins
```

## P17 · IDENTITY AND HUD — 5 pieces

The game currently sets its own title in a system monospace font.

```text
  logo_beco        A wordmark for BECO. It should feel sprayed or stencilled on
                   a concrete wall rather than typeset — this is a game whose
                   HUD is monospace green on near-black, so the mark can be
                   rough, but it has to stay legible small. Deliver on
                   transparent background, about 1200 px wide.

  icon_health      \
  icon_ammo         >  three HUD icons, 64 x 64, flat, single-colour-friendly
  icon_grenade     /   silhouettes that read at 24 px

  hud_frame        A frame for the health and ammo readout, 480 x 120,
                   suggesting stencilled metal or taped card. Transparent
                   centre — the numbers are drawn by the game.
```

---

## Delivery order, if you only do some of it

1. **P1 lajes** and **P3 ground** — the two things that currently look drawn
   rather than painted, and they are on screen every second of play.
2. **P4 police hit and death** — the most-repeated moment in the game is
   currently its cheapest.
3. **P7 alley clutter** — cheap per item, and it is what makes the beco feel
   inhabited rather than empty.
4. **P2 stairs** — unlocks vertical level design, which the setting is asking
   for and the game does not yet do.

Everything after that is genuinely optional.
