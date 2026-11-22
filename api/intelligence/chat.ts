interface ChatRequestBody {
  message: string;
  history?: Array<{ role: string; content?: string; text?: string; [key: string]: any }>;
  context?: any;
  model?: string;
  provider?: string;
}

interface KnowledgeChunk {
  id?: string;
  title?: string;
  content: string;
  source?: string;
  category?: string;
  [key: string]: any;
}

const SYSTEM_PROMPT = `You are THALOS — the internal AI operating system for Yugantar Growth, a digital agency run by Shlok Pandya in Ahmedabad, India.

You are Shlok's intelligent business partner. You help with:
- Lead research and qualification
- Client management and communication drafts
- Revenue tracking and financial summaries
- Task and project oversight
- Business strategy and decisions

Personality: Direct, sharp, confident. No fluff. You know Yugantar Growth inside out.
Address Shlok as "Boss" occasionally. Keep responses concise unless detail is needed.
Never make up data — only use what's in context or ask Shlok to provide it.`;

async function searchKnowledge(
  supabaseUrl: string,
  supabaseKey: string,
  query: string,
  limit = 5
): Promise<KnowledgeChunk[]> {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const rpcRes = await fetch(`${cleanUrl}/rest/v1/rpc/search_knowledge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query_text: query, match_count: limit }),
      cache: 'no-store',
    });
    if (rpcRes.ok) {
      const data = await rpcRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return data as KnowledgeChunk[];
      }
    }
  } catch (err) {
    console.warn('[THALOS Chat] search_knowledge RPC failed, attempting direct table search:', err);
  }

  const cleanQuery = query
    .replace(/[^\w\s]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(' & ');

  const encodedQuery = encodeURIComponent(cleanQuery || query.trim());

  const searchUrls = [
    `${cleanUrl}/rest/v1/knowledge_chunks?fts_vector=wfts(english).${encodedQuery}&select=id,title,content,source,category&limit=${limit}`,
    `${cleanUrl}/rest/v1/knowledge_chunks?content=wfts(english).${encodedQuery}&select=id,title,content,source,category&limit=${limit}`,
    `${cleanUrl}/rest/v1/knowledge_chunks?content=fts(english).${encodedQuery}&select=id,title,content,source,category&limit=${limit}`,
    `${cleanUrl}/rest/v1/document_chunks?fts_vector=wfts(english).${encodedQuery}&select=id,section_title,content,source_url&limit=${limit}`,
    `${cleanUrl}/rest/v1/knowledge_nodes?fts_vector=wfts(english).${encodedQuery}&select=id,title,content,tags,category&limit=${limit}`,
  ];

  for (const url of searchUrls) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data as KnowledgeChunk[];
        }
      }
    } catch {
      // Continue to next fallback
    }
  }

  return [];
}

async function buildRAGContext(
  supabaseUrl: string,
  supabaseKey: string,
  query: string
): Promise<{ text: string; chunks: KnowledgeChunk[] }> {
  if (!supabaseUrl || !supabaseKey) {
    return { text: '', chunks: [] };
  }

  try {
    const chunks = await searchKnowledge(supabaseUrl, supabaseKey, query, 5);
    if (!chunks || chunks.length === 0) {
      return { text: '', chunks: [] };
    }

    const contextContent = chunks
      .map((c, i) => `[${i + 1}] ${c.title || c.section_title || 'Knowledge Chunk'}\n${c.content}`)
      .join('\n\n');

    const formatted = `Relevant context from Yugantar Growth knowledge base:\n\n${contextContent}\n\n---`;
    return { text: formatted, chunks };
  } catch (err) {
    console.warn('[THALOS Chat] Failed to build RAG context:', err);
    return { text: '', chunks: [] };
  }
}

async function saveToChatMessages(
  supabaseUrl: string,
  supabaseKey: string,
  userMessage: string,
  assistantReply: string,
  contextValue: any
): Promise<void> {
  if (!supabaseUrl || !supabaseKey) return;

  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const contextStr = typeof contextValue === 'string' ? contextValue : JSON.stringify(contextValue ?? 'my-day');

  try {
    const payload = [
      { role: 'user', content: userMessage, context: contextStr },
      { role: 'assistant', content: assistantReply, context: contextStr, agent: 'THALOS' },
    ];

    const res = await fetch(`${cleanUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) return;

    await fetch(`${cleanUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        { role: 'user', message: userMessage },
        { role: 'assistant', message: assistantReply },
      ]),
    });
  } catch (err) {
    console.warn('[THALOS Chat] Failed to save to chat_messages table:', err);
  }
}

async function callGroqCompletion(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  model = 'llama-3.3-70b-versatile'
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content || '';
}

async function processChat(body: ChatRequestBody) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!supabaseUrl) {
    console.warn('[THALOS Chat Route] Warning: SUPABASE_URL environment variable is undefined');
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.warn('[THALOS Chat Route] Warning: SUPABASE_SERVICE_KEY environment variable is undefined');
  }
  if (!groqApiKey) {
    console.warn('[THALOS Chat Route] Warning: GROQ_API_KEY environment variable is undefined');
  }

  const { message, history = [], context = 'my-day', model } = body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return { status: 400, data: { error: 'Message required' } };
  }

  const trimmedMessage = message.trim();

  const { text: ragContext, chunks } = await buildRAGContext(
    supabaseUrl || '',
    supabaseServiceKey || '',
    trimmedMessage
  );

  const systemContent = ragContext
    ? `${SYSTEM_PROMPT}\n\n${ragContext}`
    : SYSTEM_PROMPT;

  const formattedHistory: Array<{ role: string; content: string }> = [];
  if (Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      if (!h) continue;
      const role =
        h.role === 'assistant' || h.role === 'system' ? h.role : 'user';
      const content = h.content || h.text || '';
      if (typeof content === 'string' && content.trim()) {
        formattedHistory.push({ role, content: content.trim() });
      }
    }
  }

  const messages = [
    { role: 'system', content: systemContent },
    ...formattedHistory,
    { role: 'user', content: trimmedMessage },
  ];

  const activeModel = model || 'llama-3.3-70b-versatile';
  let reply = '';

  if (!groqApiKey) {
    reply = `I received your outcome request: "${trimmedMessage}".\n\nNo live Groq API key is configured yet. Please configure GROQ_API_KEY in your Vercel project environment variables.\n\nOnce entered, THALOS will execute real-time reasoning using LLaMA 3.3 70B.`;
  } else {
    reply = await callGroqCompletion(groqApiKey, messages, activeModel);
  }

  if (supabaseUrl && supabaseServiceKey) {
    saveToChatMessages(
      supabaseUrl,
      supabaseServiceKey,
      trimmedMessage,
      reply,
      context
    ).catch((err) => console.warn('[THALOS Chat] Background message save error:', err));
  }

  return {
    status: 200,
    data: {
      reply,
      response: reply,
      context: chunks.length > 0 ? chunks : context,
      model_used: activeModel,
    },
  };
}

export async function POST(request: Request) {
  try {
    let body: ChatRequestBody;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const result = await processChat(body);
    return Response.json(result.data, { status: result.status });
  } catch (err: any) {
    console.error('Error in /api/intelligence/chat route handler:', err);
    return Response.json(
      { error: err?.message || 'Chat failed', stack: err?.stack || undefined },
      { status: 500 }
    );
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const result = await processChat(body);
    return res.status(result.status).json(result.data);
  } catch (err: any) {
    console.error('Error in /api/intelligence/chat handler:', err);
    return res.status(500).json({ error: err?.message || 'Chat failed', stack: err?.stack || undefined });
  }
}
