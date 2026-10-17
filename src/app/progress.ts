import type { SessionSnapshot } from './types';

export interface SetupProgress { segments: string[]; current: number | null }

const FIRST = ['Rest', 'Movement', 'Record', 'Checks', 'Everyday', 'Approve'];
const ADDING = ['Movement', 'Record', 'Checks', 'Everyday', 'Approve'];
const RESTORING = ['Rest', 'Re-check', 'Everyday', 'Approve'];

type ProgressInput = Pick<SessionSnapshot, 'stage' | 'restoring' | 'adding' | 'recalibrating' | 'candidate' | 'approvedModels' | 'failure'>;

/** The one setup progress bar. Null where no bar belongs (Change controls, tiring, recalibrate confirmation, non-setup stages). */
export function setupProgress(snapshot: ProgressInput): SetupProgress | null {
  const { stage } = snapshot;
  const restoring = !!snapshot.restoring;
  if (stage === 'tiring') return null;
  if (stage === 'mapping' || stage === 'mapping-confirm') {
    if (snapshot.approvedModels.length > 0 && !snapshot.candidate && !restoring && !snapshot.adding && !snapshot.recalibrating) return null;
  }
  const segments = restoring ? RESTORING : snapshot.adding ? ADDING : FIRST;
  let name: string | null;
  switch (stage) {
    case 'baseline': name = 'Rest'; break;
    case 'choose': case 'discover': case 'discover-results': name = 'Movement'; break;
    case 'training': name = 'Record'; break;
    case 'verify': name = restoring ? 'Re-check' : 'Checks'; break;
    case 'negative': name = 'Everyday'; break;
    case 'comfort': case 'mapping': case 'mapping-confirm': name = 'Approve'; break;
    case 'setup-failed': {
      const kind = snapshot.failure?.kind;
      name = kind === 'baseline' ? 'Rest' : kind === 'discovery' ? 'Movement' : kind === 'training' ? 'Record'
        : kind === 'verification' ? 'Checks' : kind === 'negative' ? 'Everyday' : null;
      break;
    }
    default: return null;
  }
  const index = name === null ? -1 : segments.indexOf(name);
  return { segments: [...segments], current: index >= 0 ? index : null };
}
