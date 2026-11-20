import { Request, Response } from 'express'
import { getSupabase } from '../lib/supabase'
import { randomUUID } from 'crypto'

export async function authHandler(req: Request, res: Response) {
  if (req.method === 'POST') {
    const { pin } = req.body
    const correctPin = process.env.THALOS_PIN

    if (!pin || pin !== correctPin) {
      return res.status(401).json({ error: 'Invalid PIN' })
    }

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await getSupabase().from('thalos_sessions').insert({
      token,
      expires_at: expiresAt.toISOString()
    })

    return res.status(200).json({ token, expires_at: expiresAt })
  }

  if (req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'No token' })

    const { data } = await getSupabase()
      .from('thalos_sessions')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!data) return res.status(401).json({ error: 'Session expired' })
    return res.status(200).json({ valid: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
