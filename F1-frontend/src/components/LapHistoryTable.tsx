import { useState } from 'react';
import type { LapHistory, LapRecord } from '../hooks/useLapHistory';

interface DriverInfo {
  Tla: string;
  TeamColour: string;
}

interface Props {
  history: LapHistory;
  driverList: Record<string, DriverInfo>;
  fixedDriver?: string;
  driverANum?: string;
  driverBNum?: string;
}

const TYRE_COLORS: Record<string, string> = {
  SOFT: '#e8002d',
  MEDIUM: '#ffd700',
  HARD: '#c8c8c8',
  INTERMEDIATE: '#39b54a',
  WET: '#0067ff',
};

const TYRE_ABBREV: Record<string, string> = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
};

function formatDelta(ms: number): string {
  const sign = ms >= 0 ? '+' : '-';
  const abs = Math.abs(ms);
  return `${sign}${(abs / 1000).toFixed(3)}`;
}

function TyreChip({ compound }: { compound?: string }) {
  if (!compound) return null;
  const c = compound.toUpperCase();
  const color = TYRE_COLORS[c] ?? '#888';
  const abbrev = TYRE_ABBREV[c] ?? c[0];
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0"
      style={{ backgroundColor: color, color: c === 'HARD' ? '#000' : '#fff' }}
    >
      {abbrev}
    </span>
  );
}

function DriverLaps({ laps, color }: { laps: LapRecord[]; color: string }) {
  if (laps.length === 0) return <div className="text-gray-600 text-xs py-4 text-center">No laps recorded</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800 text-[10px] uppercase tracking-widest text-gray-600">
            <th className="px-3 py-2 text-left">Lap</th>
            <th className="px-3 py-2 text-right">Time</th>
            <th className="px-3 py-2 text-right">Δ Prev</th>
            <th className="px-3 py-2 text-right">S1</th>
            <th className="px-3 py-2 text-right">S2</th>
            <th className="px-3 py-2 text-right">S3</th>
            <th className="px-3 py-2 text-center">Tyre</th>
            <th className="px-3 py-2 text-right">Age</th>
          </tr>
        </thead>
        <tbody>
          {[...laps].reverse().map((lap, i) => {
            const prev = laps[laps.length - 2 - i];
            const deltaMs = prev ? lap.lapTimeMs - prev.lapTimeMs : null;
            return (
              <tr key={i} className="border-b border-gray-800/40 hover:bg-white/[0.02]">
                <td className="px-3 py-1.5 font-mono text-gray-400">{lap.lapNumber}</td>
                <td className={`px-3 py-1.5 font-mono text-right font-semibold ${lap.isPersonalBest ? 'text-purple-400' : ''}`}
                    style={!lap.isPersonalBest ? { color } : undefined}>
                  {lap.lapTime}
                </td>
                <td className={`px-3 py-1.5 font-mono text-right ${
                  deltaMs === null ? 'text-gray-600' :
                  deltaMs < 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {deltaMs === null ? '—' : formatDelta(deltaMs)}
                </td>
                <td className="px-3 py-1.5 font-mono text-right text-gray-400">{lap.s1 ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-right text-gray-400">{lap.s2 ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-right text-gray-400">{lap.s3 ?? '—'}</td>
                <td className="px-3 py-1.5 text-center">
                  <TyreChip compound={lap.compound} />
                </td>
                <td className="px-3 py-1.5 font-mono text-right text-gray-500">{lap.tireAge ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LapHistoryTable({ history, driverList, fixedDriver, driverANum, driverBNum }: Props) {
  const drivers = Object.keys(history).filter(num => history[num].length > 0);
  const [selected, setSelected] = useState<string | null>(null);

  const pinnedDrivers = [driverANum, driverBNum].filter(Boolean) as string[];
  const activeDriver = selected ?? fixedDriver ?? drivers[0] ?? null;
  const info = activeDriver ? driverList[activeDriver] : null;
  const color = info?.TeamColour ? `#${info.TeamColour}` : '#e10600';

  const tabDrivers = pinnedDrivers.length > 0 ? pinnedDrivers : drivers;

  if (!fixedDriver && drivers.length === 0) {
    return (
      <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg px-4 py-6 text-center text-gray-600 text-sm">
        Lap history will appear once drivers complete laps
      </div>
    );
  }

  return (
    <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center border-b border-gray-800 overflow-x-auto">
        <span className="px-3 py-2 text-[10px] uppercase tracking-widest text-gray-600 flex-shrink-0">Lap History</span>
        <div className="flex">
          {tabDrivers.map(num => {
            const d = driverList[num];
            const c = d?.TeamColour ? `#${d.TeamColour}` : '#555';
            const isActive = num === activeDriver;
            return (
              <button
                key={num}
                onClick={() => setSelected(num)}
                className={`px-3 py-2 text-xs font-bold transition-colors border-b-2 flex-shrink-0 ${
                  isActive ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
                style={isActive ? { color: c, borderColor: c } : undefined}
              >
                {d?.Tla ?? num}
              </button>
            );
          })}
        </div>
      </div>

      {activeDriver ? (
        <DriverLaps laps={history[activeDriver] ?? []} color={color} />
      ) : (
        <div className="px-4 py-6 text-center text-gray-600 text-sm">No laps recorded yet</div>
      )}
    </div>
  );
}
