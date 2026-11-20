import { Request, Response } from 'express'
import { transcribeAudio } from '../lib/groq'

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY!
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'

export async function voiceHandler(req: Request, res: Response) {
  const { action } = req.query

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (action === 'tts') {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: 'text required' })

    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      }
    )

    if (!elRes.ok) {
      const err = await elRes.text()
      return res.status(500).json({ error: `ElevenLabs: ${err}` })
    }

    const audioBuffer = Buffer.from(await elRes.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', audioBuffer.length)
    return res.status(200).send(audioBuffer)
  }

  if (action === 'stt') {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', async () => {
      try {
        const audioBuffer = Buffer.concat(chunks)
        const transcript = await transcribeAudio(audioBuffer)
        return res.status(200).json({ transcript })
      } catch (err: any) {
        return res.status(500).json({ error: err.message })
      }
    })
    return
  }

  return res.status(400).json({ error: 'action must be tts or stt' })
}
