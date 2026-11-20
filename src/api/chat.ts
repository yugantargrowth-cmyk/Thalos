import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chatCompletion } from '../lib/groq'
import { buildRAGContext } from '../lib/rag'
import { supabase } from '../lib/supabase'

const SYSTEM_PROMPT = `You are THALOS — the internal AI operating system for Yugantar Growth, a digital agency run by Shlok Pandya in Ahmedabad, India. You are Shlok's intelligent business partner. You help with: - Lead research and qualification - Client management and communication drafts - Revenue tracking and financial summaries - Task and project oversight - Business strategy and decisions Personality: Direct, sharp, confident. No fluff. You know Yugantar Growth inside out. Always address Shlok as "Boss" occasionally. Keep responses concise unless detail is needed. Never make up data — only use what's in context or ask Shlok to provide it.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { message, history = [], context = 'my-day' } = req.body

  if (!message) return res.status(400).json({ error: 'Message required' })

  try {
    // Build RAG context
    const ragContext = await buildRAGContext(message)

    // Build messages array
    const systemContent = ragContext
      ? `${SYSTEM_PROMPT}\n\n${ragContext}`
      : SYSTEM_PROMPT

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-10), // last 10 messages only → saves tokens
      { role: 'user', content: message }
    ]

    const reply = await chatCompletion(messages)

    // Save to chat history
    await supabase.from('chat_messages').insert([
      { role: 'user', content: message, context },
      { role: 'assistant', content: reply, context, agent: 'THALOS' }
    ])

    return res.status(200).json({ reply, context })
  } catch (err: any) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: err.message || 'Chat failed' })
  }
}