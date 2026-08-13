#!/usr/bin/env python3
"""
Render ART-REQUESTS.md as a standalone HTML page.

The markdown file is the thing people paste from; this is the thing people
read and pass around. Generating one from the other keeps them honest.

    python3 build_brief_page.py --out /tmp/art-requests.html

Handles only the markdown constructs the brief actually uses -- headings,
fenced code, pipe tables, lists, blockquote-free paragraphs, `code`, **bold**,
*italic* -- because a general parser is not the job here.
"""
import argparse, html, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

CSS = """
:root {
  /* Concrete and spray paint: the palette is lifted off the game itself --
     the HUD's signal green, the brick of the facades, a blue-biased grey
     that matches its night sky rather than a neutral off-the-shelf grey. */
  --ground:      #e7e9e5;
  --panel:       #f4f5f2;
  --panel-edge:  #d3d8d1;
  --ink:         #1b2320;
  --ink-soft:    #55635c;
  --ink-faint:   #7d8a83;
  --accent:      #2f7d47;
  --accent-soft: #e2efe5;
  --brick:       #a8492f;
  --slab:        #14181b;
  --slab-ink:    #cfd8d2;
  --slab-edge:   #2a3238;
  --rule:        #cbd2ca;

  --f-display: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace;
  --f-body: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --f-mono: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace;

  --measure: 68ch;
  --pad: clamp(1rem, 4vw, 3rem);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground:      #0f1214;
    --panel:       #171b1e;
    --panel-edge:  #262d31;
    --ink:         #dde4e0;
    --ink-soft:    #9aa8a1;
    --ink-faint:   #6d7a74;
    --accent:      #7dd88f;
    --accent-soft: #17251b;
    --brick:       #d4795c;
    --slab:        #0a0d0f;
    --slab-ink:    #cfd8d2;
    --slab-edge:   #232b30;
    --rule:        #262d31;
  }
}
:root[data-theme="dark"] {
  --ground:      #0f1214;
  --panel:       #171b1e;
  --panel-edge:  #262d31;
  --ink:         #dde4e0;
  --ink-soft:    #9aa8a1;
  --ink-faint:   #6d7a74;
  --accent:      #7dd88f;
  --accent-soft: #17251b;
  --brick:       #d4795c;
  --slab:        #0a0d0f;
  --slab-ink:    #cfd8d2;
  --slab-edge:   #232b30;
  --rule:        #262d31;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--f-body);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 78rem; margin: 0 auto; padding: var(--pad); }
.col { max-width: var(--measure); }

/* ---- masthead ---- */
.mast {
  display: flex; flex-direction: column; gap: .75rem;
  padding: clamp(2rem, 7vw, 4.5rem) 0 clamp(1.5rem, 4vw, 2.5rem);
  border-bottom: 3px solid var(--ink);
}
.mast .kicker {
  font-family: var(--f-mono); font-size: .72rem; letter-spacing: .22em;
  text-transform: uppercase; color: var(--accent);
}
.mast h1 {
  font-family: var(--f-display); font-weight: 700;
  font-size: clamp(2.2rem, 7vw, 4.4rem); line-height: .95;
  letter-spacing: -.03em; margin: 0; text-wrap: balance;
}
.mast .standfirst {
  font-size: clamp(1rem, 2.2vw, 1.2rem); color: var(--ink-soft);
  max-width: var(--measure); margin: .35rem 0 0;
}

.mast + p { margin-top: 1.75rem; }

/* ---- headings ---- */
h2 {
  font-family: var(--f-display); font-weight: 700;
  font-size: clamp(1.3rem, 3.4vw, 1.9rem); letter-spacing: -.015em;
  margin: 3.5rem 0 1rem; text-wrap: balance;
}
h2.tier {
  border-top: 3px solid var(--accent); padding-top: 1rem;
  color: var(--accent); text-transform: uppercase; letter-spacing: .06em;
  font-size: clamp(1.1rem, 2.6vw, 1.4rem);
}
h3 { font-size: 1.05rem; margin: 2rem 0 .6rem; letter-spacing: .01em; }
p { margin: 0 0 1rem; max-width: var(--measure); }
a { color: var(--accent); }

/* ---- request cards: the P-number is a real identifier, matching the
       A1..A18 scheme the character pack already uses ---- */
.req {
  display: grid; grid-template-columns: 5.5rem 1fr; gap: 0 1.5rem;
  margin: 3rem 0 0; padding-top: 1.25rem;
  border-top: 1px solid var(--rule);
}
.req .id {
  font-family: var(--f-mono); font-weight: 700; font-size: 1.5rem;
  letter-spacing: -.02em; color: var(--brick); line-height: 1.2;
}
/* Grid items default to min-width:auto, so a wide <pre> would push the
   column past the viewport instead of scrolling inside itself. */
.req .body { min-width: 0; }
.req .body > :first-child { margin-top: 0; }
.req h3 {
  margin: 0 0 .5rem; font-family: var(--f-display); font-weight: 700;
  font-size: clamp(1.05rem, 2.4vw, 1.3rem); letter-spacing: -.01em;
}
.req h3 .count {
  font-family: var(--f-mono); font-size: .7rem; font-weight: 500;
  letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint);
  display: block; margin-top: .3rem;
}
@media (max-width: 42rem) {
  .req { grid-template-columns: 1fr; gap: .4rem; }
  .req .id { font-size: 1.1rem; }
}

/* ---- paste blocks ---- */
pre {
  background: var(--slab); color: var(--slab-ink);
  border: 1px solid var(--slab-edge); border-left: 3px solid var(--accent);
  border-radius: 2px;
  padding: 1.1rem 1.25rem; margin: 1.25rem 0;
  overflow-x: auto; font-family: var(--f-mono);
  font-size: .82rem; line-height: 1.6; tab-size: 2;
}
code {
  font-family: var(--f-mono); font-size: .88em;
  background: var(--accent-soft); color: var(--ink);
  padding: .1em .35em; border-radius: 2px;
}
pre code { background: none; padding: 0; color: inherit; font-size: inherit; }

/* ---- tables ---- */
.tablewrap { overflow-x: auto; margin: 1.25rem 0; }
table { border-collapse: collapse; width: 100%; min-width: 30rem; font-size: .92rem; }
th, td {
  text-align: left; padding: .55rem .85rem;
  border-bottom: 1px solid var(--rule); vertical-align: top;
}
th {
  font-family: var(--f-mono); font-size: .7rem; letter-spacing: .14em;
  text-transform: uppercase; color: var(--ink-faint);
  border-bottom: 2px solid var(--ink);
}
td:first-child { font-weight: 600; }
tbody tr:last-child td { border-bottom: none; }

ul, ol { max-width: var(--measure); padding-left: 1.3rem; margin: 0 0 1rem; }
li { margin: .3rem 0; }
li::marker { color: var(--accent); }
strong { font-weight: 650; }
hr { display: none; }

footer {
  margin-top: 4rem; padding-top: 1.25rem;
  border-top: 3px solid var(--ink);
  font-family: var(--f-mono); font-size: .74rem; letter-spacing: .1em;
  text-transform: uppercase; color: var(--ink-faint);
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
"""


