# nerdterm.dev: how it is designed

Read this before changing anything visible on the site. It says what the site is, the grid every size comes from,
how each part is built, and the checks a change passes before anyone is shown it.

## 1. What the site is

- **One site, one shell.** nerdterm.dev is nerd's site; the plugin catalog is its section under `/plugins`. Every
  page sits in the same window: the top bar (logo, search), the panel on the left (the site map), the page, the
  status line.
- **It is nerd's own terminal UI.** Flat ground, 1px frames with the title in the border, monospace for the UI,
  system fonts only. Nothing is layered, raised, rounded or shadowed.
- **Everything aligns to the left edge.** Nothing is centred: not a hero, not a heading, not a call to action. The
  style comes from the grid, the type and nerd's frames, never from symmetry.
- **The home page** (`home.js`) is nerd drawn as a floor plan: "Shells. Agents. You decide." (the line on the logo) with one paragraph, the
  install command with a filled Copy, Read the docs and Browse the catalog, the fine print, the logo on the right.
  Under it, the plan: the Mac as one unbroken wall; inside it the client, the nerd server (a double wall: a
  sandbox, network denied), the programs in panes (a single wall: run as you unless their isolation says otherwise) and the plugins (a
  double wall each); links between rooms are lines with arrows and their label above; each door (git, ssh, a plugin
  with network, a pane's proxy, a link or a file, the clipboard, Claude Code's inbox) is a line out through a gap in
  the wall, to its name and the exact line it writes to daemon.log. Every way out nerd's README marks
  `<!-- egress:… -->` has its room, door or line on the plan (`EGRESS` in `home.js`); the build stops otherwise. A click on a room or a door shows one line about it under the plan. Then what a plugin may do,
  what nerd does for agents, and the install command again. It must never lead with an agent sidebar.
- **The catalog's front** (`catalog-front.js`, `/plugins/`) is built from the home page's parts: the same hero, and a
  plan of one plugin's sandbox (the program, what the profile lets it read and write, and its doors: nerd, your
  files, the network, coding agents; open where its manifest names something, walled off where it names nothing),
  with a picker of the catalog's plugins and the plugin guide's example with network, said as such.
- **Every element must tell the visitor something they cannot get elsewhere on the screen.** A label that repeats
  the frame title, a version shown twice, a hint for a key the field already shows: remove it. Ask "what does this
  say to a visitor?" before adding anything, including to the status line.

## 2. The grid

One module, one text line. Every height, gap and padding is a token below; a raw number in CSS is a defect unless
it is derived from these (say how in a one-line comment).

| Token | Value | Use |
|---|---|---|
| `--u` | 4px | the module; every vertical size is a multiple of it |
| `--line` | 20px (24 at ≥1900px) | body line height; the rhythm unit |
| `--s1 … --s9` | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 | the only gaps, paddings and margins; no two steps closer than 25% |
| `--ctl` | 28px (32 at ≥1900px) | every control: field, button, select, tab, menu button |
| `--cta` | 40px | a page's main actions (two text lines) |
| `--bar` | 44px | the top bar, plus its 1px border |
| `--status` | 32px | the status line, plus its 1px border |
| `--gut` | 16px (12 at ≤340px) | the page gutter, at every width |
| `--in` | 16px | inside a frame, left and right |
| `--side` | 240px (280 at ≥1900px) | the panel column |
| `--lh` | 24px (28 at ≥1900px) | a row in the panel |

Rules that keep the grid true:

1. **Borders are inside the step.** A row with a 1px rule is `4 + 20 + 3 + 1 = 28`, not `4 + 20 + 4 + 1`. When a
   rule is removed (the first row under a hidden head), the padding returns to its full value.
2. **A line height is a length on the grid.** Write `line-height: var(--line)` for body-size text, and
   `round(up, 1.5em, 4px)` for any other size. A unitless `line-height` makes fractional heights that push
   everything below off the pixel.
