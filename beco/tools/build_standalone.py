#!/usr/bin/env python3
"""
Bake BECO into a single self-contained HTML file.

The normal build fetches its atlases over HTTP, which means the game needs a
web server and cannot be opened as a file:// page or dropped somewhere with a
strict content policy. This inlines the engine and every asset as data URIs so
the result is one file that runs anywhere.

    python3 build_standalone.py            # -> ../beco-standalone.html

Costs about a third in size: base64 inflates 4:3, so ~4.2 MB of atlases become
~5.7 MB of text.
"""
import argparse, base64, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SHEETS = ["player", "police", "fx", "buildings"]
MIME = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg"}


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as fh:
        return f"data:{MIME[ext]};base64," + base64.b64encode(fh.read()).decode("ascii")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "beco-standalone.html"))
    ap.add_argument("--fragment", action="store_true",
                    help="emit page content only, with no <html>/<head>/<body> "
                         "wrapper, for hosts that supply their own skeleton")
    args = ap.parse_args()

    assets = os.path.join(ROOT, "assets")
    baked = {}
    for name in SHEETS:
        meta = json.load(open(os.path.join(assets, f"{name}.json")))
        meta["image"] = data_uri(os.path.join(assets, meta["image"]))
        baked[name] = meta

    game = open(os.path.join(ROOT, "game.js"), encoding="utf-8").read()

    # Point the loader at the baked table instead of the network. Everything
    # else about the engine is unchanged.
    loader = """
async function loadSheet(name) {
  const meta = JSON.parse(JSON.stringify(window.BECO_ASSETS[name]));
  meta.img = await loadImage(meta.image);
  return meta;
}
"""
    patched, n = re.subn(
        r"async function loadSheet\(name\) \{.*?\n\}\n",
        loader.lstrip(), game, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("could not find loadSheet() to replace — did game.js change?")

    shell = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    shell = shell.replace('<link rel="manifest" href="manifest.webmanifest">', "")
    payload = ("<script>window.BECO_INLINE=true;window.BECO_ASSETS="
               + json.dumps(baked, separators=(",", ":")) + ";</script>\n"
               + "<script>" + patched + "</script>")
    out_html = shell.replace('<script src="game.js"></script>', payload)

    if args.fragment:
        # Keep the title, the stylesheet and the body markup; drop the document
        # scaffolding the host supplies itself.
        title = re.search(r"<title>.*?</title>", out_html, re.S).group(0)
        style = re.search(r"<style>.*?</style>", out_html, re.S).group(0)
        body = re.search(r"<body>(.*?)</body>", out_html, re.S).group(1)
        out_html = f"{title}\n{style}\n{body.strip()}\n"

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(out_html)
    mb = os.path.getsize(args.out) / 1024 / 1024
    print(f"{args.out}  {mb:.2f} MB")


if __name__ == "__main__":
    main()
