import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import TrackMap from '../components/TrackMap';
import TelemetryComparison from '../components/TelemetryComparison';
import LapHistoryTable from '../components/LapHistoryTable';
import TeamRadioPanel from '../components/TeamRadioPanel';
import { useLiveTiming } from '../hooks/useLiveTiming';
import { useLapHistory } from '../hooks/useLapHistory';

// --- Types for the live timing state ---

interface DriverInfo {
  RacingNumber: string;
  BroadcastName: string;
  Tla: string;
  TeamName: string;
  TeamColour: string;
}

interface SectorValue {
  Value?: string;
  PersonalFastest?: boolean;
}

interface LapTimeValue {
  Value?: string;
  PersonalFastest?: boolean;
}

interface TimingLine {
  Position?: string;
  GapToLeader?: string;
  IntervalToPositionAhead?: { Value?: string };
  LastLapTime?: LapTimeValue;
  BestLapTime?: LapTimeValue;
  Sectors?: Record<string, SectorValue>;
  Speeds?: Record<string, { Value?: string }>;
  InPit?: boolean;
  Retired?: boolean;
}

interface Stint {
  Compound?: string;
  TotalLaps?: number;
  New?: string;
}

interface TimingAppLine {
  Stints?: Stint[] | Record<string, Stint>;
}

interface SessionInfo {
  Meeting?: { Name?: string; OfficialName?: string; Number?: number };
  Name?: string;
  Type?: string;
}

interface TrackStatusData {
  Status?: string;
  Message?: string;
}

interface WeatherData {
  AirTemp?: string;
  TrackTemp?: string;
  Rainfall?: string;
  WindSpeed?: string;
}

interface ExtrapolatedClock {
  Remaining?: string;
  Extrapolating?: boolean;
}

interface SessionStatusData {
  Status?: string;
}

interface TimingStatsLine {
  Speeds?: {
    I1?: { Value?: string };
    I2?: { Value?: string };
    FL?: { Value?: string };
    ST?: { Value?: string };
  };
}

interface RaceControlMessage {
  Utc?: string;
  Category?: string;
  Message?: string;
  Flag?: string;
  Scope?: string;
}

// --- Helpers ---

const TYRE_COLORS: Record<string, string> = {
  SOFT: '#e8002d',
  MEDIUM: '#ffd700',
  HARD: '#c8c8c8',
  INTERMEDIATE: '#39b54a',
  WET: '#0067ff',
};

const TYRE_ABBREV: Record<string, string> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTERMEDIATE: 'I',
  WET: 'W',
};

const FLAG_COLORS: Record<string, string> = {
  'RED': '#e8002d',
  'YELLOW': '#ffd700',
  'DOUBLE YELLOW': '#ffd700',
  'GREEN': '#39b54a',
  'CLEAR': '#39b54a',
  'CHEQUERED': '#ffffff',
  'BLUE': '#0090ff',
  'SAFETY CAR': '#ff8c00',
  'VIRTUAL SAFETY CAR': '#ff8c00',
};

const TRACK_STATUS_COLORS: Record<string, string> = {
  '1': '#39b54a',
  '2': '#ffd700',
  '4': '#ffd700',
  '5': '#e8002d',
  '6': '#ffd700',
  '7': '#ffd700',
};

function getCurrentStint(appLine: TimingAppLine | undefined): Stint | null {
  if (!appLine?.Stints) return null;
  const stints = appLine.Stints;
  if (Array.isArray(stints)) return stints[stints.length - 1] ?? null;
  const keys = Object.keys(stints);
  return keys.length ? stints[keys[keys.length - 1]] : null;
}

function TyreIndicator({ stint }: { stint: Stint | null }) {
  if (!stint?.Compound) return <span className="text-gray-600">—</span>;
  const compound = stint.Compound.toUpperCase();
  const color = TYRE_COLORS[compound] ?? '#888';
  const abbrev = TYRE_ABBREV[compound] ?? compound[0];
  const isNew = stint.New === 'true';
  const age = stint.TotalLaps ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
        style={{ backgroundColor: color, color: compound === 'HARD' ? '#000' : '#fff' }}
      >
        {abbrev}
      </span>
      <span className="text-gray-400 text-xs">
        {isNew && age === 0 ? 'NEW' : `+${age}`}
      </span>
    </div>
  );
}

