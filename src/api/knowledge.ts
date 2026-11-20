import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../lib/supabase'
import { searchKnowledge, ingestDocument } from '../lib/rag'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req

  try {
    if (method === 'GET') {
      const { q, category } = req.query

      if (q) {
        const results = await searchKnowledge(q as string)
        return res.status(200).json(results)
      }

      let query = supabase
        .from('knowledge_chunks')
        .select('id, title, source, category, created_at')
        .order('created_at', { ascending: false })

      if (category) query = query.eq('category', category)

      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data)
    }

    if (method === 'POST') {
      const { title, content, source, category } = req.body

      if (!title || !content) {
        return res.status(400).json({ error: 'title and content required' })
      }

      const result = await ingestDocument(title, content, source || 'manual', category)
      return res.status(201).json(result)
    }

    if (method === 'DELETE') {
      const { id } = req.query

      if (!id) return res.status(400).json({ error: 'ID required' })

      const { error } = await supabase
        .from('knowledge_chunks')
        .delete()
        .eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
