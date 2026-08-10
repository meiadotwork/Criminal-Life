# Sprite sheet commission pack — CRIMINAL TERMINAL

Everything an image-generation agent needs to turn one reference picture of the
gunman into a complete animation set for BECO.

**How to use it.** Attach the reference PNG. Paste **Block 0** — it is the
standing brief and goes at the top of *every* request. Then paste **one** sheet
block underneath it. One sheet per request; asking for several at once is where
consistency falls apart.

Work down the list in order. Tier 1 is what the game needs to stop reusing poses
it shouldn't. Tier 2 is what makes it feel finished.

---

## Why the rules in Block 0 are so blunt

Three things in the art delivered so far cost hours of pipeline work, and all
three are trivial to avoid at generation time. The brief hammers them because
generic "transparent background pixel art" prompts do not prevent any of them:

1. **A checkerboard drawn as actual pixels.** The first sheet arrived as flat
   RGB with the grey-and-white transparency pattern painted in. It had to be
   colour-keyed out, and a flood fill was needed so the white cap logo and the
   pale belt buckle survived the key.
2. **An opaque grey ground shadow.** It read as a light slab under the feet on
   any dark scene, and had to be un-composited back to semi-transparent black by
   inverting its luminance.
3. **A soft glow and vignette behind the figure**, baked into the alpha as a
   faint halo. It had to be thresholded away, which eats into the silhouette.

A fourth is tolerable but wasteful: **poses spilling across cell boundaries.**
Rifles and muzzle flashes ran into neighbouring cells, so poses have to be
separated by connected component rather than sliced on a grid.

What the pipeline genuinely cannot fix afterwards is **scale drift between
sheets** and **a baseline that wanders frame to frame**. Those two are the
difference between a character who walks and one who bobs like a cork. Guard
them above everything else.

---

## Block 0 — the standing brief

Paste this above every sheet request, with the reference image attached.

```text
You are producing sprite sheets for a 2D side-scrolling game. I have attached
one reference image of the character. Reproduce THAT EXACT CHARACTER in every
frame — same person, same gear, same art style, same palette.

CHARACTER LOCK — copy from the reference and never drift:
- Young man, brown skin, bare chest, barefoot.
- Blue baseball cap worn straight, with a small white curved mark on the side.
- Dark plum / purple knee-length shorts.
- A large pale bone-white belt buckle at the waist.
- A dark grey-black assault rifle, carried on a sling across the body.
Same skin tone, same cap blue, same shorts colour, same buckle, same rifle
silhouette, in every single frame of every sheet.

STYLE LOCK:
- Pixel art. Hard black outline around the whole figure.
- Flat cel shading, few tones per material. No airbrush gradients, no
  photographic rendering, no glossy highlights.
- Match the reference's line weight, pixel density and shading exactly.
- Lighting comes from the upper left in every frame.

OUTPUT FORMAT — hard requirements, not preferences:
- PNG with a real alpha channel (RGBA, 32-bit).
- The background must be 100% transparent: alpha = 0 on every pixel that is not
  the character.
- DO NOT draw a transparency checkerboard. Do not paint grey and white squares
  to "represent" transparency. Real alpha only.
- DO NOT add a background of any kind: no colour, no gradient, no vignette, no
  glow, no light halo, no smoke haze, no scenery, no ground plane.
- DO NOT draw a drop shadow or a ground shadow under the character. None at all.
  The game casts its own.
- DO NOT add motion blur, speed lines, onion-skin ghosts or trails.
- No text, no frame numbers, no labels, no borders, no grid lines, no watermark,
  no signature.
- No soft outer glow bleeding into the alpha. The silhouette edge must be crisp
  within 1-2 pixels.

LAYOUT — every sheet uses the same grid:
- One horizontal row, frames in play order, left to right.
- Cell size 384 wide x 448 tall. Sheet width = 384 x (number of frames).
  Sheet height = 448.
- Each frame stays inside its own cell. Nothing crosses into a neighbouring
  cell — if a rifle or muzzle flash would stick out, shorten the flash rather
  than let it overlap.
- GROUND LINE: y = 416 in every cell. The soles rest exactly on that line in
  every grounded frame. Do not let the baseline wander between frames; the only
  vertical movement is the body's natural bob, 0-6 px.
- ANCHOR COLUMN: x = 160 in every cell. The midpoint between the feet sits on
  that column.
- The character FACES RIGHT in every frame of every sheet. Never mirror him.
- SCALE LOCK: standing height, sole to top of cap, is exactly 320 px. It never
  changes between sheets. Head, cap, rifle and buckle stay the same size
  throughout.

CYCLE RULE: for looping animations, the last frame must flow back into the first
with no visible jump.

NAMING: gunman_<name>_<frames>.png — e.g. gunman_walk_8.png

FALLBACK: if you cannot reliably fit all frames into one image, deliver each
frame as its own 384x448 PNG with the same ground line, anchor column and scale,
named gunman_<name>_01.png, _02.png and so on. Consistency between frames
matters far more than packing them into one file.
```

