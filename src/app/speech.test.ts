import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalSpeech } from './speech';

class FakeUtterance { voice: unknown = null; lang = ''; rate = 1; constructor(public text: string) {} }

function synth(voices: Partial<SpeechSynthesisVoice>[]) {
  return { getVoices: () => voices as SpeechSynthesisVoice[], speak: vi.fn(), cancel: vi.fn() } as unknown as SpeechSynthesis & { speak: ReturnType<typeof vi.fn> };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('local-only speech', () => {
  it('uses only an English voice marked localService', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const fake = synth([{ name: 'Cloud', lang: 'en-US', localService: false }, { name: 'Local FR', lang: 'fr-FR', localService: true },
      { name: 'Local EN', lang: 'en-GB', localService: true }]);
    const speech = createLocalSpeech(fake);
    expect(speech.status()).toEqual({ available: true, voiceName: 'Local EN' });
    expect(speech.speak('I need water')).toBe(true);
    const utterance = fake.speak.mock.calls[0]![0] as FakeUtterance;
    expect(utterance.text).toBe('I need water');
    expect((utterance.voice as SpeechSynthesisVoice).name).toBe('Local EN');
  });

  it('never falls back to a remote voice and reports unavailability', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const fake = synth([{ name: 'Cloud', lang: 'en-US', localService: false }]);
    const speech = createLocalSpeech(fake);
    expect(speech.status()).toEqual({ available: false, voiceName: null });
    expect(speech.speak('Yes')).toBe(false);
    expect(fake.speak).not.toHaveBeenCalled();
  });

  it('picks up voices that load later and tolerates a missing speech API', () => {
    const voices: Partial<SpeechSynthesisVoice>[] = [];
    const fake = synth(voices);
    const speech = createLocalSpeech(fake);
    expect(speech.status().available).toBe(false);
    voices.push({ name: 'Late local', lang: 'en', localService: true });
    speech.refreshVoices();
    expect(speech.status().voiceName).toBe('Late local');
    const none = createLocalSpeech(undefined);
    expect(none.status().available).toBe(false);
    expect(none.speak('Yes')).toBe(false);
  });
});
