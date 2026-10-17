#!/bin/bash
# Reviews the entries a pull request adds or changes; writes result.json. Any failed check fails the run.
# Usage: scripts/review.sh <base commit> <out dir>
set -euo pipefail

base=$1
out=$2
scripts=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
for tool in nerd git file gitleaks osv-scanner guarddog yr jq; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

changed=$(git diff --name-only "$base"...HEAD -- 'plugins/*.json')
# grep and awk exit 1 for "nothing found"; 2 or more is a check that did not run, and fails the review.
others=$(git diff --name-only "$base"...HEAD | grep -v '^plugins/[a-z0-9-]*\.json$') || [ $? = 1 ]
[ -z "$others" ] || { echo "a plugin pull request changes plugins/<name>.json only: $others" >&2; exit 1; }
[ "$(echo "$changed" | grep -c .)" = 1 ] || { echo "one plugin per pull request" >&2; exit 1; }

entry=$changed
[ -f "$entry" ] && [ ! -L "$entry" ] || { echo "$entry is not a plain file" >&2; exit 1; }
name=$(basename "$entry" .json)
url=$(jq -r .url "$entry")
tag=$(jq -r .tag "$entry")
commit=$(jq -r .commit "$entry")
claimed=$(jq -r .risk "$entry")
previous=$(git show "$base:$entry" 2>/dev/null | jq -r .risk || echo none)
previous_url=$(git show "$base:$entry" 2>/dev/null | jq -r .url || echo none)
# `featured` is the maintainer's to set: a pull request that touches it is never approved by the machine.
featured_of='[has("featured"), .featured]'
featured=$(jq -c "$featured_of" "$entry")
previous_featured=$(git show "$base:$entry" 2>/dev/null | jq -c "$featured_of" || echo '[false,null]')
featured_changed=false
[ "$featured" = "$previous_featured" ] || featured_changed=true
problems=()
fail() { problems+=("$1"); }
found() { local rc=0; "$@" || rc=$?; [ "$rc" -le 1 ] || fail "a check did not run (exit $rc): $1"; return "$rc"; }

# A public GitHub repository, as nerd accepts it; the site also shows it as a command to paste into a shell.
repo=${url%.git}
[[ "$url" =~ ^https://github\.com/[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$ ]] && [[ "${repo##*/}" != . && "${repo##*/}" != .. && -n "${repo##*/}" ]] ||
  { echo "the url must be https://github.com/<owner>/<repo>" >&2; exit 1; }
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "commit must be 40 hex characters" >&2; exit 1; }
# The site derives "official" from the url and the tag; an entry that claims it is refused.
jq -e 'has("official") | not' "$entry" >/dev/null || { echo "official is derived by the site, never set in an entry" >&2; exit 1; }
# Only the keys the catalog knows: anything else is a field some reader might trust.
extra=$(jq -r '(keys - ["title","summary","url","tag","commit","version","risk","review","featured"]) | join(", ")' "$entry")
[ -z "$extra" ] || { echo "unknown keys in the entry: $extra" >&2; exit 1; }
jq -e '(.title | type) == "string" and (.summary | type) == "string"' "$entry" >/dev/null || { echo "title and summary must be strings" >&2; exit 1; }
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "tag must be v<version>" >&2; exit 1; }
[ "$(jq -r .review "$entry")" = checked ] || fail "review is set by the review: submit \"checked\""
[ "$featured" = '[false,null]' ] || [ "$featured" = '[true,true]' ] || fail "featured is true or absent"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# The plugin is data here: fetched without hooks, filters or the runner's git config, never built.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
git -c core.hooksPath=/dev/null -c protocol.allow=never -c protocol.https.allow=always -c transfer.fsckObjects=true \
  clone --quiet --no-checkout -- "$url" "$work/src"
tagged=$(git -C "$work/src" rev-parse --verify --quiet "refs/tags/$tag^{commit}" || true)
[ "$tagged" = "$commit" ] || fail "tag $tag is not commit $commit"
git -C "$work/src" -c core.hooksPath=/dev/null checkout --quiet --detach "$commit"
rm -rf "$work/src/.git"
# nerd follows a linked manifest; the site and this review read the file itself, so a link is not accepted.
[ ! -L "$work/src/plugin.json" ] || fail "plugin.json is a symbolic link: commit the manifest itself"
dir=$work/src
# The site shows demo.cast as site/build.mjs reads it: one header, asciicast v2 or v3 with a whole-number size, then
# events [time >= 0, string, string], v2's times never going back (v3's are intervals and may have # comment lines).
if [ -L "$dir/demo.cast" ]; then
  fail "demo.cast is a symbolic link: commit the recording itself"
