import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The project stylesheet test only reads src/styles.css, so the dashboard checks its own file (design B7). */
const css = readFileSync(resolve(process.cwd(), 'src/features/caregiver/caregiver.css'), 'utf8');

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
function rules(): Array<{ selector: string; body: string }> {
  const flat = css.replace(/@media[^{]*\{/g, '').replace(/\}\s*\}/g, '}');
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1]!.trim(), body: match[2]! }));
}
function declared(selector: string, property: 'color' | 'background'): string {
  const rule = rules().find((entry) => entry.selector === selector);
  const match = rule && new RegExp(`(?:^|;)${property}:(#[0-9a-f]{6})`, 'i').exec(rule.body);
  if (!match) throw new Error(`no ${property} for ${selector}`);
  return match[1]!.toLowerCase();
}

describe('caregiver stylesheet', () => {
  it('namespaces every selector with .cg-', () => {
    const outside = rules().flatMap((rule) => rule.selector.split(',')).map((part) => part.trim()).filter((part) => !part.startsWith('.cg-'));
    expect(outside).toEqual([]);
  });

  it('declares no text smaller than 12 px', () => {
    const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((match) => Number(match[1]) < 12).map((match) => match[0]);
    expect(small).toEqual([]);
  });

  it('keeps interactive targets at least 44 px tall', () => {
    const heights = [...css.matchAll(/min-height:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((height) => height >= 44)).toBe(true);
  });

  const pairs: Array<[foreground: string, background: string]> = [
    [declared('.cg-dashboard', 'color'), declared('.cg-dashboard', 'background')],
    [declared('.cg-muted', 'color'), declared('.cg-panel', 'background')],
    [declared('.cg-muted', 'color'), declared('.cg-dashboard', 'background')],
    [declared('.cg-note', 'color'), declared('.cg-dashboard', 'background')],
    [declared('.cg-badge', 'color'), declared('.cg-badge', 'background')],
    [declared('.cg-badge-lost', 'color'), declared('.cg-badge-lost', 'background')],
    [declared('.cg-alert', 'color'), declared('.cg-alert', 'background')],
    [declared('.cg-card-status', 'color'), declared('.cg-card-new', 'background')],
    [declared('.cg-new', 'color'), declared('.cg-card-new', 'background')],
    [declared('.cg-card-quiet', 'color'), declared('.cg-card', 'background')],
    [declared('.cg-code', 'color'), declared('.cg-invite', 'background')],
    [declared('.cg-confirm p', 'color'), declared('.cg-confirm', 'background')],
  ];
  it.each(pairs)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
