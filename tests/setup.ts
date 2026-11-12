// Global test environment bootstrap
// Sets all required env vars before any module is imported
// This file is loaded by vitest BEFORE each test file via setupFiles

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_placeholder';
process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_chars_long_okay';
process.env.OWNER_PIN_HASH = '$2b$12$KtesttestKtesttest.KtesttestKtesttestKtesttest';
process.env.CREDENTIAL_MASTER_KEY = 'a'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
process.env.LOG_LEVEL = 'silent';
