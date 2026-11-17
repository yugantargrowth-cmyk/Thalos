# Runbook: Backup & Restore

## Scope & Target
This runbook covers the procedures for backing up and restoring PostgreSQL data in Supabase and the encrypted credentials for THALOS.

## 1. Automated Backups (Supabase)
- **Point-in-Time Recovery (PITR)** / Daily Snapshots: Managed via Supabase project settings.
- Ensure daily scheduled backups are enabled in the Supabase Dashboard under `Database -> Backups`.

## 2. Manual Backup Procedure (pg_dump)
Run this command from a secure administrative terminal with `pg_dump` installed:

```bash
pg_dump "postgres://postgres.[YOUR-PROJECT-REF]:[YOUR-DB-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres" \
  --schema=public \
  --file="thalos_backup_$(date +%Y%m%d_%H%M%S).sql" \
  --clean \
  --if-exists
```

### Encryption of Backup Files:
Always encrypt the backup file before storing or transferring:
```bash
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in thalos_backup_*.sql \
  -out thalos_backup_*.sql.enc
```

## 3. Restore Procedure
To restore into a clean or recovery database instance:

```bash
# Decrypt the backup
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in thalos_backup_*.sql.enc \
  -out thalos_backup_restore.sql

# Restore using psql
psql "postgres://postgres.[YOUR-PROJECT-REF]:[YOUR-DB-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres" \
  -f thalos_backup_restore.sql
```

## 4. Key Management & Vault Secrets
The encrypted credentials stored in table `integrations` require the `CREDENTIAL_MASTER_KEY` env var to decrypt.
- Back up `CREDENTIAL_MASTER_KEY` in an offline password manager / hardware vault.
- Without `CREDENTIAL_MASTER_KEY`, the database backup is securely sealed and credentials cannot be recovered.
