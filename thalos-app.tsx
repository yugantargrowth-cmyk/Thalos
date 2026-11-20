'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────
type Environment = 'my-day' | 'revenue' | 'digital-world' | 'ai-team' | 'knowledge' | 'settings'
type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ── API helpers ────────────────────────────────────────────────────
const API = {
  token: () => typeof window !== 'undefined' ? localStorage.getItem('thalos_token') : null,

  headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token()}`
    }
  },

  async chat(message: string, history: Message[], context: string) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ message, history, context })
    })
    return res.json()
  },

  async login(pin: string) {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    })
    return res.json()
  },

  async tts(text: string): Promise<ArrayBuffer | null> {
    const res = await fetch('/api/voice?action=tts', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ text })
    })
    if (!res.ok) return null
    return res.arrayBuffer()
  },

  async stt(blob: Blob): Promise<string> {
    const res = await fetch('/api/voice?action=stt', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token()}` },
      body: blob
    })
    const data = await res.json()
    return data.transcript || ''
  }
}

// ── PIN Screen ─────────────────────────────────────────────────────
function PinScreen({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (pin.length < 4) return
    setLoading(true)
    setError('')
    const data = await API.login(pin)
    if (data.token) {
      localStorage.setItem('thalos_token', data.token)
      onAuth()
    } else {
      setError('Wrong PIN')
      setPin('')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#07111b] flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <div className="text-2xl font-bold text-white tracking-widest mb-1">THALOS</div>
        <div className="text-xs text-white/40 tracking-widest uppercase">Yugantar Growth · Intelligence Layer</div>
      </div>

      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              pin.length > i ? 'bg-white border-white' : 'border-white/30'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 w-64">
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
          <button
            key={i}
            onClick={() => {
              if (k === '⌫') setPin(p => p.slice(0,-1))
              else if (k !== '' && pin.length < 6) setPin(p => p + k)
            }}
            className={`h-14 rounded-2xl text-white font-medium text-lg transition-all ${
              k === '' ? 'invisible' : 'bg-white/10 hover:bg-white/20 active:scale-95'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {pin.length >= 4 && (
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-64 h-12 rounded-2xl bg-white text-[#07111b] font-semibold tracking-wide transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Authenticating...' : 'Enter THALOS'}
        </button>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}
    </div>
  )
}

// ── Voice Button ───────────────────────────────────────────────────
function VoiceButton({
  voiceState,
  onPress,
  onRelease
}: {
  voiceState: VoiceState
  onPress: () => void
  onRelease: () => void
}) {
  const colors = {
    idle: 'bg-white/10 border-white/20',
    recording: 'bg-red-500/30 border-red-400 animate-pulse',
    processing: 'bg-yellow-500/20 border-yellow-400',
    speaking: 'bg-blue-500/20 border-blue-400 animate-pulse'
  }

  const labels = {
    idle: '🎙 Hold to speak',
    recording: '🔴 Listening...',
    processing: '⚡ Processing...',
    speaking: '🔊 Speaking...'
  }

  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onTouchStart={e => { e.preventDefault(); onPress() }}
      onTouchEnd={e => { e.preventDefault(); onRelease() }}
      className={`px-6 py-3 rounded-full border text-white/80 text-sm transition-all select-none ${colors[voiceState]}`}
    >
      {labels[voiceState]}
    </button>
  )
}

// ── Chat Panel ─────────────────────────────────────────────────────
function ChatPanel({ environment }: { environment: Environment }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "THALOS online. What needs attention, Boss?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    const data = await API.chat(text, messages, environment)
    const reply = data.reply || 'Something went wrong. Try again.'

    setMessages([...newHistory, { role: 'assistant', content: reply }])
    setLoading(false)

    // Auto-speak if voice is enabled
    if (voiceEnabled) {
      await speakText(reply)
    }
  }

  const speakText = async (text: string) => {
    setVoiceState('speaking')
    const buffer = await API.tts(text)
    if (!buffer) { setVoiceState('idle'); return }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    const decoded = await ctx.decodeAudioData(buffer)
    const source = ctx.createBufferSource()
    source.buffer = decoded
    source.connect(ctx.destination)
    source.start()
    source.onended = () => setVoiceState('idle')
  }

  const startRecording = async () => {
    if (voiceState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => chunksRef.current.push(e.data)
      mr.start()
      mediaRecorderRef.current = mr
      setVoiceState('recording')
    } catch {
      alert('Microphone access needed for voice.')
    }
  }

  const stopRecording = async () => {
    const mr = mediaRecorderRef.current
    if (!mr) return

    mr.stop()
    mr.stream.getTracks().forEach(t => t.stop())
    setVoiceState('processing')

    await new Promise(r => mr.addEventListener('stop', r, { once: true }))
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const transcript = await API.stt(blob)

    setVoiceState('idle')
    if (transcript) await sendMessage(transcript)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Voice toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-xs text-white/40 uppercase tracking-widest">THALOS Core</span>
        <button
          onClick={() => setVoiceEnabled(v => !v)}
          className={`text-xs px-3 py-1 rounded-full border transition-all ${
            voiceEnabled ? 'border-blue-400 text-blue-400' : 'border-white/20 text-white/40'
          }`}
        >
          {voiceEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-white text-[#07111b] rounded-br-sm'
                : 'bg-white/8 text-white/90 rounded-bl-sm border border-white/10'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-white/5 space-y-3">
        {voiceEnabled && (
          <div className="flex justify-center">
            <VoiceButton
              voiceState={voiceState}
              onPress={startRecording}
              onRelease={stopRecording}
            />
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Ask THALOS anything..."
            className="flex-1 bg-white/8 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder-white/30 outline-none focus:border-white/30"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-3 bg-white text-[#07111b] rounded-2xl font-medium text-sm disabled:opacity-30 active:scale-95 transition-all"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Nav ────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: Environment; label: string; icon: string }[] = [
  { id: 'my-day', label: 'My Day', icon: '☀' },
  { id: 'revenue', label: 'Revenue', icon: '₹' },
  { id: 'digital-world', label: 'Digital', icon: '🌐' },
  { id: 'ai-team', label: 'AI Team', icon: '⚡' },
  { id: 'knowledge', label: 'Knowledge', icon: '📚' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
]

// ── Main App ───────────────────────────────────────────────────────
export default function ThalosApp() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [env, setEnv] = useState<Environment>('my-day')
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('thalos_token')
    if (token) {
      fetch('/api/auth', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.valid) setAuthed(true) })
        .finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#07111b] flex items-center justify-center">
        <div className="text-white/40 text-sm tracking-widest">THALOS</div>
      </div>
    )
  }

  if (!authed) return <PinScreen onAuth={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-[#07111b] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div>
          <div className="text-sm font-bold tracking-widest">THALOS</div>
          <div className="text-xs text-white/30 capitalize">{env.replace('-', ' ')}</div>
        </div>
        <button
          onClick={() => setChatOpen(o => !o)}
          className={`px-4 py-2 rounded-full border text-xs transition-all ${
            chatOpen ? 'border-white/40 text-white' : 'border-white/15 text-white/50'
          }`}
        >
          {chatOpen ? 'Close AI' : '⚡ Ask THALOS'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {chatOpen ? (
          <ChatPanel environment={env} />
        ) : (
          <WorkspaceContent environment={env} />
        )}
      </div>

      {/* Bottom Nav */}
      <div className="flex border-t border-white/5 bg-[#07111b]">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => { setEnv(item.id); setChatOpen(false) }}
            className={`flex-1 flex flex-col items-center py-3 gap-1 transition-all ${
              env === item.id ? 'text-white' : 'text-white/30'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span className="text-[9px] tracking-wide">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Workspace placeholder (replaced by workspace-content.tsx) ──────
function WorkspaceContent({ environment }: { environment: Environment }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white/20 text-sm">Loading {environment}...</div>
    </div>
  )
}

