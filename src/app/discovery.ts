import { FEATURE_DEFINITIONS, type Baseline, type FeatureFrame, type FeatureId } from '../domain/types';
import { validateStream } from '../engine/features';
import { MOVEMENT_OPTIONS } from './movements';

/**
 * Free movement discovery (R9 revision 2). Proposes candidates from free exploration;
 * a candidate is only a pre-filled movement choice and never controls anything.
 */
export const DISCOVERY = {
  minEpisodeMs: 400, minEpisodes: 2, maxPostureShare: 0.5, groupShare: 0.6, nestedShare: 0.9,
  minValidMs: 10_000, maxCandidates: 4, captureMs: 20_000,
} as const;

export interface Channel { feature: FeatureId; direction: 1 | -1; label: string }
export interface Candidate extends Channel {
  /** Kept episodes of the primary channel ("seen N times"). */
  episodes: number;
  /** Channels grouped with this one: they move together closely enough to be the same motion. */
  companions: Channel[];
  /** Other candidate channels that often move at the same time (descriptive only). */
  alsoMoves: Channel[];
  /** Labels of already approved movements this candidate moves with; cross-checks will test them. */
  interferesWith: string[];
}
export interface DiscoveryResult { candidates: Candidate[]; validMs: number; reason: string | null }

interface Interval { start: number; end: number }
interface Track { channel: Channel; order: number; episodes: Interval[]; episodeMs: number; strength: number; nested: boolean }

const UNITS = new Map(FEATURE_DEFINITIONS.map((definition) => [definition.id as FeatureId, definition.unit]));
const sameChannel = (a: Pick<Channel, 'feature' | 'direction'>, b: Pick<Channel, 'feature' | 'direction'>) => a.feature === b.feature && a.direction === b.direction;
const plain = ({ feature, direction, label }: Channel): Channel => ({ feature, direction, label });

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function sharedMs(a: readonly Interval[], b: readonly Interval[]): number {
  let total = 0;
  for (const x of a) for (const y of b) total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  return total;
}

const intervalMs = (intervals: readonly Interval[]) => intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);

/** Personal thresholds: `on` clears what fitGesture needs; `off` means back inside the resting range. */
export function channelThresholds(baseline: Baseline, feature: FeatureId): { on: number; off: number } {
  const statistics = baseline.statistics[feature];
  const rest = Math.max(Math.abs(statistics.low - statistics.center), Math.abs(statistics.high - statistics.center));
  const on = Math.max(8 * statistics.noise, rest + 5 * statistics.noise);
  return { on, off: Math.max(on / 2, rest) };
}

export function discoverCandidates(baseline: Baseline, segments: readonly FeatureFrame[][], approved: readonly Channel[] = []): DiscoveryResult {
  // Sparse, invalid or out-of-order segments are ignored and their time does not count.
  const usable = segments.filter((segment) => validateStream(segment, 0).ok);
  const validMs = usable.reduce((sum, segment) => sum + segment[segment.length - 1]!.timestampMs - segment[0]!.timestampMs, 0);
  if (validMs < DISCOVERY.minValidMs) return { candidates: [], validMs, reason: 'Not enough clear tracking to look for movements. Try again with your face clearly in view.' };

  const tracks: Track[] = [];
  MOVEMENT_OPTIONS.forEach((option, order) => {
    const channel = plain(option);
    const center = baseline.statistics[channel.feature].center;
    const { on, off } = channelThresholds(baseline, channel.feature);
    if (UNITS.get(channel.feature) === 'coefficient' && on > (channel.direction > 0 ? 1 - center : center)) return; // unreachable
    const episodes: Interval[] = [];
    const strengths: number[] = [];
    let postureMs = 0;
    for (const segment of usable) {
      let neutralSeen = false;
      let start: number | undefined;
      let samples: number[] = [];
      segment.forEach((frame, index) => {
        const d = channel.direction * (frame.values[channel.feature]! - center);
        const next = segment[index + 1];
        if (next && d >= off) postureMs += next.timestampMs - frame.timestampMs;
        if (start === undefined) {
          if (d < off) neutralSeen = true;
          else if (d >= on && neutralSeen) { start = frame.timestampMs; samples = [d]; }
          return;
        }
        if (d >= off) { samples.push(d); return; }
        if (frame.timestampMs - start >= DISCOVERY.minEpisodeMs) {
          episodes.push({ start, end: frame.timestampMs });
          strengths.push(median(samples) / on);
        }
        start = undefined;
      });
      // A hold still running at the segment end is not counted.
    }
    if (episodes.length < DISCOVERY.minEpisodes || postureMs > DISCOVERY.maxPostureShare * validMs) return;
    tracks.push({ channel, order, episodes, episodeMs: intervalMs(episodes), strength: median(strengths), nested: false });
  });

  // A channel whose episodes lie almost entirely inside other channels' episodes ranks after independent ones.
  for (const track of tracks) {
    const others = tracks.filter((other) => other !== track).flatMap((other) => other.episodes);
    const inside = track.episodes.reduce((sum, episode) => sum + Math.min(episode.end - episode.start, sharedMs([episode], mergeIntervals(others))), 0);
    track.nested = inside >= DISCOVERY.nestedShare * track.episodeMs;
  }
  const ranked = [...tracks].sort((a, b) => Number(a.nested) - Number(b.nested) || b.episodes.length - a.episodes.length
    || b.strength - a.strength || a.order - b.order);

  // Rank-ordered grouping on mutual overlap: members join only a primary, never through each other.
  const assigned = new Set<Track>();
  const groups: Track[][] = [];
  for (const primary of ranked) {
    if (assigned.has(primary)) continue;
    assigned.add(primary);
    const group = [primary];
    for (const other of ranked) {
      if (assigned.has(other) || other.channel.feature === primary.channel.feature) continue;
      const shared = sharedMs(primary.episodes, other.episodes);
      if (shared >= DISCOVERY.groupShare * primary.episodeMs && shared >= DISCOVERY.groupShare * other.episodeMs) {
        assigned.add(other);
        group.push(other);
      }
    }
    groups.push(group);
  }

  const candidates = groups.flatMap((group): Candidate[] => {
    const [primary, ...members] = group;
    if (!primary || approved.some((channel) => sameChannel(channel, primary.channel))) return [];
    const alsoMoves = tracks.filter((track) => !group.includes(track)
      && sharedMs(primary.episodes, track.episodes) >= DISCOVERY.groupShare * Math.min(primary.episodeMs, track.episodeMs)).map((track) => track.channel);
    const companions = members.map((member) => member.channel);
    const interferesWith = approved.filter((channel) => [...companions, ...alsoMoves].some((other) => sameChannel(other, channel))).map((channel) => channel.label);
    return [{ ...primary.channel, episodes: primary.episodes.length, companions, alsoMoves, interferesWith }];
  }).slice(0, DISCOVERY.maxCandidates);

  return {
    candidates, validMs,
    reason: candidates.length ? null : 'No repeated movement was clear enough. Try again with slower, bigger movements, resting in between.',
  };
}

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}