---

# Tier 1 — the game needs these

## A1 · IDLE — 4 frames · 1536 × 448

```text
Sheet: IDLE, 4 frames, standing still, rifle held low across the body in both
hands, muzzle angled down-forward. A slow breathing loop.
1. Neutral stand, weight even, chest at rest.
2. Chest and shoulders rise ~3 px, head lifts a hair.
3. Peak of the breath, held; rifle hand shifts a fraction.
4. Settling back down toward frame 1.
Feet stay planted and identical in all four frames. Loops.
```

## A2 · WALK — 8 frames · 3072 × 448

```text
Sheet: WALK cycle, 8 frames, side view walking to the right, rifle carried
across the body in both hands, muzzle down-forward, alert but not aiming.
A standard 8-frame cycle:
1. Contact — right foot forward heel down, left foot back toes down.
2. Down — weight over the front leg, body at its lowest.
3. Pass — back leg swings through beside the standing leg, body at its highest.
4. Up — front leg pushes off, body rising.
5. Contact — mirrored: left foot forward, right foot back.
6. Down — mirrored.
7. Pass — mirrored.
8. Up — mirrored.
Arms and rifle sway slightly opposite the legs. Head stays level, bobbing no
more than 6 px. Loops cleanly from 8 back to 1.
```

## A3 · RUN — 8 frames · 3072 × 448

```text
Sheet: RUN cycle, 8 frames, side view running to the right, rifle gripped in
both hands close to the chest, body leaning forward about 15 degrees.
1. Contact — front foot striking, both knees bent.
2. Down — deepest compression, body lowest.
3. Push — driving off the back leg.
4. Flight — both feet off the ground, body highest, legs scissored.
5. Contact — mirrored, other foot striking.
6. Down — mirrored.
7. Push — mirrored.
8. Flight — mirrored.
Longer stride and more knee lift than the walk. Arms pump tighter. Loops.
```

## B1 · CROUCH IDLE — 4 frames · 1536 × 448

```text
Sheet: CROUCH IDLE, 4 frames, crouched low on the balls of both feet, knees
deeply bent, torso folded forward, rifle held ready across the front.
Overall height about 60% of standing. Feet on the ground line.
1. Settled crouch, neutral.
2. Breathing rise, ~2 px.
3. Peak.
4. Settling back.
Very small movement — this is a held, watchful pose. Loops.
```

## B2 · CROUCH WALK — 6 frames · 2304 × 448

```text
Sheet: CROUCH WALK (sneaking), 6 frames, moving right while staying low, knees
deeply bent, torso folded forward, rifle held ready.
Head height stays constant — no bobbing up and down; that is the point of
moving this way.
1. Right foot forward, weight back.
2. Weight transferring forward over the front foot.
3. Back foot lifting and swinging through low.
4. Left foot forward, weight back.
5. Weight transferring.
6. Back foot swinging through.
Loops cleanly from 6 back to 1.
```

## B3 · CROUCH FIRE — 4 frames · 1536 × 448

