import { useEffect, useReducer, useState } from 'react';
import type { CareClient } from '../../care';
import { initialCore, reduce, viewOf, type Core, type DashboardEvent, type View } from './state';

export interface DashboardClock { wall(): number; mono(): number }
export const systemClock: DashboardClock = { wall: () => Date.now(), mono: () => performance.now() };

export interface DashboardModel { core: Core; view: View; mono: number; wall: number; dispatch: (event: DashboardEvent) => void }

/** Subscribes to the shared client's authorized polling; never calls the network itself. */
export function useDashboard(client: CareClient, clock: DashboardClock = systemClock): DashboardModel {
  const [core, dispatch] = useReducer(reduce, undefined, initialCore);
  const [now, setNow] = useState(() => ({ mono: clock.mono(), wall: clock.wall() }));

  useEffect(() => {
    let active = true;
    const unsubscribe = client.watch((snapshot) => { if (active) dispatch({ type: 'snapshot', snapshot, mono: clock.mono() }); });
    // watch() reports the initial idle snapshot at once; this refresh is what ends a genuine cold start.
    void client.refresh().catch(() => {}).finally(() => { if (active) dispatch({ type: 'settled' }); });
    return () => { active = false; unsubscribe(); };
  }, [client, clock]);

  useEffect(() => {
    const timer = setInterval(() => {
      const mono = clock.mono();
      setNow({ mono, wall: clock.wall() });
      dispatch({ type: 'tick', mono });
    }, 1_000);
    return () => clearInterval(timer);
  }, [clock]);

  return { core, view: viewOf(core, now.mono), mono: now.mono, wall: now.wall, dispatch };
}
