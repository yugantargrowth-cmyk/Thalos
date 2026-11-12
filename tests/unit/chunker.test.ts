import { describe, it, expect } from 'vitest';

// Mirror of the chunkText function from ingestionQueue.ts
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const breakPoint = text.lastIndexOf('. ', end);
      if (breakPoint > start + chunkSize / 2) end = breakPoint + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 50);
}

describe('Document chunker', () => {
  it('returns a single chunk for text shorter than chunk size', () => {
    // Must be > 50 chars to pass the filter
    const text = 'Yugantar Growth is a digital agency based in Ahmedabad providing SEO, web development and AI automation.';
    const chunks = chunkText(text, 800, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text.trim());
  });

  it('splits long text into multiple chunks', () => {
    const sentence = 'This is a sentence about Yugantar Growth. ';
    const text = sentence.repeat(50); // ~2100 chars
    const chunks = chunkText(text, 800, 100);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('each chunk is at most chunkSize + small sentence boundary buffer', () => {
    const sentence = 'Each sentence is exactly forty characters long. ';
    const text = sentence.repeat(40);
    const chunks = chunkText(text, 400, 50);
    for (const chunk of chunks) {
      // Allow up to 150% of chunk size due to sentence boundary preference
      expect(chunk.length).toBeLessThan(600);
    }
  });

  it('filters out very short chunks (under 50 chars)', () => {
    const text = 'A'.repeat(1000) + '\n\nShort.';
    const chunks = chunkText(text, 800, 100);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(50);
    }
  });

  it('chunks overlap — end of chunk N appears in start of chunk N+1', () => {
    const sentence = 'Yugantar Growth provides digital marketing services. ';
    const text = sentence.repeat(30);
    const chunks = chunkText(text, 300, 80);
    if (chunks.length >= 2) {
      // Last 60 chars of chunk 0 should partially appear in chunk 1
      const tail = chunks[0].slice(-60);
      expect(chunks[1].slice(0, 100)).toContain(tail.slice(0, 30));
    }
  });
});
