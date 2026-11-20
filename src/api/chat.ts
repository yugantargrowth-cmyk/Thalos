import { Request, Response } from 'express'
import { getSupabase } from '../lib/supabase'
import { buildRAGContext } from '../lib/rag'
import { chatCompletion } from '../lib/groq'

const SYSTEM_PROMPT = `You are THALOS — the internal AI operating system for Yugantar Growth, a digital agency run by Shlok Pandya in Ahmedabad, India.

You are Shlok's intelligent business partner. You help with:
- Lead research and qualification
- Client management and communication drafts
- Revenue tracking and financial summaries
- Task and project oversight
- Business strategy and decisions

Personality: Direct, sharp, confident. No fluff. You know Yugantar Growth inside out.
Address Shlok as "Boss" occasionally. Keep responses concise unless detail is needed.
Never make up data — only use what's in context or ask Shlok to provide it.`

export async function chatHandler(req: Request, res: Response) {
  const { message, history = [], context = 'my-day' } = req.body

  if (!message) return res.status(400).json({ error: 'Message required' })

  try {
    const ragContext = await buildRAGContext(message)

    const systemContent = ragContext
      ? `${SYSTEM_PROMPT}\n\n${ragContext}`
      : SYSTEM_PROMPT

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-10),
      { role: 'user', content: message }
    ]

    const reply = await chatCompletion(messages)

    await getSupabase().from('chat_messages').insert([
      { role: 'user', content: message, context },
      { role: 'assistant', content: reply, context, agent: 'THALOS' }
    ])

    return res.status(200).json({ reply, context })
  } catch (err: any) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: err.message || 'Chat failed' })
  }
}