3. **Text inside a fixed-height box is centred by flex**, not by padding guesses: `display: inline-flex;
   align-items: center; height: var(--ctl)`.
4. **Icons in a line are the line's height** (20×20) in a flex cell. An inline icon of `1.5em` grows the line by a
   fraction of a pixel through the baseline.
5. **A box whose height follows its width** (the logo, a recording, a still) is rounded up to the module by the
   `snapRO` observer in `app.js`: give it the class `snap4` (players get it in `mount`).
6. **Spacing inside a part is smaller than between parts.** Inside a block 4–12, between blocks 16–24, between
   sections 48 (a 1px rule with 24 on each side).
7. **No baseline grid.** The web centres text in its line box; keep the vertical rhythm, do not force baselines.
8. **Text-width elements are the one allowed exception** to whole pixels: a button as wide as its word, a field
   after a text label. Their left edge follows the text; do not pad them to fake a grid.

## 3. The window

| Part | Desktop (>860px) | Phone (≤860px) |
|---|---|---|
| Top bar | logo (panel width) · search field from the page frame's left edge | one row: logo (88px box) · search filling the room · menu button; while searching, the field covers the whole row and results drop under it at its edges |
| Panel | the whole site map, always the same rows | the same map in the menu, opened under the top row, full width |
| Page | frames, 16px from the panel, 16px from the bar and the status line | frames on the 16px gutters |
| Status line | right-aligned: `nerd <version>` (to the changelog) · GitHub · System Light Dark; cells parted by 1px lines; the last word ends on the page frame's right edge | version on the left gutter, theme on the right gutter |

**The panel never moves.** It shows every section of the site on every page: nerd (Home, Install, Docs with all
its pages, Security, Changelog), plugins (Catalog, All plugins with the kinds that exist, Why, Review, Add), this
site (About, Contact, Privacy, Legal). Nothing folds, appears or disappears; only the highlight follows the page,
and the panel keeps its scroll. History (recently viewed plugins) lives in the search field, not in the panel.

## 4. Parts

- **Frame:** 1px border, title in the border at 16px from the corner, body `16px` all round. A frame inside a frame
  loses its border: draw a nested box with its own class (see `.h4f`), never rely on `.frame .frame`.
- **Control:** `--ctl` high. Buttons are filled cells with no outline (`--surface`), the chosen one bold in the
  accent. Fields have a 1px border. One height for all of them on a row.
- **Main action:** `--cta` high, 1px accent border, accent text, bold. At most two per page, equal width.
- **Command box:** one control high for one line (20px line, 3px above and below, 1px border). It hugs its command;
  on a narrow column the command breaks after slashes, `install.sh | sh` stays together, and Copy becomes a row
  under it below 420px.
- **Section:** a 1px rule, 24px, a heading row (heading left, its one link right on the same baseline), 12px, the
  body.
- **List row:** one control high (28). Heads are 24.
- **Tabs:** text buttons `--ctl` high on a 1px rule; the chosen one in the accent with a 2px underline.

## 5. Type

- Faces: `--mono` (UI, labels, code, data), `--text-face` (paragraphs a visitor reads), `--display` (page titles
  and section headings only). System fonts; no font file is loaded from anywhere.
- Body 13px (15px at ≥1900px) on a 20px line (24px). Prose measure 66–78 characters.
- Hierarchy by weight, colour and spacing before size. Big type is for the one page title and big numbers.

## 6. Colour

- The palette is nerd's (`style.css` `:root` and `:root[data-theme="dark"]`); use the variables, never a raw
  colour. Both themes must work; System follows the OS.
- Greys stay neutral. One accent, one meaning: the accent marks what is chosen, active or a link. The one other use is the
  **nerd | official** chip (`.off`): `nerd` on the accent, then `official` in it, its title the full text, the words
  its own fallback.