elif [ -f "$dir/demo.cast" ]; then
  if ! head -n 1 "$dir/demo.cast" | jq -e -s 'length == 1 and (.[0] | type == "object" and (.version == 2 or .version == 3)
      and ([if has("width") then .width else .term.cols end, if has("height") then .height else .term.rows end]
        | all(type == "number" and . == floor and . >= 1 and . <= 1000)))' >/dev/null 2>&1; then
    fail "demo.cast's first line is not one asciicast v2 or v3 header with a whole-number width and height from 1 to 1000"
  elif ! jq -R -s 'rtrimstr("\n") | split("\n")' "$dir/demo.cast" | jq -e '(.[0] | fromjson | .version) as $v
      | [.[1:][] | select($v == 2 or (startswith("#") | not)) | try fromjson catch null] as $e
      | ($e | all(type == "array" and length == 3 and (.[0] | type == "number" and . >= 0) and (.[1] | type == "string") and (.[2] | type == "string")))
        and ($v == 3 or ([$e[][0]] as $t | [range(1; $t | length) | $t[.] >= $t[. - 1]] | all))' >/dev/null 2>&1; then
    fail "demo.cast has an event line that is not [time, code, data] with a time of 0 or more, in order"
  fi
fi

check=$(nerd --plugin-check --catalog --json "$dir" || true)
echo "$check" > "$out/check.json"
[ "$(echo "$check" | jq -r .name)" = "$name" ] || fail "the manifest's name is not $name"
[ "$(echo "$check" | jq -r .version)" = "$(jq -r .version "$entry")" ] || fail "the manifest's version is not the entry's"
[ "$(jq -r .version "$entry")" = "${tag#v}" ] || fail "the entry's version is not its tag's"
while IFS= read -r p; do [ -n "$p" ] && fail "plugin-check: $p"; done < <(echo "$check" | jq -r '.problems[]')
risk=$(echo "$check" | jq -r .risk)
[ "$risk" = "$claimed" ] || fail "the entry says risk $claimed, the manifest gives $risk"

licence=$(find "$dir" -maxdepth 1 -iname 'licen[cs]e*' -o -maxdepth 1 -iname 'copying*' | head -1)
if [ -z "$licence" ]; then
  fail "no licence file"
elif ! grep -qiE 'MIT License|Permission is hereby granted|Apache License|BSD|ISC License|Mozilla Public License|GNU (Lesser |Affero )?General Public License|zlib License|Unlicense|Boost Software License' "$licence"; then
  fail "the licence is not one the catalog recognises as open source"
fi

