# Prints each way a text file's lines look like hidden code, one per line; review.sh fails on any exit but 0.
# Run lengths are measured, never written as {n,}: macOS's regex refuses a count over 255.
# A long run of base64 or hex, on one line or wrapped over many, is data that could hide code. A heuristic: it
# catches the usual encoders' output, not every way to hide something.
# recording=1 is the plugin's demo.cast, whose event lines are long by nature: only the length rule is skipped.
recording != 1 && length > 1000 { long = 1 }
{
  s = $0
  while (match(s, /[A-Za-z0-9+\/=]+/)) { if (RLENGTH >= 400) blob = 1; s = substr(s, RSTART + RLENGTH) }
  s = $0
  sub(/^[[:space:]"'`+(]+/, "", s)
  sub(/["'`,;)+[:space:]]+$/, "", s)
  if (length(s) >= 60 && s ~ /^[A-Za-z0-9+\/=]+$/) { if (++run >= 8) blob = 1 } else run = 0
}
END {
  if (long) print "has a line over 1000 characters: minified or obfuscated code is not accepted"
  if (blob) print "holds a long encoded blob"
}
