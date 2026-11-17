import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute as socialLookupExecute } from '../../src/execution/tools/socialLookup.js';

vi.mock('../../src/execution/tools/websiteAudit.js', () => ({
  execute: vi.fn().mockImplementation(async ({ url }: { url: string }) => {
    if (url.includes('invalid') || url.includes('blocked')) {
      throw new Error('Connection refused');
    }
    return {
      output: { status: 200, title: 'Profile Page' },
      evidence: `Fetched ${url}`,
    };
  }),
}));

describe('Social Lookup Tool (R-006, L10-AC-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds canonical URL from platform and handle for instagram', async () => {
    const result = await socialLookupExecute({
      platform: 'instagram',
      handle: '@yugantargrowth',
    });

    expect(result.evidence).toContain('https://www.instagram.com/yugantargrowth/');
    expect((result.output as any).profile_url).toBe('https://www.instagram.com/yugantargrowth/');
    expect((result.output as any).verified).toBe(true);
  });

  it('builds canonical URL from platform and handle for linkedin', async () => {
    const result = await socialLookupExecute({
      platform: 'linkedin',
      handle: 'yugantar-growth',
    });

    expect(result.evidence).toContain('https://www.linkedin.com/company/yugantar-growth/');
    expect((result.output as any).verified).toBe(true);
  });

  it('builds canonical URL for x / twitter', async () => {
    const result = await socialLookupExecute({
      platform: 'x',
      handle: '@shlok_pandya',
    });

    expect(result.evidence).toContain('https://x.com/shlok_pandya');
    expect((result.output as any).verified).toBe(true);
  });

  it('handles direct URL input', async () => {
    const result = await socialLookupExecute({
      platform: 'web',
      url: 'https://youtube.com/@yugantar',
    });

    expect(result.evidence).toContain('https://youtube.com/@yugantar');
    expect((result.output as any).verified).toBe(true);
  });

  it('gracefully handles unreachable profiles without crashing', async () => {
    const result = await socialLookupExecute({
      platform: 'instagram',
      handle: 'blocked_user',
    });

    expect((result.output as any).verified).toBe(false);
    expect((result.output as any).note).toContain('Connection refused');
  });

  it('throws error if neither platform nor url is supplied', async () => {
    await expect(socialLookupExecute({})).rejects.toThrow('Social lookup requires either platform or url');
  });
});
