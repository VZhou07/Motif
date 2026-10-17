import type { SpeechPort } from './types';

export interface LocalSpeech extends SpeechPort {
  /** Re-reads the voice list (browsers load voices asynchronously). */
  refreshVoices(): void;
}

/**
 * Browser speech restricted to voices marked `localService` in English (UA2).
 * There is deliberately no remote-voice fallback: without a local voice, `speak`
 * returns false and the app keeps the message visible with an explanation.
 */
export function createLocalSpeech(synth: SpeechSynthesis | undefined = globalThis.speechSynthesis): LocalSpeech {
  let voice: SpeechSynthesisVoice | null = null;
  const refreshVoices = (): void => {
    const voices = typeof synth?.getVoices === 'function' ? synth.getVoices() : [];
    voice = voices.find((candidate) => candidate.localService && /^en([-_]|$)/i.test(candidate.lang)) ?? null;
  };
  refreshVoices();
  return {
    refreshVoices,
    status: () => ({ available: voice !== null, voiceName: voice?.name ?? null }),
    speak(text: string): boolean {
      if (!synth || !voice || typeof SpeechSynthesisUtterance === 'undefined' || !text.trim()) return false;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95;
      synth.speak(utterance);
      return true;
    },
    cancel(): void { synth?.cancel(); },
  };
}
