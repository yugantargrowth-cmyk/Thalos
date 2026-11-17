/**
 * Social Lookup Tool
 * ─────────────────────────────────────────────────────────────
 * Resolves social media profiles by platform, handle, or URL (Resolves R-006).
 * Enforces SSRF protection on all outbound requests.
 */

import { execute as websiteAuditExecute } from './websiteAudit.js';

export interface SocialLookupInputs {
  platform: 'instagram' | 'linkedin' | 'facebook' | 'youtube' | 'x' | string;
  handle?: string;
  url?: string;
}

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: unknown;
  evidence: string;
}> {
  const platform = ((inputs.platform as string) || '').toLowerCase().trim();
  const handle = ((inputs.handle as string) || '').trim();
  let url = ((inputs.url as string) || '').trim();

  if (!platform && !url) {
    throw new Error('Social lookup requires either platform or url');
  }

  // If URL not directly provided, build canonical profile URL from platform and handle
  if (!url && handle) {
    const cleanHandle = handle.replace(/^@/, '');
    switch (platform) {
      case 'instagram':
        url = `https://www.instagram.com/${cleanHandle}/`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/company/${cleanHandle}/`;
        break;
      case 'x':
      case 'twitter':
        url = `https://x.com/${cleanHandle}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/${cleanHandle}/`;
        break;
      case 'youtube':
        url = `https://www.youtube.com/@${cleanHandle}`;
        break;
      default:
        url = `https://${platform}.com/${cleanHandle}`;
    }
  }

  if (!url) {
    throw new Error('Social lookup requires a valid profile handle or direct URL');
  }

  // Execute website audit check with SSRF validation
  try {
    const auditResult = await websiteAuditExecute({ url });
    return {
      output: {
        platform: platform || 'web',
        handle: handle || null,
        profile_url: url,
        audit: auditResult.output,
        verified: true,
      },
      evidence: `Profile verified at ${url}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      output: {
        platform: platform || 'web',
        handle: handle || null,
        profile_url: url,
        verified: false,
        note: msg,
      },
      evidence: `Lookup attempted for ${url}: ${msg}`,
    };
  }
}
