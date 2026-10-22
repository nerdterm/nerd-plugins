#!/bin/bash
# nerd's release TAG into DIR/nerd, only if one of the release keys pinned beside this script signed its .sha256.
# The keys are the same two as nerd's install.sh carries; a key rotation in nerd changes them here too.
set -euo pipefail
tag=${1:?usage: nerd-release.sh TAG DIR} out=${2:?usage: nerd-release.sh TAG DIR}
here=$(cd "$(dirname "$0")" && pwd)
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not a release tag of nerd: $tag" >&2; exit 1; }
a=nerd-$tag-macos-arm64.tar.gz
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
for n in "$a" "$a.sha256" "$a.sha256.sig"; do
    curl -fsSL --retry 3 -o "$d/$n" "https://github.com/nerdterm/nerd/releases/download/$tag/$n"
done
awk -v d="$d" '/BEGIN PUBLIC KEY/ { n++ } { print > (d "/key" n ".pem") }' "$here/nerd-release-keys.pem"
signed=
for k in "$d"/key*.pem; do
    if /usr/bin/openssl dgst -sha256 -verify "$k" -signature "$d/$a.sha256.sig" "$d/$a.sha256" >/dev/null 2>&1; then signed=1; fi
done
[ -n "$signed" ] || { echo "nerd $tag: the signature does not check against the pinned release keys" >&2; exit 1; }
# The whole signed file must be exactly what shasum says of this archive: one line, this name, this hash.
[ "$(cat "$d/$a.sha256")" = "$(cd "$d" && shasum -a 256 "$a")" ] || { echo "nerd $tag: the archive does not match its signed checksum" >&2; exit 1; }
tar -xzf "$d/$a" -C "$d" nerd
install -m 755 "$d/nerd" "$out/nerd"
echo "nerd $tag: signature and checksum checked, installed in $out"
