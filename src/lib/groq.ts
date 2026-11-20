const GROQ_API_KEY = process.env.GROQ_API_KEY!
const GROQ_BASE = 'https://api.groq.com/openai/v1'

export async function chatCompletion( messages: { role: string; content: string }[], model = 'llama-3.3-70b-versatile' ) {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
      temperature: 0.7
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq error: ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content as string
}

export async function transcribeAudio(audioBuffer: Buffer, filename = 'audio.webm') {
  const formData = new FormData()
  const blob = new Blob([audioBuffer], { type: 'audio/webm' })
  formData.append('file', blob, filename)
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'en')

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: formData
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper error: ${err}`)
  }

  const data = await res.json()
  return data.text as string
      }
