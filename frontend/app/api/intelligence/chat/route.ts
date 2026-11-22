import { NextResponse } from 'next/server';

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

/**
 * Searches knowledge_chunks via Supabase full-text search and RPC search_knowledge
 */
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

  // 1. Try search_knowledge RPC
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
    console.warn('search_knowledge RPC failed, attempting direct table search:', err);
  }

  // 2. Query knowledge_chunks via PostgREST full-text search
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

/**
 * Builds formatted RAG context from knowledge chunks
 */
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
    console.warn('Failed to build RAG context:', err);
    return { text: '', chunks: [] };
  }
}

/**
 * Persists user and assistant messages into chat_messages table
 */
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

    // Alternative schema fallback if columns differ
    await fetch(`${cleanUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        { role: 'user', message: userMessage },
        { role: 'assistant', message: assistantReply },
      ]),
    });
  } catch (err) {
    console.warn('Failed to save to chat_messages table:', err);
  }
}

/**
 * Call Groq LLaMA 3.3 70B completions endpoint
 */
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

/**
 * POST /api/intelligence/chat handler
 */
export async function POST(req: Request) {
  try {
    const body: ChatRequestBody = await req.json();
    const { message, history = [], context = 'my-day', model } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const trimmedMessage = message.trim();

    // Environment variables
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '';
    const groqApiKey = process.env.GROQ_API_KEY || '';

    // 1. Build RAG context from knowledge_chunks via Supabase full-text search
    const { text: ragContext, chunks } = await buildRAGContext(
      supabaseUrl,
      supabaseKey,
      trimmedMessage
    );

    const systemContent = ragContext
      ? `${SYSTEM_PROMPT}\n\n${ragContext}`
      : SYSTEM_PROMPT;

    // 2. Prepare message history and format
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

    // 3. Call Groq LLaMA 3.3 70B
    const activeModel = model || 'llama-3.3-70b-versatile';
    let reply = '';

    if (!groqApiKey) {
      reply = `I received your outcome request: "${trimmedMessage}".\n\nNo live Groq API key is configured yet. Please configure GROQ_API_KEY in your Vercel project environment variables.\n\nOnce entered, THALOS will execute real-time reasoning using LLaMA 3.3 70B.`;
    } else {
      reply = await callGroqCompletion(groqApiKey, messages, activeModel);
    }

    // 4. Save messages to chat_messages table (asynchronous / non-blocking)
    if (supabaseUrl && supabaseKey) {
      saveToChatMessages(
        supabaseUrl,
        supabaseKey,
        trimmedMessage,
        reply,
        context
      ).catch((err) => console.warn('Background message save error:', err));
    }

    // 5. Return { reply, context } and backwards-compatible fields
    return NextResponse.json({
      reply,
      response: reply,
      context: chunks.length > 0 ? chunks : context,
      model_used: activeModel,
    });
  } catch (err: any) {
    console.error('Chat error in /api/intelligence/chat:', err);
    return NextResponse.json(
      { error: err?.message || 'Chat failed' },
      { status: 500 }
    );
  }
}