```text
Sheet: CROUCH FIRE, 4 frames, crouched low and firing straight forward to the
right. Same crouch height as the crouch idle sheet.
1. Settled crouch, rifle shouldered and level, sighting forward.
2. FIRING — bright yellow-white muzzle flash at the barrel tip, a short
   four-pointed star with a hot white core, about 90 px long. Keep the flash
   inside the cell.
3. FIRING — a differently shaped flash, slightly wider and shorter; a brass
   shell case ejecting up and to the right; the rifle kicked back a few px.
4. Recovery — no flash, thin grey smoke wisp at the muzzle, rifle settling
   back to level. A second shell case falling.
```

## C1 · AIM AND FIRE, FORWARD — 6 frames · 2304 × 448

```text
Sheet: AIM AND FIRE FORWARD, 6 frames, standing, firing horizontally to the
right. Feet in a braced stance, front foot forward, weight settled.
1. Rifle coming up toward the shoulder, eyes forward.
2. Shouldered and steady, sighting down the barrel, held.
3. FIRING — bright yellow-white muzzle flash, four-pointed star with a hot
   white core, about 110 px long, inside the cell.
4. FIRING — a differently shaped flash; brass ejecting up-right; the shoulder
   absorbing recoil, rifle kicked up a few degrees.
5. Recoil settling, no flash, thin grey smoke at the muzzle, brass falling.
6. Back to a steady shouldered aim, ready to repeat.
Frames 3 and 4 must differ clearly — they alternate during sustained fire.
```

## C2 · AIM AND FIRE, UP 45° — 6 frames · 2304 × 448

```text
Sheet: AIM AND FIRE UPWARD AT 45 DEGREES, 6 frames, standing, firing up and to
the right at 45 degrees. Rifle angled up 45 degrees, head tilted back, chest
opened, back arched slightly, front knee braced.
1. Rifle swinging up toward the 45 degree line, eyes following it.
2. Shouldered and steady at 45 degrees, sighting along the barrel, held.
3. FIRING — bright yellow-white muzzle flash, four-pointed star with a hot
   white core, about 110 px long, pointing up-right along the barrel line,
   inside the cell.
4. FIRING — a differently shaped flash, wider and shorter; brass ejecting up
   and to the right; recoil driving the shoulders down and back.
5. Recoil settling, no flash, thin grey smoke at the muzzle, brass falling.
6. Back to a steady 45 degree aim, ready to repeat.
Frames 3 and 4 must differ clearly — they alternate during sustained fire.
```

## C3 · AIM AND FIRE, DOWN 45° — 6 frames · 2304 × 448

```text
Sheet: AIM AND FIRE DOWNWARD AT 45 DEGREES, 6 frames, standing, firing down and
to the right at 45 degrees — shooting at something below, over a ledge. Rifle
angled down 45 degrees, head tipped down, shoulders rolled forward, knees
slightly bent.
1. Rifle swinging down toward the 45 degree line, head tipping to follow.
2. Shouldered and steady at minus 45 degrees, sighting along the barrel, held.
3. FIRING — bright yellow-white muzzle flash, four-pointed star with a hot
   white core, about 110 px long, pointing down-right along the barrel line,
   inside the cell.
4. FIRING — a differently shaped flash, wider and shorter; brass ejecting UP
   and to the right regardless of the barrel angle; recoil pushing the muzzle
   up a few degrees.
5. Recoil settling, no flash, thin grey smoke at the muzzle, brass falling.
6. Back to a steady downward aim, ready to repeat.
Frames 3 and 4 must differ clearly — they alternate during sustained fire.
```

## C4 · RELOAD — 8 frames · 3072 × 448

```text
Sheet: RELOAD, 8 frames, standing, swapping the rifle's magazine. Plays once,
does not loop.
1. Rifle lowered from the shoulder, angled down-forward, support hand moving to
   the magazine well.
2. Thumb hits the release; the spent magazine starts dropping free.
3. The spent magazine falls clear below the weapon, tilted.
4. Support hand reaching down and back toward the belt.
5. Bringing a fresh magazine up toward the well.
6. Seating the fresh magazine, a firm push upward.
7. Hand snapping back to the charging handle and pulling it.
8. Rifle coming back up toward the shoulder, ready.
Feet stay planted throughout — only the upper body works.
```

## D1 · JUMP — 7 frames · 2688 × 448

