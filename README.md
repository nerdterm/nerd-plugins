# nerd plugins

The catalog of community plugins for [nerd](https://github.com/nerdterm/nerd), under the [MIT licence](LICENSE). nerd reads it only when you choose
Refresh catalog (or run `nerd --plugin-catalog`); nothing is fetched in the background.

## An entry

One file per plugin, `plugins/<name>.json`, named after the plugin's manifest:

```json
{
  "title": "Big files",
  "summary": "Marks files over 1 MB in the tree and the tab.",
  "url": "https://github.com/you/nerd-bigfiles",
  "tag": "v1.2.0",
  "commit": "<the 40 characters the tag points at>",
  "version": "1.2.0",
  "risk": 0,
  "review": "checked"
}
```

nerd installs exactly `commit`, and refuses when `tag` no longer points at it. `risk` is what
`nerd --plugin-check --json` says; nerd recomputes it and refuses an entry that disagrees. `review` is set by the
review, not by you: open the pull request with `"review": "checked"`.

An entry may also carry `"featured": true`, which puts the plugin under Featured on the site. It is set by the
catalog's maintainer, not by you: a pull request that adds, removes or changes it is never approved automatically.

## Adding or updating a plugin

1. Your plugin is open source, with a licence file (any open source licence, copyleft included), in a public GitHub
   repository: the entry's `url` is `https://github.com/<owner>/<repo>`. nerd installs from no other host.
2. Its `plugin.json` has `version` and `min_nerd`, and a release tag `v<version>` points at the commit you submit.
3. `nerd --plugin-check --catalog <folder>` is clean and `nerd --plugin-trial <folder>` connects.
4. Open a pull request that adds or changes `plugins/<name>.json`, one plugin per pull request.

## Review

Every pull request is checked by CI, and a failed check stops it:

- `nerd --plugin-check --catalog`: the manifest is valid, and the risk level is computed from it;
- the licence is an open source one;
- no compiled binaries, no file over 1 MB that is not text, no line that looks minified, and no long encoded blob
  (a heuristic, not a proof);
- every package manifest has a lockfile that pins exact versions;
- a `demo.cast`, which the site shows, is a plain file whose first line is one asciicast v2 or v3 header with a
  whole-number width and height from 1 to 1000, and whose other lines are events `[time, code, data]` with a time of
  0 or more, in order; its long event lines are not taken for minified code, and every other check reads it as it
  reads any file;
- OSV-Scanner (known vulnerabilities and OpenSSF malicious packages), GuardDog, YARA and Gitleaks;
- `nerd --plugin-trial`: the plugin runs in nerd's sandbox with no network (even when its manifest names hosts) and nowhere to write but a temporary data folder. It reports whether
  it connected, what it sent, how it ended and what it printed; macOS does not let the review read the sandbox's
  own list of what it denied, so that list is not part of the report.

The checks run with no token and no secrets, from this repository's own scripts, never the pull request's. Each run
waits for the maintainer's approval in the `catalog-review` environment before it starts, because it runs the plugin on
a GitHub-hosted macOS runner. A separate job, which runs nothing of the pull request, sets the labels, and only for the
commit that was reviewed.

## The review machine

The review job runs on GitHub's macOS runner (`macos-15`, Apple Silicon), a fresh machine for every run that is
thrown away after it. The job installs its tools itself and stops when a download's checksum differs:

- `nerd`: the latest release, checked against the `.sha256` published with it;
- Gitleaks 8.30.1, OSV-Scanner 2.6.0, jq 1.8.2 and YARA-X 1.21.0 (`yr`; YARA publishes no macOS build), the release
  binaries, each checked against a SHA-256 written in `.github/workflows/review.yml`;
- the YARA Forge core rules, release 20260927, checked the same way;
- GuardDog 3.2.0 on Python 3.13, with every package it needs pinned by hash in `scripts/guarddog-requirements.txt`.

`git` and `file` are the runner's. The repository needs the `catalog-review` environment with the maintainer as
required reviewer, and the labels `auto-approve` and `needs-maintainer`. To update a tool, change its version and
checksum in the workflow together, and read its changelog for changes to flags or exit codes, which the review relies
on to fail closed.

Risk levels come from the manifest: 0 only shows things, 1 writes files, 2 reaches the network (this Mac's
services with `"network": "localhost"`, or the hosts and ports the manifest names, which the site and nerd list in
words), 3 hooks into an agent. A pull request at level 0 whose checks pass, and whose level did not rise, is labelled `auto-approve` and gets
the mark **checked**. Every other one is labelled `needs-maintainer`: the maintainer reads it and, on approval, it gets the
mark **reviewed**. The maintainer may add an AI analysis on their own machine with `scripts/deep-review.sh <pull request>`: it
reads the plugin at the pinned commit as data, with read-only tools, a fixed model, a turn limit and a spending cap,
and prints a report. It only adds findings and cannot approve anything; the maintainer decides what to post.

## Stars

`stars.json` holds each plugin's GitHub stars and the day a count last changed. The `stars` workflow counts them daily
and after every merge, with this repository's own `scripts/stars.sh`, and commits the file only when a count changed;
a repository GitHub does not answer for is skipped, not fatal.
nerd shows them in its Plugins window after Refresh catalog, and the site on each page; neither asks GitHub itself. The
workflow pushes to `main`, so the branch ruleset lets GitHub Actions bypass it.

## Revoking a release

`revoked.json` lists releases that must not run (`hard`: nerd turns the plugin off until it is updated to the
catalog's current release, or removed) or that users are warned about (`soft`):

```json
[{ "name": "bigfiles", "commit": "<40 characters>", "level": "hard", "why": "it read files outside the tree" }]
```

## The site

`site/build.mjs` builds nerdterm.dev, nerd's site with this catalog as its section, from this repository and
nerd's: `node site/build.mjs <out> --nerd-repo <nerd's repository> [--nerd <path>]`; `node --test site/test.mjs` tests
it. It needs `git` and `nerd`: what each plugin may do and the newest nerd version come from the nerd `--nerd` names
(`nerd` on PATH by default), and the build prints which version that is. It also stops when nerd's README marks a way
out of nerd (`<!-- egress:… -->`) that the home page does not draw. It writes one page, `index.html`, with the catalog embedded in it, the same data as
`catalog.json`, each plugin's `demo.cast` under `casts/`, and `nerd-docs.js`: nerd's README.md,
`docs/*.md` (except the contributors' rules, `menus.md` and `releasing.md`), `CHANGELOG.md` and `SECURITY.md`, which the pages about nerd render, so they say what nerd's repository says.
How the site is designed, and the checks a visible change passes, are in `site/DESIGN.md`. The page loads
nothing from elsewhere at view time (its Content-Security-Policy allows only its own files), uses the system's
fonts, and vendors asciinema-player (Apache-2.0) for recordings. The logo in `site/brand/` is nerd's, copied
unchanged from nerd's repository.

Nothing on the site is kept by hand except `featured`; the rest is derived:

- the day a plugin was added: the first commit of `plugins/<name>.json`; its releases: every tag that file has held,
  each with the day of the commit that first held it, and the review mark and risk at that commit;
- what a release may do: `nerd --plugin-check --json` and `plugin.json` in the plugin's repository at the catalog's
  commit (file types it previews, the files it writes, the hosts and ports it reaches, the agents it speaks for);
  what changed from the release before: that release's `plugin.json`, from the same clone, compared in words;
- stars gained over 7, 30 and 90 days: today's count in `stars.json` less the count at the last commit of
  `stars.json` on or before that day; where the counts are younger than that, the oldest count stands in and the
  site says since when;
- revocations: `revoked.json`, each with the day of the commit that added it.

A plugin whose source cannot be read at build time (a deleted repository, a rewritten history, a failed check) stays
listed with its risk and mark and says so (in `catalog.json` its `can` is `null`: unknown, not none); the others still
build. A `plugin.json` that is a link is read as nerd reads it, but only when it leads to a file inside the plugin; the
review does not accept a linked manifest at all. A README or LICENSE over 256 KB, or a `demo.cast`
over 4 MB, is not shown, and the page says why.

## Publishing the site

`.github/workflows/pages.yml` publishes nerdterm.dev on GitHub Pages on every push to `main`, daily at 04:47 UTC after
the `stars` workflow has counted (its own push starts no workflow), and when the maintainer runs it by hand. It
builds on GitHub's macOS runner (`macos-15`), because the build needs nerd, from nerd's latest release tag rather than
its `master`, so the pages about nerd say what the released nerd does. The job installs that release itself, checked
against the `.sha256` published with it, and stops when the installed nerd is not that release; a new nerd release
reaches the site with the next run. `git`, `node` and `gtar` (GNU tar, which `actions/upload-pages-artifact` uses on
macOS) are the runner's. The deploy job runs on a GitHub-hosted Linux runner with only
`pages: write` and `id-token: write`; the repository's Pages source is GitHub Actions.
