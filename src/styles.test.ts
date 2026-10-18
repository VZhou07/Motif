import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Static checks of the stylesheet for screens the fake-camera browser check cannot reach (R10). */
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** The text colour declared in the first rule for exactly this selector. */
function colorOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const match = new RegExp(`(?:^|})${escaped}\\{[^}]*?(?:^|;|\\{)color:(#[0-9a-f]{6})`, 'i').exec(css);
  if (!match) throw new Error(`no colour for ${selector}`);
  return match[1]!.toLowerCase();
}

describe('stylesheet legibility', () => {
  it('declares no text smaller than 12 px', () => {
    const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((match) => Number(match[1]) < 12).map((match) => match[0]);
    expect(small).toEqual([]);
  });

  it('keeps communication-screen text at 14 px or more and the message at 24 px or more', () => {
    const block = css.slice(css.indexOf('/* Communication screen (UX comm)'));
    const sizes = [...block.matchAll(/([^{}]+)\{[^}]*?font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => [match[1]!.trim(), Number(match[2])] as const);
    expect(sizes.length).toBeGreaterThan(10);
    expect(sizes.filter(([, size]) => size < 14)).toEqual([]);
    for (const selector of ['.message-text', '.message-ask']) {
      expect(sizes.find(([name]) => name === selector)?.[1]).toBeGreaterThanOrEqual(24);
    }
    expect(sizes.find(([name]) => name === '.message-text.message-placeholder')?.[1]).toBeGreaterThanOrEqual(24);
  });

  // Text on backgrounds only reachable after calibration (the fake camera never shows a face).
  const pairs: Array<[selector: string, background: string, where: string]> = [
    ['.message-placeholder', '#edf2e7', 'empty message in the composer'],
    ['.feature-button>span', '#fdfefa', 'live deviation on a movement choice'],
    ['.feature-button>span', '#e1ecda', 'live deviation on a pressed movement choice'],
    ['.result-card>p', '#eef3e6', 'result card notes'],
    ['.timer>small', '#e0ecdb', 'capture timer while moving'],
  ];
  it.each(pairs)('%s reaches 4.5:1 (%s, %s)', (selector, background) => {
    expect(contrast(colorOf(selector), background)).toBeGreaterThanOrEqual(4.5);
  });
});