```text
Sheet: JUMP, 7 frames, jumping up and forward to the right, rifle held across
the chest in both hands. Plays once, does not loop.
1. Anticipation — knees bending into a crouch, arms dropping, still on the
   ground line.
2. Launch — legs extending explosively, toes still touching the ground line,
   body stretched upward.
3. Rise — feet clear of the ground, legs tucked slightly, body leaning forward.
4. Apex — legs tucked highest, body most compact, rifle pulled in tight.
5. Fall — legs beginning to reach down, body starting to straighten.
6. Landing — feet back on the ground line, knees deeply bent absorbing the
   impact, torso pitched forward.
7. Recovery — rising back to a normal standing posture.
Frames 3, 4 and 5 are airborne. Draw them with the feet ABOVE the ground line —
the character rises within his own cell — and keep the cell margins.
```

## E1 · HIT — 3 frames · 1152 × 448

```text
Sheet: HIT REACTION, 3 frames, taking a bullet from the right while standing.
Plays once.
1. Impact — torso snapping back and to the left, head recoiling, rifle jolted
   loose in the grip, one arm flung out.
2. Stagger — a half step back on the left foot, shoulders hunched, head down.
3. Recovering — straightening back up toward a normal stance, regaining grip.
No blood spray needed — the game draws its own impact particles.
```

## E2 · DEATH — 6 frames · 2304 × 448

```text
Sheet: DEATH, 6 frames, shot and falling to the ground, hit from the right.
Plays once and holds on the last frame.
1. Impact — body arching back, head snapping up, arms flying out, rifle
   beginning to leave the hands.
2. Legs buckling, knees collapsing, rifle dropping away.
3. Falling backward, body angled about 45 degrees, one hand reaching down.
4. Hitting the ground on the back and shoulder, legs folding under, rifle
   landing separately beside him.
5. Settling — body flat and mostly still, one knee up, head turned.
6. At rest — lying flat on the ground line, limbs slack, cap fallen off beside
   the head, rifle lying nearby.
Frames 4 to 6 lie ALONG the ground line, not standing on it. This is the frame
the game leaves on screen, so make frame 6 read clearly as a body.
```

---

# Tier 2 — what makes it feel finished

## A4 · WALK BACKWARD — 6 frames · 2304 × 448

```text
Sheet: WALK BACKWARD, 6 frames, still FACING RIGHT but stepping backward to the
left, rifle kept shouldered and pointed right — a fighting retreat. Steps are
shorter and more cautious than the forward walk, the head stays level, the
weight stays back.
1. Left foot reaching back, toes touching down behind, weight still forward.
2. Weight shifting back over the rear foot, front foot going light.
3. Front foot lifting and sliding back beneath the body.
4. Right foot reaching back, toes touching down behind.
5. Weight shifting back over it.
6. Front foot lifting and sliding back beneath the body.
Loops cleanly from 6 back to 1.
```

## C5 · AIM AND FIRE, STRAIGHT UP — 5 frames · 1920 × 448

```text
Sheet: AIM AND FIRE STRAIGHT UP, 5 frames, standing, firing vertically at
something overhead. Rifle near-vertical, head tipped fully back, spine arched,
both arms high.
1. Rifle swinging up to vertical.
2. Steady, sighting up.
3. FIRING — muzzle flash pointing straight up.
4. FIRING — different flash shape, brass ejecting to the right, recoil driving
   the shoulders down.
5. Recovery, smoke wisp, settling.
```

## D2 · AIR AIM AND FIRE — 4 frames · 1536 × 448

```text
Sheet: AIRBORNE FIRE, 4 frames, off the ground with the legs tucked as in the
jump apex, firing horizontally to the right. Feet ABOVE the ground line in all
four frames.
1. Airborne, rifle shouldered, sighting forward.
2. FIRING — muzzle flash forward, body rocked back by the recoil.
3. FIRING — different flash shape, brass ejecting, legs swinging slightly.
4. Airborne recovery, smoke wisp, rifle settling.
```

## E3 · ROLL — 6 frames · 2304 × 448

```text
Sheet: COMBAT ROLL, 6 frames, diving forward to the right and rolling through
it, rifle clutched to the chest. Plays once.
1. Dropping into a crouch, launching forward.
2. Leaving the ground, body tucking, shoulder leading.
3. Shoulder contact, body curled into a tight ball, upside down.
4. Rolling over the back, legs coming over the top.
5. Feet coming down, uncurling.
6. Rising out of it into a low crouch, rifle back to ready.
```

