#!/usr/bin/env bash
# Derived, web-friendly versions of every cover. Originals are never touched.
#   .variants/assets/poster/<slug>.webp  still, ≤480px                (everywhere, shown first)
#   .variants/assets/anim/<slug>.webp    animated, ≤360px, ≤10 s       (cards while on screen)
#   .variants/assets/full/<slug>.webp    animated, full length ≤900px  (work page; only kept when
#                                         clearly smaller than the GIF)
# Then upload with scripts/upload-variants.mjs. Usage: scripts/make-variants.sh [slug…]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.variants/assets
mkdir -p "$OUT/poster" "$OUT/anim" "$OUT/full"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

for post in _posts/*.md; do
  name=$(basename "$post" .md); slug=${name#????-??-??-}
  [ $# -gt 0 ] && [[ ! " $* " =~ " $slug " ]] && continue
  cover=$(sed -n 's/^cover: *//p' "$post" | head -1); [ -z "$cover" ] && continue
  src=".${cover}"; [ -f "$src" ] || { echo "missing $src"; continue; }

  # still: a representative frame
  [ -f "$OUT/poster/$slug.webp" ] || ff -i "$src" -vf "thumbnail=30,scale='min(480,iw)':-2" -frames:v 1 -c:v libwebp -q:v 72 "$OUT/poster/$slug.webp"

  case "$src" in *.gif) ;; *) continue ;; esac
  [ -f "$OUT/anim/$slug.webp" ] || ff -t 10 -i "$src" -vf "fps=12,scale='min(360,iw)':-2" -c:v libwebp_anim -q:v 55 -compression_level 4 -loop 0 "$OUT/anim/$slug.webp"
  if [ ! -f "$OUT/full/$slug.webp" ] && [ ! -f "$OUT/full/$slug.skip" ]; then
    ff -i "$src" -vf "scale='min(900,iw)':-2" -c:v libwebp_anim -q:v 60 -compression_level 4 -loop 0 "$OUT/full/$slug.webp"
    g=$(stat -c%s "$src"); w=$(stat -c%s "$OUT/full/$slug.webp")
    if [ $((w * 10)) -gt $((g * 7)) ]; then rm "$OUT/full/$slug.webp"; touch "$OUT/full/$slug.skip"; fi
  fi
  echo "done $slug"
done