- **The second colour, `--flow` (lavender), means movement, and nothing else:** data travelling, or a change over time. It is the accent's twin:
  the same OKLCH lightness and chroma, at hue 300 (dark `#CAB0FB`, 9.75:1 on the ground; light `#7850B1`, 5.62:1;
  the accent is `#9FD08A` / `#2E7D1F` at hue 137). Use it only for movement: a path of data drawn
  on the plan, a link between rooms while it carries, a log line while the data it records moves, a door's line out;
  and a change over a period: stars gained this week (`+7 this week`, the catalog's stats) and the stars-by-day
  sparkline. Never for a chosen item (the accent), a state (`--ok`, `--warn`, `--bad`, `--wait`; `--teal` is the
  reviewed mark), a link, a heading, a border at rest or decoration.
- Status colours (`--ok`, `--warn`, `--bad`, `--wait`) only for their state: `--warn` (gold) is caution, as in an
  agent waiting for you or programs that run as you outside the sandbox; it is not a second accent.

## 7. Content

- **Say only what nerd does as written.** The nerd pages are generated from nerd's README.md, docs/*.md
  (except the contributors' rules, menus.md and releasing.md), CHANGELOG.md and SECURITY.md by `site/build.mjs`
  (`--nerd-repo`); never retype them. A claim that needs a footnote to stay true
  is rewritten. In particular: panes and agents run as you unless their isolation says otherwise; no invented
  numbers, users, quotes or logos.
- Plain words, full values, no decoration: no emoji, gradients, glass, shadows, rounded cards, carousels,
  marketing superlatives.
- English on the page.

## 8. Constraints

- Content-Security-Policy: no `style="…"` attributes or `<style>` blocks; computed styles are set from JS
  (`el.style.x = …`). No request to any other host.
- Mouse first: every action is a visible button or link; keys only repeat them.
- A local preview needs cache-busting, or a reviewer sees a stale stylesheet.

## 9. Before showing anything

1. `site/tools/grid-check.sh` passes, against a build served by `python3 site/tools/serve.py 4110 <out>` (or at `SITE`): every page at 320, 360, 390, 600, 860, 1440 and 1920 has no sideways scroll, no
   console error, every frame, control and row on a whole pixel, every list row a multiple of 4. Run it on the site's
   build and on a build of the test fixtures (the command is in `grid-check.sh`), so plugin pages with and without a
   recording are checked even while the catalog is empty.
2. For the part you changed, measure its edges against its neighbours with `site/tools/cdp.mjs --eval`
   (`getBoundingClientRect`) and report the numbers; then look at a 2–3× screenshot at 320 and at 1440, in light
   and dark.
3. Show a before and after side by side for any change of look.

## 10. Already rejected, do not rebuild

Grey tonal layers, section bands and raised panels; a one-line hero of catalog facts in the status bar; a globe
with plugin dots; carousels; a "Get nerd" button in the top bar; a search cell or page-context text in the status
line; a menu that folds or shows sections only on some pages; a home page led by a drawn agent sidebar, numbered feature cards or counters.

## References

| Source | Used for |
|---|---|
| Richard Rutter, *Web Typography*, pp. 171–176 | vertical rhythm from the body line height; no baseline grid on the web |
| Josef Müller-Brockmann, grid construction | the line as the unit; separators are whole lines |
| Adam Wathan & Steve Schoger, *Refactoring UI*, pp. 60–64, 102–105 | a spacing scale defined in advance, steps ≥25% apart; baseline, not centre, for mixed sizes |
| Yesenia Perez-Cruz, *Expressive Design Systems*, ch. 3 | a 4px base unit; less space within components than between them |
| Ilya Gorbunov | inner distances visibly smaller than outer ones; contrast over exact ratios |
| W3C WCAG 2.2, 2.5.8 (AA) and 2.5.5 (AAA) | target size: 24×24 is the AA floor (28px controls pass); 44×44 is AAA |
