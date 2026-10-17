#!/usr/bin/env bash
# Sauvegarde quotidienne de la base (3 h du matin, heure du serveur) au format pg_dump compressé.
# Conserve BACKUP_KEEP_DAYS jours. Copie hors du serveur : voir docs/deploiement.md (rclone / S3).
set -euo pipefail
keep="${BACKUP_KEEP_DAYS:-30}"
echo "Sauvegardes : /backups (conservation ${keep} jours)"
while true; do
  now=$(date +%s)
  next=$(date -d "tomorrow 03:00" +%s)
  # Première sauvegarde immédiate au démarrage, puis chaque nuit.
  file="/backups/yaoma-$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump -h db -U yaoma -d yaoma -Fc -Z 9 -f "${file}.tmp"; then
    mv "${file}.tmp" "${file}"
    echo "$(date -Is) sauvegarde OK : ${file} ($(du -h "${file}" | cut -f1))"
  else
    echo "$(date -Is) ÉCHEC de la sauvegarde" >&2
    rm -f "${file}.tmp"
  fi
  find /backups -name 'yaoma-*.dump' -mtime +"${keep}" -delete
  sleep $(( next - now ))
done
