import { NextResponse } from 'next/server';


interface ChatRequestBody {
  message: string;
  history?: Array<{ role: string; content?: string; text?: string }>;
  context?: any;
  model?: string;
  provider?: string;
}

interface RAGChunk {
  content: string;
  title?: string;
  section_title?: string;
  source_url?: string;
  metadata?: any;
}

/**
 * Perform full-text search against Supabase knowledge_chunks table
 */
async function searchKnowledgeChunks(
  supabaseUrl: string,
  supabaseKey: string,
  query: string
): Promise<RAGChunk[]> {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // Build clean search query terms for full-text search
  const keywords = query
    .replace(/[^\w\s]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);

  const term = keywords.join(' & ');
  const simpleQuery = encodeURIComponent(term || query.trim());

  const endpoints = [
    // 1. PostgREST full-text search on knowledge_chunks fts_vector
    `${cleanUrl}/rest/v1/knowledge_chunks?fts_vector=wfts(english).${simpleQuery}&select=content,title,metadata&limit=5`,
    // 2. Full-text search on knowledge_chunks content
    `${cleanUrl}/rest/v1/knowledge_chunks?content=wfts(english).${simpleQuery}&select=content,title,metadata&limit=5`,
    // 3. Fallback to knowledge_chunks basic fts
    `${cleanUrl}/rest/v1/knowledge_chunks?content=fts(english).${simpleQuery}&select=content,title,metadata&limit=5`,
    // 4. Fallback to document_chunks table if knowledge_chunks is mapped to document_chunks
    `${cleanUrl}/rest/v1/document_chunks?fts_vector=wfts(english).${simpleQuery}&select=content,section_title,source_url&limit=5`,
    `${cleanUrl}/rest/v1/document_chunks?content=wfts(english).${simpleQuery}&select=content,section_title,source_url&limit=5`,
    // 5. Fallback to knowledge_nodes table
    `${cleanUrl}/rest/v1/knowledge_nodes?fts_vector=wfts(english).${simpleQuery}&select=content,title,tags&limit=5`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data as RAGChunk[];
        }
      }
    } catch {
      // Continue to next fallback endpoint
    }
  }

  return [];
}

/**
 * Persist conversation messages to chat_messages table
 */
async function saveMessages(
  supabaseUrl: string,
  supabaseKey: string,
  userMessage: string,
  assistantReply: string,
  extraContext?: any
): Promise<void> {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const timestamp = new Date().toISOString();

  // Try standard { role, content, created_at } insert
  try {
    const payload = [
      { role: 'user', content: userMessage, created_at: timestamp },
      { role: 'assistant', content: assistantReply, created_at: timestamp },
    ];

    const res = await fetch(`${cleanUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) return;

    // Secondary attempt with { role, message } schema
    const payloadAlt = [
      { role: 'user', message: userMessage, created_at: timestamp },
      { role: 'assistant', message: assistantReply, created_at: timestamp },
    ];

    const resAlt = await fetch(`${cleanUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payloadAlt),
    });

    if (resAlt.ok) return;

    // Single-row attempt { user_message, reply }
    await fetch(`${cleanUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_message: userMessage,
        reply: assistantReply,
        created_at: timestamp,
      }),
    });
  } catch (err) {
    console.warn('Failed to save to chat_messages table:', err);
  }

  // Also backup to conversations table if available
  try {
    const sessionDate = timestamp.split('T')[0];
    await fetch(`${cleanUrl}/rest/v1/conversations`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        session_date: sessionDate,
        messages: [
          { role: 'user', content: userMessage, timestamp },
          { role: 'assistant', content: assistantReply, timestamp },
        ],
      }),
    });
  } catch {
    // Ignore conversation table backup error
  }
}

/**
 * THALOS Chat Serverless Route Handler
 */
export async function POST(req: Request) {
  try {
    const body: ChatRequestBody = await req.json();
    const { message, history = [], context } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'A valid non-empty message is required.' },
        { status: 400 }
      );
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
    let ragChunks: RAGChunk[] = [];
    if (supabaseUrl && supabaseKey) {
      try {
        ragChunks = await searchKnowledgeChunks(
          supabaseUrl,
          supabaseKey,
          trimmedMessage
        );
      } catch (err) {
        console.warn('RAG search encountered an error:', err);
      }
    }

    const ragContextText = ragChunks
      .map((c, i) => `[Source ${i + 1}${c.title ? `: ${c.title}` : ''}]\n${c.content}`)
      .join('\n\n');

    // 2. Prepare system prompt and message history
    const systemPrompt = `You are THALOS, the Agentic AI Business Operating System for Yugantar Growth, owned and operated by Shlok Pandya.
You are the founder-facing orchestrator. You are direct, sharp, professional, and outcome-oriented.

Key Operating Principles:
1. You assist Shlok in managing revenue, leads, client operations, agency growth, and business intelligence.
2. Direct, short, confident answers (Simple, Short, Smooth).
3. Lead with the outcome, not the process.
4. If knowledge or tools do not provide an answer, honestly state what is known and what requires verification.
${
  ragContextText
    ? `\n\nRelevant Business Knowledge:\n${ragContextText}`
    : ''
}
${
  context
    ? `\n\nAdditional Context:\n${
        typeof context === 'string' ? context : JSON.stringify(context, null, 2)
      }`
    : ''
}`;

    const formattedMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [{ role: 'system', content: systemPrompt }];

    // Incorporate normalized history
    if (Array.isArray(history)) {
      for (const item of history) {
        if (!item) continue;
        const role =
          item.role === 'assistant' || item.role === 'system'
            ? item.role
            : 'user';
        const content = item.content || item.text || '';
        if (content.trim()) {
          formattedMessages.push({ role, content: content.trim() });
        }
      }
    }

    // Append current user message
    formattedMessages.push({ role: 'user', content: trimmedMessage });

    // 3. Call Groq with LLaMA 3.3 70B
    let reply = '';
    let tokensUsed = 0;
    const modelUsed = 'llama-3.3-70b-versatile';

    if (!groqApiKey) {
      reply = `I received your outcome request: "${trimmedMessage}".\n\nGroq API key is not configured in Vercel environment variables (GROQ_API_KEY). Please configure GROQ_API_KEY in your Vercel project settings to enable real-time LLaMA 3.3 70B reasoning.`;
    } else {
      const groqResponse = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelUsed,
            messages: formattedMessages,
            temperature: 0.4,
            max_tokens: 2048,
          }),
        }
      );

      if (!groqResponse.ok) {
        const errorText = await groqResponse.text();
        console.error('Groq API error:', groqResponse.status, errorText);
        reply = `THALOS intelligence experienced an upstream provider error (${groqResponse.status}). Please verify the Groq API key and rate limits.`;
      } else {
        const groqData = await groqResponse.json();
        reply =
          groqData.choices?.[0]?.message?.content ||
          'Outcome analyzed and executed.';
        tokensUsed = groqData.usage?.total_tokens || 0;
      }
    }

    // 4. Save messages to chat_messages table if Supabase is configured
    if (supabaseUrl && supabaseKey) {
      saveMessages(supabaseUrl, supabaseKey, trimmedMessage, reply, context).catch(
        (err) => console.warn('Background message save error:', err)
      );
    }

    // 5. Return { reply, context } along with response and model_used for UI compatibility
    return NextResponse.json({
      reply,
      response: reply,
      context: ragChunks,
      model_used: modelUsed,
      tokens_used: tokensUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/intelligence/chat route:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Internal Server Error in THALOS Intelligence',
      },
      { status: 500 }
    );
  }
}
