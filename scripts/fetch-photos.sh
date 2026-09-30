#!/bin/sh
# Télécharge les photos des activités (étape de build Docker, jamais au runtime).
# Chaque fichier doit être une vraie image < 5 Mo, sinon il est ignoré.
set -u
LIST="$1"; OUT="$2"; mkdir -p "$OUT"
grep -v '^#' "$LIST" | while read -r id url; do
  [ -z "$id" ] && continue
  case "$url" in *.webp*) ext=webp;; *.png*) ext=png;; *) ext=jpg;; esac
  tmp="$OUT/.$id"
  if curl -fsSL --proto '=https' --max-time 30 --max-filesize 5000000 -A 'Mozilla/5.0' -o "$tmp" "$url"; then
    magic=$(head -c 12 "$tmp" | od -An -tx1 | tr -d ' \n')
    case "$magic" in ffd8ff*|89504e47*|52494646????????57454250) mv "$tmp" "$OUT/$id.$ext"; echo "ok   $id";;
      *) rm -f "$tmp"; echo "skip $id (pas une image)";; esac
  else rm -f "$tmp"; echo "fail $id"; fi
done
exit 0
