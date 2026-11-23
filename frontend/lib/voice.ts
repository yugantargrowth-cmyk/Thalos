export interface VoiceSettings {
  enabled: boolean;
  provider: 'web_speech' | 'elevenlabs' | 'custom_voice';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  autoSpeak: boolean;
  voiceName?: string;
  customVoicePackName?: string;
  customVoicePackData?: string;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  provider: 'web_speech',
  autoSpeak: true,
  elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
};

const STORAGE_KEY = 'thalos_voice_settings';

export function getStoredVoiceSettings(): VoiceSettings {
  if (typeof window === 'undefined') return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(
      new CustomEvent('thalos_voice_settings_changed', { detail: settings })
    );
  } catch (e) {
    console.warn('Failed to save voice settings:', e);
  }
}

/**
 * Strips markdown symbols, code blocks, and URLs for natural voice delivery
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[*#_~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let activeAudioElement: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement.currentTime = 0;
    activeAudioElement = null;
  }
}

/**
 * Synthesizes and plays speech using ElevenLabs (if configured) or native Web Speech API
 */
export async function speakResponse(
  text: string,
  settings?: VoiceSettings
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const config = settings || getStoredVoiceSettings();
  if (!config.enabled) return false;

  stopSpeaking();
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return false;

  // 1. Try ElevenLabs if configured
  if (config.provider === 'elevenlabs' && config.elevenLabsApiKey?.trim()) {
    try {
      const voiceId = config.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': config.elevenLabsApiKey.trim(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: cleaned,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (res.ok) {
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        activeAudioElement = audio;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          if (activeAudioElement === audio) activeAudioElement = null;
        };
        await audio.play();
        return true;
      } else {
        const errText = await res.text();
        console.warn('ElevenLabs TTS failed, falling back to Web Speech API:', errText);
      }
    } catch (err) {
      console.warn('ElevenLabs playback error, falling back to Web Speech:', err);
    }
  }

  // 2. Default: Native Web Speech API (Works on desktop Chrome/Edge/Safari & Android)
  if ('speechSynthesis' in window) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Find best English voice
        const englishVoice =
          voices.find(
            (v) =>
              (v.name.includes('Natural') ||
                v.name.includes('Google') ||
                v.name.includes('Samantha') ||
                v.name.includes('Enhanced')) &&
              v.lang.startsWith('en')
          ) || voices.find((v) => v.lang.startsWith('en'));

        if (englishVoice) {
          utterance.voice = englishVoice;
        }
      }

      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);

      window.speechSynthesis.speak(utterance);
    });
  }

  return false;
}

/**
 * Initialize Web Speech API Recognition for voice input (Android & Desktop)
 */
export function createSpeechRecognizer(
  onResult: (transcript: string, isFinal: boolean) => void,
  onEnd: () => void,
  onError: (err: string) => void
): any | null {
  if (typeof window === 'undefined') return null;

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError('Speech recognition not supported in this browser. Please use Chrome, Edge, Safari, or an Android browser.');
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      onResult(final || interim, Boolean(final));
    };

    recognition.onerror = (event: any) => {
      onError(event.error || 'Speech recognition error');
    };

    recognition.onend = () => {
      onEnd();
    };

    return recognition;
  } catch (e: any) {
    onError(e?.message || 'Failed to initialize speech recognition');
    return null;
  }
}
