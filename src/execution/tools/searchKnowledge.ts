import { hybridSearch } from '../../persistence/ragSearch.js';

export async function execute(inputs: Record<string, unknown>): Promise<{
  output: unknown; evidence: string;
}> {
  const query = inputs.query as string;
  if (!query?.trim()) throw new Error('query is required');

  const topK = (inputs.top_k as number) ?? 5;
  const category = inputs.category as string | undefined;

  const results = await hybridSearch({ query, topK, category });

  return {
    output: { results, query, count: results.length },
    evidence: `${results.length} chunks retrieved for query "${query.slice(0, 60)}" at ${new Date().toISOString()}`,
  };
}