def inline(t):
    t = html.escape(t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*([^*]+)\*(?![*\w])", r"<em>\1</em>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    return t


def convert(md):
    lines = md.split("\n")
    out, i = [], 0
    open_req = False

    def close_req():
        nonlocal open_req
        if open_req:
            out.append("</div></section>")
            open_req = False

    while i < len(lines):
        ln = lines[i]

        if ln.startswith("```"):
            body = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>" + html.escape("\n".join(body)) + "</code></pre>")
            continue

        if ln.startswith("## ") and re.match(r"## P\d+ ", ln):
            close_req()
            title = ln[3:]
            pid, rest = title.split("·", 1) if "·" in title else (title.split()[0], title)
            name, _, count = rest.partition("—")
            out.append('<section class="req"><div class="id">'
                       + inline(pid.strip()) + '</div><div class="body"><h3>'
                       + inline(name.strip())
                       + (f'<span class="count">{inline(count.strip())}</span>' if count.strip() else "")
                       + "</h3>")
            open_req = True
            i += 1
            continue

        if ln.startswith("# "):
            close_req()
            out.append('<h2 class="tier">' + inline(ln[2:]) + "</h2>")
            i += 1
            continue

        if ln.startswith("## "):
            close_req()
            out.append("<h2>" + inline(ln[3:]) + "</h2>")
            i += 1
            continue

        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[2:]]
            t = ['<div class="tablewrap"><table><thead><tr>']
            t += [f"<th>{inline(c)}</th>" for c in head]
            t.append("</tr></thead><tbody>")
            for r in body:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table></div>")
            out.append("".join(t))
            continue

        m = re.match(r"^(\d+)\. (.*)", ln)
        if m or ln.startswith("- "):
            ordered = bool(m)
            tag = "ol" if ordered else "ul"
            items, buf = [], None
            while i < len(lines):
                mm = re.match(r"^(\d+)\. (.*)", lines[i])
                if (ordered and mm) or (not ordered and lines[i].startswith("- ")):
                    if buf is not None:
                        items.append(buf)
                    buf = mm.group(2) if ordered else lines[i][2:]
                elif lines[i].startswith("   ") and buf is not None and lines[i].strip():
                    buf += " " + lines[i].strip()
                elif not lines[i].strip() and i + 1 < len(lines) and (
                        re.match(r"^(\d+)\. ", lines[i + 1]) or lines[i + 1].startswith("- ")):
                    pass
                else:
                    break
                i += 1
            if buf is not None:
                items.append(buf)
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue

        if ln.strip() in ("", "---"):
            i += 1
            continue

        para = [ln]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(
                r"^(#|\||```|- |\d+\. |---)", lines[i]):
            para.append(lines[i])
            i += 1
        out.append("<p>" + inline(" ".join(para)) + "</p>")

    close_req()
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(ROOT, "ART-REQUESTS.md"))
    ap.add_argument("--out", default=os.path.join(ROOT, "art-requests.html"))
    args = ap.parse_args()

    md = open(args.src, encoding="utf-8").read()
    # strip the H1 and the standfirst; they become the masthead
    md = re.sub(r"^# .*?\n", "", md, count=1)
    lead = "What the game still needs, in the order it would help."
    md = md.replace(lead + "\n", "", 1)

    page = f"""<title>BECO Art Requests</title>
<style>{CSS}</style>
<div class="page">
  <header class="mast">
    <div class="kicker">Commission brief &middot; environment pack</div>
    <h1>What BECO still needs</h1>
    <p class="standfirst">A defect list, not a wishlist. Every request below is
    something the game currently fakes with hand-drawn canvas, dropped from the
    delivered pack, or does without entirely.</p>
  </header>
  {convert(md)}
  <footer>BECO &middot; companion to sprite-prompts.md</footer>
</div>
"""
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"{args.out}  {os.path.getsize(args.out)/1024:.1f} KB")


if __name__ == "__main__":
    main()
