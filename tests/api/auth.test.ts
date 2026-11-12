import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

// Test the JWT logic in isolation — no live server needed
const TEST_SECRET = 'test_jwt_secret_at_least_32_chars_long_ok';

function issueTestToken(): string {
  return jwt.sign({ sub: 'owner', role: 'owner' }, TEST_SECRET, { expiresIn: 86400 });
}

describe('JWT auth', () => {
  it('issues a valid token', () => {
    const token = issueTestToken();
    expect(token).toBeTruthy();
    const payload = jwt.verify(token, TEST_SECRET) as { sub: string; role: string };
    expect(payload.sub).toBe('owner');
    expect(payload.role).toBe('owner');
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'owner', role: 'owner' }, TEST_SECRET, { expiresIn: -1 });
    expect(() => jwt.verify(expired, TEST_SECRET)).toThrow('jwt expired');
  });

  it('rejects a token signed with wrong secret', () => {
    const token = jwt.sign({ sub: 'owner', role: 'owner' }, 'wrong_secret', { expiresIn: 86400 });
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });

  it('rejects a tampered token payload', () => {
    const token = issueTestToken();
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.role = 'admin';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = parts.join('.');
    expect(() => jwt.verify(tampered, TEST_SECRET)).toThrow();
  });

  it('token contains expected claims', () => {
    const token = issueTestToken();
    const payload = jwt.decode(token) as { sub: string; role: string; iat: number; exp: number };
    expect(payload.sub).toBe('owner');
    expect(payload.role).toBe('owner');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});
