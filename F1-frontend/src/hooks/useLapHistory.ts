import { useEffect, useRef, useState } from 'react';
import type { LiveTimingState } from './useLiveTiming';

export interface LapRecord {
  lapNumber: number;
  lapTime: string;
  lapTimeMs: number;
  s1?: string;
  s2?: string;
  s3?: string;
  compound?: string;
  tireAge?: number;
  isPersonalBest: boolean;
}

export type LapHistory = Record<string, LapRecord[]>;

function parseTimeMs(value: string): number {
  // Formats: "1:23.456" or "23.456"
  const parts = value.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60000 + parseFloat(parts[1]) * 1000;
  }
  return parseFloat(value) * 1000;
}

export function useLapHistory(state: LiveTimingState): LapHistory {
  const historyRef = useRef<LapHistory>({});
  const prevLapTimesRef = useRef<Record<string, string>>({});
  const [history, setHistory] = useState<LapHistory>({});

  useEffect(() => {
    const timingLines = (state.TimingData as { Lines?: Record<string, {
      LastLapTime?: { Value?: string; PersonalFastest?: boolean };
      Sectors?: Record<string, { Value?: string }>;
    }> })?.Lines ?? {};

    const timingAppLines = (state.TimingAppData as { Lines?: Record<string, {
      Stints?: Record<string, { Compound?: string; TotalLaps?: number }> | Array<{ Compound?: string; TotalLaps?: number }>;
    }> })?.Lines ?? {};

    const lapCount = (state.LapCount as { CurrentLap?: number } | undefined)?.CurrentLap ?? 0;

    let changed = false;

    for (const [num, line] of Object.entries(timingLines)) {
      const newTime = line.LastLapTime?.Value;
      if (!newTime || newTime === prevLapTimesRef.current[num]) continue;

      prevLapTimesRef.current[num] = newTime;

      const appLine = timingAppLines[num];
      const stints = appLine?.Stints;
      let compound: string | undefined;
      let tireAge: number | undefined;
      if (stints) {
        const stintArr = Array.isArray(stints) ? stints : Object.values(stints);
        const current = stintArr[stintArr.length - 1];
        compound = current?.Compound;
        tireAge = current?.TotalLaps;
      }

      const record: LapRecord = {
        lapNumber: lapCount,
        lapTime: newTime,
        lapTimeMs: parseTimeMs(newTime),
        s1: line.Sectors?.['0']?.Value,
        s2: line.Sectors?.['1']?.Value,
        s3: line.Sectors?.['2']?.Value,
        compound,
        tireAge,
        isPersonalBest: line.LastLapTime?.PersonalFastest === true,
      };

      if (!historyRef.current[num]) historyRef.current[num] = [];
      historyRef.current[num] = [...historyRef.current[num], record];
      changed = true;
    }

    if (changed) setHistory({ ...historyRef.current });
  }, [state.TimingData, state.TimingAppData, state.LapCount]);

  return history;
}