while IFS= read -r -d '' f; do
  rel=${f#"$dir"/}
  mime=$(file --brief --mime-type "$f")
  case "$mime" in
    application/x-mach-binary|application/x-executable|application/x-sharedlib|application/x-dosexec|application/x-pie-executable|application/x-object|application/wasm|application/java-archive|application/x-java-applet)
      fail "$rel is a compiled binary" ;;
  esac
  case "$rel" in
    *.wasm|*.jar|*.class|*.pyc|*.pyo|*.so|*.dylib|*.node|*.exe|*.dll) fail "$rel is compiled code" ;;
  esac
  size=$(stat -f %z "$f")
  if [[ "$mime" != text/* && "$mime" != application/json && "$mime" != inode/x-empty && "$size" -gt 1048576 ]]; then
    fail "$rel is over 1 MB and not text"
  fi
  # Lockfiles hold long lines by nature, and OSV-Scanner reads them.
  case "$(basename "$rel")" in
    package-lock.json|bun.lock|pnpm-lock.yaml|yarn.lock|Cargo.lock|go.sum|uv.lock|poetry.lock|pdm.lock) continue ;;
  esac
  if [[ "$mime" == text/* || "$mime" == application/json ]]; then
    recording=0
    [ "$f" != "$dir/demo.cast" ] || recording=1
    if hits=$(LC_ALL=C awk -v recording="$recording" -f "$scripts/lines.awk" "$f"); then
      while IFS= read -r h; do [ -z "$h" ] || fail "$rel $h"; done <<< "$hits"
    else
      fail "the line checks did not run on $rel"
    fi
  fi
done < <(find "$dir" -type f -print0)

pinned() { [ -f "$dir/$1" ] || fail "$2 has no $1 to pin its dependencies"; }
[ ! -f "$dir/package.json" ] || [ -f "$dir/package-lock.json" ] || [ -f "$dir/bun.lock" ] || [ -f "$dir/pnpm-lock.yaml" ] || [ -f "$dir/yarn.lock" ] || fail "package.json has no lockfile"
[ ! -f "$dir/Cargo.toml" ] || pinned Cargo.lock Cargo.toml
[ ! -f "$dir/go.mod" ] || pinned go.sum go.mod
[ ! -f "$dir/pyproject.toml" ] || [ -f "$dir/uv.lock" ] || [ -f "$dir/poetry.lock" ] || [ -f "$dir/pdm.lock" ] || fail "pyproject.toml has no lockfile"
if [ -f "$dir/requirements.txt" ] && found awk '!/^[[:space:]]*(#|$|-r )/ && !/==/ { f = 1 } END { exit !f }' "$dir/requirements.txt"; then
  fail "requirements.txt pins every package with =="
fi

# The scanners read their settings from the folder they scan: the plugin's own would switch them off.
find "$dir" \( -name osv-scanner.toml -o -name .gitleaks.toml -o -name .gitleaksignore -o -name .semgrepignore -o -name .guarddog.yml \) -exec rm -f {} +
if found grep -rIl --exclude-dir=.git -e 'nosemgrep' -e 'gitleaks:allow' -e 'osv-scanner:ignore' "$dir" > "$work/silencers.txt" 2>/dev/null; then
  fail "the code tells a scanner to look away: $(tr '\n' ' ' < "$work/silencers.txt")"
fi
# OSV's database includes the OpenSSF malicious-packages entries (MAL-); exit 128 means it found no package at all.
rc=0
osv-scanner scan source --recursive "$dir" > "$work/osv.txt" 2>&1 || rc=$?
[ "$rc" = 0 ] || [ "$rc" = 128 ] || fail "OSV-Scanner found known-vulnerable or malicious packages, or failed ($rc)"
if [ -f "$dir/package.json" ]; then
  guarddog npm scan "$dir" --exit-non-zero-on-finding > "$work/guarddog-npm.txt" 2>&1 || fail "GuardDog flagged the npm package"
fi
if [ -f "$dir/pyproject.toml" ] || [ -f "$dir/setup.py" ]; then
  guarddog pypi scan "$dir" --exit-non-zero-on-finding > "$work/guarddog-pypi.txt" 2>&1 || fail "GuardDog flagged the Python package"
fi
gitleaks detect --no-git --source "$dir" --report-path "$work/gitleaks.json" > /dev/null 2>&1 || fail "Gitleaks found a secret"
# A missing or broken rules file is a failure, not a pass.
if matches=$(yr scan --recursive --disable-warnings "${YARA_RULES:?set YARA_RULES to the rules file}" "$dir"); then
  [ -z "$matches" ] || fail "a YARA rule matched"
else
  fail "yara did not run"
fi

nerd --plugin-trial "$dir" > "$work/trial.txt" 2>&1 || fail "the trial run did not connect or did not keep running"

rise=false
[ "$previous" = none ] || [ "$risk" -le "$previous" ] || rise=true
# Another address is another plugin, whatever its risk level.
[ "$previous_url" = none ] || [ "$previous_url" = "$url" ] || rise=true
auto=false
[ ${#problems[@]} -eq 0 ] && [ "$risk" = 0 ] && [ "$rise" = false ] && [ "$featured_changed" = false ] && auto=true
jq -n --arg name "$name" --argjson risk "$risk" --arg previous "$previous" --argjson auto "$auto" --argjson rise "$rise" \
  --argjson featured_changed "$featured_changed" \
  '{name: $name, risk: $risk, previous: $previous, rise: $rise, featured_changed: $featured_changed, auto: $auto, problems: $ARGS.positional}' \
  --args "${problems[@]+"${problems[@]}"}" > "$out/result.json"
cat "$out/result.json"
[ ${#problems[@]} -eq 0 ]
