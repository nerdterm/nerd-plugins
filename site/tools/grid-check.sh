#!/bin/sh
# Checks every page at every width the site supports: no sideways scroll, no console error, every frame, control and
# row on a whole pixel (top, and left for frames, fields and command boxes), every list row a multiple of 4. Prints one line per page; exits non-zero on any failure.
# Usage: [SITE=http://127.0.0.1:4110/] site/tools/grid-check.sh [page ...]   (default: every page below, as paths; a built site served at SITE)
# Run it twice: on the site's build, and on a build of the test fixtures, whose plugins have pages with and without a
# recording (bigfiles, hooky, netty): node site/build.mjs <out> --catalog site/fixtures --data site/fixtures/data --nerd-repo site/fixtures/nerd
cd "$(dirname "$0")"
ROUTES=${*:-"/ plugins/ plugins/all/ plugins/peek/ plugins/sessions/ plugins/bigfiles/ plugins/hooky/ plugins/netty/ plugins/review/ plugins/add/ plugins/why/ install/ docs/usage/ docs/configuration/ security/ changelog/ about/"}
WIDTHS="320 360 390 600 860 1440 1920"
E='const frac=(v)=>Math.abs(v-Math.round(v))>0.02; const off4=(v)=>Math.abs(v/4-Math.round(v/4))>0.01;
const vis=(s)=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent);
const tops=vis(".frame, .tqf, .qin, .btn, .cmd, .h7mac, .h7r, .h7d, .h7s, .grp, .card, .lr, .tile, .wr, .rband").filter(e=>frac(e.getBoundingClientRect().top)).map(e=>e.className.toString().split(" ")[0]);
const lefts=vis(".frame, .tqf, .qin, .cmd, .h7mac, .h7r, .h7exits").filter(e=>frac(e.getBoundingClientRect().left)).map(e=>"left:"+e.className.toString().split(" ")[0]);
tops.push(...lefts);
const rows=vis(".lr").filter(e=>off4(e.getBoundingClientRect().height)).map(e=>Math.round(e.getBoundingClientRect().height*100)/100);
return {over:document.documentElement.scrollWidth-innerWidth, tops:[...new Set(tops)], rows}'
fail=0
for r in $ROUTES; do
  [ "$r" = "/" ] && r=""
  line="/$r"
  for w in $WIDTHS; do
    o=$(node cdp.mjs "$r" --w "$w" --h 900 --scale 1 --wait 1500 --eval "$E" 2>&1 | tr -d '\n ')
    if echo "$o" | grep -q '"errors":\[\]' && echo "$o" | grep -q '"over":0,"tops":\[\],"rows":\[\]'; then line="$line $w:ok"
    else line="$line $w:FAIL$(echo "$o" | grep -o '"errors":\[[^]]*\]\|"eval":{.*}' | head -2 | tr '\n' ' ')"; fail=1; fi
  done
  echo "$line"
done
exit $fail