function SectorCell({ value, personal }: { value?: string; personal?: boolean }) {
  if (!value) return <span className="text-gray-700">—</span>;
  return (
    <span className={personal ? 'text-purple-400 font-semibold' : 'text-gray-300'}>
      {value}
    </span>
  );
}

// --- Main Component ---

export default function LiveTiming() {
  const { state, connected } = useLiveTiming();
  const lapHistory = useLapHistory(state);

  const [driverA, setDriverA] = useState('');
  const [driverB, setDriverB] = useState('');
  const autoSetRef = useRef(false);

  const sessionInfo = state.SessionInfo as SessionInfo | undefined;
  const sessionStatus = state.SessionStatus as SessionStatusData | undefined;
  const trackStatus = state.TrackStatus as TrackStatusData | undefined;
  const weather = state.WeatherData as WeatherData | undefined;
  const clock = state.ExtrapolatedClock as ExtrapolatedClock | undefined;
  const driverList = (state.DriverList as Record<string, DriverInfo>) ?? {};
  const timingLines = ((state.TimingData as { Lines?: Record<string, TimingLine> })?.Lines) ?? {};
  const timingAppLines = ((state.TimingAppData as { Lines?: Record<string, TimingAppLine> })?.Lines) ?? {};

  const rcmRaw = (state.RaceControlMessages as { Messages?: Record<string, RaceControlMessage> } | undefined)?.Messages ?? {};
  const rcMessages = Object.values(rcmRaw).slice(-5).reverse();

  const timingStats = ((state.TimingStats as { Lines?: Record<string, TimingStatsLine> })?.Lines) ?? {};
  const radioCaptures = Object.values((state.TeamRadio as { Captures?: Record<string, { RacingNumber?: string; UtcTime?: string; Path?: string }> } | undefined)?.Captures ?? {});

  const isLive = sessionStatus?.Status === 'Started';
  const isEnded = ['Ends', 'Finished', 'Finalised'].includes(sessionStatus?.Status ?? '');
  const trackColor = TRACK_STATUS_COLORS[trackStatus?.Status ?? '1'] ?? '#39b54a';
  const isRaining = weather?.Rainfall === '1';

  // Build sorted driver rows
  const drivers = Object.entries(driverList)
    .map(([num, info]) => ({
      num,
      info,
      timing: timingLines[num] ?? {},
      stint: getCurrentStint(timingAppLines[num]),
      position: parseInt(timingLines[num]?.Position ?? '99', 10),
    }))
    .sort((a, b) => a.position - b.position);

  const hasData = drivers.length > 0;

  const carDataZ = state['CarData.z'] as { Entries?: Array<{ Utc: string; Cars: Record<string, { Channels: Record<string, number> }> }> } | undefined;

  // Auto-set A = P1, B = P2 on first data arrival
  useEffect(() => {
    if (autoSetRef.current || drivers.length < 2) return;
    autoSetRef.current = true;
    setDriverA(drivers[0].num);
    setDriverB(drivers[1].num);
  }, [drivers]);

  function handleDriverClick(num: string) {
    if (num === driverA) {
      setDriverA(driverB);
      setDriverB('');
    } else if (num === driverB) {
      setDriverB('');
    } else {
      setDriverB(driverA);
      setDriverA(num);
    }
  }

  // Circuit layout — fetched once per round, cached indefinitely
  const year = new Date().getFullYear();
  const round = sessionInfo?.Meeting?.Number;
  const { data: circuitData } = useQuery<{ x: number[]; y: number[] }>({
    queryKey: ['circuit', year, round],
    queryFn: () =>
      fetch(`/api/circuit/${year}/${round}/FP1`).then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      }),
    enabled: !!round,
    staleTime: Infinity,
    retry: false,
  });

  const circuitPoints = circuitData
    ? circuitData.x.map((x, i) => ({ x, y: circuitData.y[i] }))
    : [];

  // Extract latest car positions from Position.z
  const positionTopic = state['Position.z'] as { Position?: Array<{ Timestamp: string; Entries: Record<string, { Status: string; X: number; Y: number }> }> } | undefined;
  const latestPositionEntry = positionTopic?.Position?.[positionTopic.Position.length - 1];
  const livePositions: Record<string, { x: number; y: number; status: string }> = {};
  if (latestPositionEntry?.Entries) {
    for (const [num, entry] of Object.entries(latestPositionEntry.Entries)) {
      livePositions[num] = { x: entry.X, y: entry.Y, status: entry.Status };
    }
  }

  return (
    <div className="space-y-4">
      {/* Session banner */}
      <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-0.5">
              {sessionInfo?.Meeting?.Name ?? 'Awaiting session'}
            </div>
            <div className="text-xl font-bold text-white">
              {sessionInfo?.Name ?? '—'}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Remaining time */}
            {clock?.Extrapolating && clock.Remaining && clock.Remaining !== '00:00:00' && (
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest text-gray-500">Remaining</div>
                <div className="text-lg font-bold font-mono text-white">{clock.Remaining}</div>
              </div>
            )}

            {/* Session status */}
            <div className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-widest ${
              isLive
                ? 'bg-[#e10600] text-white'
                : isEnded
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-800 text-gray-400'
            }`}>
              {isLive ? '● LIVE' : isEnded ? 'SESSION ENDED' : sessionStatus?.Status ?? 'NO SESSION'}
            </div>

            {/* Connection indicator */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <span className={connected ? 'text-gray-400' : 'text-red-400'}>
                {connected ? 'Connected' : 'Reconnecting…'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Track status + weather */}
      {(trackStatus || weather) && (
        <div className="flex items-center gap-4 flex-wrap">
          {trackStatus && (
            <div className="flex items-center gap-2 bg-[#1e1e2e] border border-gray-800 rounded px-3 py-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: trackColor }} />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">
                {trackStatus.Message ?? 'Track status unknown'}
              </span>
            </div>
          )}
          {weather && (
            <div className="flex items-center gap-4 bg-[#1e1e2e] border border-gray-800 rounded px-3 py-2 text-xs text-gray-400">
              <span>Air <span className="text-white">{weather.AirTemp ?? '—'}°C</span></span>
              <span>Track <span className="text-white">{weather.TrackTemp ?? '—'}°C</span></span>
              <span>Wind <span className="text-white">{weather.WindSpeed ?? '—'} m/s</span></span>
              {isRaining && (
                <span className="text-blue-400 font-semibold">RAIN</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Race control messages */}
      {rcMessages.length > 0 && (
        <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg overflow-hidden">
          {rcMessages.map((msg, i) => {
            const flag = msg.Flag?.toUpperCase() ?? '';
            const color = FLAG_COLORS[flag] ?? '#9ca3af';
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-2 text-sm ${i > 0 ? 'border-t border-gray-800/60' : ''}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-200">{msg.Message}</span>
                {msg.Utc && (
                  <span className="ml-auto text-xs text-gray-600 flex-shrink-0">
                    {new Date(msg.Utc).toLocaleTimeString()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Team radio */}
      <TeamRadioPanel captures={radioCaptures} driverInfo={driverList} />

      {/* Main layout: left col (map + telemetry) + right col (timing tower) */}
      <div className="flex gap-4 items-start">
        {/* Left column */}
        <div className="hidden lg:flex flex-col gap-4 w-1/2">
          {/* Track map */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg p-2 flex items-center justify-center" style={{ minHeight: 280 }}>
            <TrackMap
              circuitPoints={circuitPoints}
              livePositions={livePositions}
              driverInfo={driverList}
            />
          </div>

          {/* Telemetry comparison */}
          <TelemetryComparison
            driverA={driverA}
            driverB={driverB}
            carDataZ={carDataZ}
            positionZ={positionTopic}
            circuitPoints={circuitPoints}
            driverInfo={driverList}
          />

          {/* Lap history for driver A */}
          {(driverA || driverB) && <LapHistoryTable history={lapHistory} driverList={driverList} fixedDriver={driverA || driverB} driverANum={driverA} driverBNum={driverB} />}
        </div>

        {/* Timing tower */}
        <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg overflow-hidden flex-1">
        {!hasData ? (
          <div className="py-16 text-center text-gray-600">
            {isEnded ? 'Session has ended' : connected ? 'Waiting for session data…' : 'Connecting to live feed…'}
          </div>
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                  <th className="px-4 py-3 text-left w-10">P</th>
                  <th className="px-4 py-3 text-left">Driver</th>
                  <th className="px-4 py-3 text-left">Tyre</th>
                  <th className="px-4 py-3 text-right">Last Lap</th>
                  <th className="px-4 py-3 text-right">Gap</th>
                  <th className="px-4 py-3 text-right">S1</th>
                  <th className="px-4 py-3 text-right">S2</th>
                  <th className="px-4 py-3 text-right">S3</th>
                  <th className="px-4 py-3 text-right">ST</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(({ num, info, timing, stint }, i) => {
                  const isRetired = timing.Retired === true;
                  const inPit = timing.InPit === true;
                  const isPersonalBest = timing.LastLapTime?.PersonalFastest === true;
                  const teamColor = info.TeamColour ? `#${info.TeamColour}` : '#555';
                  const gap = timing.Position === '1'
                    ? 'Leader'
                    : (timing.GapToLeader ?? '—');
                  const isA = num === driverA;
                  const isB = num === driverB;

                  return (
                    <tr
                      key={num}
                      onClick={() => handleDriverClick(num)}
                      className={`border-b border-gray-800/60 transition-colors cursor-pointer ${
                        isRetired ? 'opacity-40' : (isA || isB) ? 'bg-white/[0.04] hover:bg-white/[0.06]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* Position */}
                      <td className="px-4 py-3">
                        {isA ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: teamColor }}>A</span>
                        ) : isB ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white opacity-70" style={{ backgroundColor: teamColor }}>B</span>
                        ) : (
                          <span className={`font-bold ${i < 3 ? 'text-white' : 'text-gray-400'}`}>
                            {timing.Position ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Driver */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-0.5 h-5 rounded-full" style={{ backgroundColor: teamColor }} />
                          <span className="font-bold text-white">{info.Tla}</span>
                          {inPit && (
                            <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-yellow-900/50 text-yellow-400">
                              PIT
                            </span>
                          )}
                          {isRetired && (
                            <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-900/50 text-red-400">
                              OUT
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tyre */}
                      <td className="px-4 py-3">
                        <TyreIndicator stint={stint} />
                      </td>

                      {/* Last Lap */}
                      <td className="px-4 py-3 text-right font-mono">
                        {timing.LastLapTime?.Value ? (
                          <span className={isPersonalBest ? 'text-purple-400 font-semibold' : 'text-gray-200'}>
                            {timing.LastLapTime.Value}
                          </span>
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>

                      {/* Gap */}
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        {gap === 'Leader'
                          ? <span className="text-[#e10600] font-semibold text-xs">LEADER</span>
                          : <span className="text-gray-400">{gap}</span>
                        }
                      </td>

                      {/* Sectors */}
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        <SectorCell
                          value={timing.Sectors?.['0']?.Value}
                          personal={timing.Sectors?.['0']?.PersonalFastest}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        <SectorCell
                          value={timing.Sectors?.['1']?.Value}
                          personal={timing.Sectors?.['1']?.PersonalFastest}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        <SectorCell
                          value={timing.Sectors?.['2']?.Value}
                          personal={timing.Sectors?.['2']?.PersonalFastest}
                        />
                      </td>
                      {/* Speed trap */}
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">
                        {timingStats[num]?.Speeds?.ST?.Value ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div> {/* end timing tower */}
      </div> {/* end map + tower row */}
    </div>
  );
}
