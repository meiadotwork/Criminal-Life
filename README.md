# Criminal-Life

Two games in one repo.

## CRIMINAL TERMINAL — `index.html`

The original: a DOS-terminal crime board game. Single self-contained HTML file,
installable as a PWA. Open `index.html`.

## BECO — [`beco/`](beco/)

A 2D side-scrolling run-and-gun set in a favela, built from the sprite
commission pack (characters, 41 building facades, FX). Four alleys to hold,
keyboard / gamepad / touch.

Needs to be served over HTTP rather than opened directly, since it fetches its
sprite atlases:

```sh
cd beco && python3 -m http.server   # then http://localhost:8000
```

See [`beco/README.md`](beco/README.md) for controls and for how the art was
turned into the packed atlases the game loads.
