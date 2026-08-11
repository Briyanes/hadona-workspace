#!/bin/bash
# ============================================================
# Hadona Workspace — Database Backup Script
# Runs pg_dump against Supabase and stores compressed backup
# Usage: ./scripts/backup-database.sh
# Cron: 0 2 * * * /path/to/scripts/backup-database.sh
# ============================================================

set -euo pipefail

# --- Configuration ---
SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hadona_backup_${DATE}.sql.gz"

# --- Validate ---
if [ -z "$SUPABASE_DB_URL" ]; then
  echo "❌ ERROR: SUPABASE_DB_URL not set."
  echo "   Export it: export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'"
  exit 1
fi

# --- Create backup directory ---
mkdir -p "$BACKUP_DIR"

# --- Run backup ---
echo "🔄 Starting database backup..."
echo "   Target: $BACKUP_FILE"

if pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --clean --if-exists 2>/dev/null | gzip > "$BACKUP_FILE"; then
  FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup completed: $BACKUP_FILE ($FILESIZE)"
else
  echo "❌ Backup FAILED"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# --- Cleanup old backups ---
echo "🧹 Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "hadona_backup_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "✅ Cleanup done"

# --- List recent backups ---
echo ""
echo "📦 Recent backups:"
ls -lh "$BACKUP_DIR"/hadona_backup_*.sql.gz 2>/dev/null | tail -5