## E4 · MELEE — 5 frames · 1920 × 448

```text
Sheet: RIFLE BUTT STRIKE, 5 frames, close-quarters melee to the right. Plays
once.
1. Winding up — rifle pulled back and rotated, butt leading, weight on the back
   foot.
2. Stepping in, hips turning.
3. IMPACT — butt driven forward and slightly up at head height, arms extended,
   weight fully forward on the front foot.
4. Follow-through — rifle carried past the strike, body twisted.
5. Recovering to a ready stance.
```

## F1 · CLIMB — 6 frames · 2304 × 448

```text
Sheet: CLIMB, 6 frames, climbing a steep favela staircase or ladder, seen from
the side, moving up and to the right. Rifle slung across the back and out of
the hands so both hands are free.
Body angled about 60 degrees, one hand and the opposite foot reaching up
together, alternating.
1. Right hand high and gripping, left knee driving up.
2. Pulling up on the right arm, left foot planting.
3. Left hand releasing and reaching up past the right.
4. Left hand high and gripping, right knee driving up.
5. Pulling up on the left arm, right foot planting.
6. Right hand releasing and reaching up past the left.
Loops cleanly from 6 back to 1.
Draw only the character — no ladder, no steps, no handrail, nothing to hold.
```

## F2 · THROW — 5 frames · 1920 × 448

```text
Sheet: THROW, 5 frames, throwing a small object (a bottle or grenade)
overhand to the right. Rifle held down in the off hand throughout. Plays once.
1. Reaching to the belt for the object.
2. Winding up — throwing arm cocked back above the shoulder, weight on the back
   foot, object in hand.
3. Stepping forward, hips opening, arm starting forward.
4. RELEASE — arm extended forward and up, object leaving the hand and clearly
   separate from it, weight on the front foot.
5. Follow-through — arm swung down across the body, object gone from the frame.
```

## F3 · VICTORY — 4 frames · 1536 × 448

```text
Sheet: VICTORY, 4 frames, the street is clear. Standing tall, rifle raised in
one hand above the head, chin up, chest out.
1. Rifle starting to come up.
2. Rifle high overhead, arm fully extended.
3. Held, with a small triumphant rise onto the toes.
4. Settling back down, rifle still up.
Loops on frames 2-4 if held.
```

---

## Delivery checklist

Run these before accepting a sheet. Each catches a failure the pipeline cannot
repair on its own.

| Check | How | Why it matters |
| --- | --- | --- |
| Real alpha | Open it over a bright red layer. Any grey checkerboard, halo or box means it failed. | A baked-in background has to be colour-keyed, which eats the cap logo and the buckle. |
| No shadow | Nothing under the feet at all. | An opaque shadow reads as a light slab on a night street. |
| Scale lock | Overlay the new sheet on an accepted one. Cap and rifle must be the same size. | Nothing downstream can recover this — the character grows and shrinks as he acts. |
| Baseline | Feet land on the same row in every grounded frame. | A wandering baseline makes him bob like a cork. |
| Facing | Right, in every frame, every sheet. | The game mirrors him itself; a pre-mirrored frame flips twice. |
| Same character | Cap blue, skin tone, shorts, buckle, rifle unchanged. | Drift between sheets reads as a different person mid-move. |
| Cell discipline | Nothing crossing a cell boundary. | Overlap forces component separation instead of a clean slice. |
| Loop | For cycles, last frame flows into the first. | A hitch every cycle is very visible at walking speed. |

## When the sheets arrive

Hand them over as PNGs and they get cut and aligned by
`tools/build_gunman_sheets.py`, which separates poses by connected component,
anchors planted poses on their feet and cycles on the cap, and re-lays
everything on one shared grid. It currently takes three named sheets and needs
generalising to an arbitrary list — a small change, and worth doing once the
first new sheet lands rather than before.

Imperfect frame spacing is fine; the cutter finds the poses itself. Transparent
background, locked scale and a steady baseline are the three it cannot fix.
