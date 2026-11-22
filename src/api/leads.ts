import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req

  try {
    if (method === 'GET') {
      const { status, limit = '50' } = req.query
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit))

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data)
    }

    if (method === 'POST') {
      const { data, error } = await supabase
        .from('leads')
        .insert(req.body)
        .select()
        .single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (method === 'PATCH') {
      const { id, ...updates } = req.body
      if (!id) return res.status(400).json({ error: 'ID required' })

      const { data, error } = await supabase
        .from('leads')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'ID required' })

      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
