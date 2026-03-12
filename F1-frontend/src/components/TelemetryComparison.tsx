import { useEffect, useRef, useState, useMemo } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

interface CarDataEntry {
  Utc: string;
  Cars: Record<string, { Channels: Record<string, number> }>;
}

interface CarDataZ {
  Entries?: CarDataEntry[];
}

interface PositionFrame {
  Timestamp: string;
  Entries: Record<string, { Status: string; X: number; Y: number }>;
}

interface PositionZ {
  Position?: PositionFrame[];
}

interface TrackPoint {
  pct: number;
  speed: number;
  throttle: number;
  brake: number;
  rpm: number;
}

interface TimePoint {
  speed: number;
  throttle: number;
  brake: number;
  rpm: number;
}

interface Props {
  driverA: string;
  driverB: string;
  carDataZ: CarDataZ | undefined;
  positionZ: PositionZ | undefined;
  circuitPoints: { x: number; y: number }[];
  driverInfo: Record<string, { Tla: string; TeamColour: string }>;
}

const BUCKETS = 100;
const POS_BUFFER = 600;
const TIME_BUFFER = 100;
const EMA_ALPHA = 0.3;

function buildProjection(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  const cumDists: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumDists.push(cumDists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const totalLen = cumDists[cumDists.length - 1];
  if (totalLen === 0) return null;
  return (px: number, py: number): number => {
    let minDist = Infinity;
    let bestCumDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const ax = points[i].x, ay = points[i].y;
      const dx = points[i + 1].x - ax, dy = points[i + 1].y - ay;
      const segLenSq = dx * dx + dy * dy;
      if (segLenSq === 0) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLenSq));
      const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (dist < minDist) { minDist = dist; bestCumDist = cumDists[i] + t * (cumDists[i + 1] - cumDists[i]); }
    }
    return bestCumDist / totalLen;
  };
}

function parsePoint(channels: Record<string, number>) {
  return { rpm: channels['0'] ?? 0, speed: channels['2'] ?? 0, throttle: channels['4'] ?? 0, brake: channels['5'] ?? 0 };
}

export default function TelemetryComparison({ driverA, driverB, carDataZ, positionZ, circuitPoints, driverInfo }: Props) {
  const [mode, setMode] = useState<'track' | 'time'>('track');

  const project = useMemo(() => buildProjection(circuitPoints), [circuitPoints]);

  // --- Track mode state ---
  const posBufferRef = useRef<Record<string, { ts: number; pct: number }[]>>({});
  const lastPosTsRef = useRef<string>('');
  const bucketsRef = useRef<Record<string, (TrackPoint | null)[]>>({});
  const lastCarTsRef = useRef<string>('');
  const lastTrackPctRef = useRef<Record<string, number>>({});
  const [bucketsA, setBucketsA] = useState<(TrackPoint | null)[]>([]);
  const [bucketsB, setBucketsB] = useState<(TrackPoint | null)[]>([]);
  const [currentPctA, setCurrentPctA] = useState<number | null>(null);
  const [currentPctB, setCurrentPctB] = useState<number | null>(null);

  // --- Time mode state ---
  const timeBufferRef = useRef<Record<string, TimePoint[]>>({});
  const lastTimeTsRef = useRef<string>('');
  const [dataA, setDataA] = useState<TimePoint[]>([]);
  const [dataB, setDataB] = useState<TimePoint[]>([]);

  const sameTeam = !!(driverInfo[driverA]?.TeamColour && driverInfo[driverA]?.TeamColour === driverInfo[driverB]?.TeamColour);
  const colorA = driverInfo[driverA]?.TeamColour ? `#${driverInfo[driverA].TeamColour}` : '#e10600';
  const colorB = driverInfo[driverB]?.TeamColour ? `#${driverInfo[driverB].TeamColour}` : '#0090ff';
  const tlaA = driverInfo[driverA]?.Tla ?? driverA;
  const tlaB = driverInfo[driverB]?.Tla ?? driverB;

  // Reset all on driver change
  useEffect(() => {
    posBufferRef.current = {};
    lastPosTsRef.current = '';
    bucketsRef.current = {};
    lastCarTsRef.current = '';
    lastTrackPctRef.current = {};
    setBucketsA([]);
    setBucketsB([]);
    setCurrentPctA(null);
    setCurrentPctB(null);
    timeBufferRef.current = {};
    lastTimeTsRef.current = '';
    setDataA([]);
    setDataB([]);
  }, [driverA, driverB]);

  // Buffer position history (track mode)
  useEffect(() => {
    if (!project || !positionZ?.Position?.length) return;
    const frames = positionZ.Position;
    const lastTs = lastPosTsRef.current;
    let startIdx = 0;
    if (lastTs) {
      const lastIdx = frames.findLastIndex(f => f.Timestamp <= lastTs);
      startIdx = lastIdx + 1;
    }
    if (startIdx >= frames.length) return;
    const newFrames = frames.slice(startIdx);
    lastPosTsRef.current = newFrames[newFrames.length - 1].Timestamp;
    const buf = posBufferRef.current;
    let latestPctA: number | null = null;
    let latestPctB: number | null = null;
    for (const frame of newFrames) {
      const ts = new Date(frame.Timestamp).getTime();
      for (const num of [driverA, driverB]) {
        const entry = frame.Entries[num];
        if (!entry) continue;
        const pct = project(entry.X, entry.Y);
        if (!buf[num]) buf[num] = [];
        buf[num].push({ ts, pct });
        if (buf[num].length > POS_BUFFER) buf[num].shift();
        const lastPct = lastTrackPctRef.current[num];
        if (lastPct !== undefined && lastPct > 0.85 && pct < 0.15) {
          bucketsRef.current[num] = Array(BUCKETS).fill(null);
        }
        lastTrackPctRef.current[num] = pct;
        if (num === driverA) latestPctA = pct;
        if (num === driverB) latestPctB = pct;
      }
    }
    if (latestPctA !== null) setCurrentPctA(latestPctA * BUCKETS);
    if (latestPctB !== null) setCurrentPctB(latestPctB * BUCKETS);
  }, [positionZ, driverA, driverB, project]);

  // Process car data — feeds both modes
  useEffect(() => {
    if (!carDataZ?.Entries?.length) return;
    const entries = carDataZ.Entries;

    // --- Track mode ---
    const lastUtc = lastCarTsRef.current;
    let startIdx = 0;
    if (lastUtc) {
      const lastIdx = entries.findLastIndex(e => e.Utc <= lastUtc);
      startIdx = lastIdx + 1;
    }
    if (startIdx < entries.length) {
      const newEntries = entries.slice(startIdx);
      lastCarTsRef.current = newEntries[newEntries.length - 1].Utc;
      const bkts = bucketsRef.current;
      const posBuf = posBufferRef.current;
      let trackChanged = false;
      for (const entry of newEntries) {
        const entryTs = new Date(entry.Utc).getTime();
        for (const num of [driverA, driverB]) {
          const car = entry.Cars[num];
          if (!car) continue;
          const positions = posBuf[num];
          if (!positions?.length) continue;
          let bestIdx = 0;
          let bestDiff = Math.abs(positions[0].ts - entryTs);
          for (let i = 1; i < positions.length; i++) {
            const diff = Math.abs(positions[i].ts - entryTs);
            if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
            if (positions[i].ts > entryTs + 500) break;
          }
          const pct = positions[bestIdx].pct;
          const bucket = Math.min(Math.floor(pct * BUCKETS), BUCKETS - 1);
          const point = parsePoint(car.Channels);
          if (!bkts[num]) bkts[num] = Array(BUCKETS).fill(null);
          const prev = bkts[num][bucket];
          bkts[num][bucket] = prev === null ? { pct, ...point } : {
            pct,
            speed:    EMA_ALPHA * point.speed    + (1 - EMA_ALPHA) * prev.speed,
            throttle: EMA_ALPHA * point.throttle + (1 - EMA_ALPHA) * prev.throttle,
            brake:    EMA_ALPHA * point.brake    + (1 - EMA_ALPHA) * prev.brake,
            rpm:      EMA_ALPHA * point.rpm      + (1 - EMA_ALPHA) * prev.rpm,
          };
          trackChanged = true;
        }
      }
      if (trackChanged) {
        setBucketsA(bkts[driverA] ? [...bkts[driverA]] : []);
        setBucketsB(bkts[driverB] ? [...bkts[driverB]] : []);
      }
    }

    // --- Time mode ---
    const lastTimeUtc = lastTimeTsRef.current;
    let timeStartIdx = 0;
    if (lastTimeUtc) {
      const lastIdx = entries.findLastIndex(e => e.Utc <= lastTimeUtc);
      timeStartIdx = lastIdx + 1;
    }
    if (timeStartIdx < entries.length) {
      const newEntries = entries.slice(timeStartIdx);
      lastTimeTsRef.current = newEntries[newEntries.length - 1].Utc;
      const buf = timeBufferRef.current;
      for (const entry of newEntries) {
        for (const num of [driverA, driverB]) {
          const car = entry.Cars[num];
          if (!car) continue;
          if (!buf[num]) buf[num] = [];
          buf[num].push(parsePoint(car.Channels));
          if (buf[num].length > TIME_BUFFER) buf[num].shift();
        }
      }
      setDataA(buf[driverA] ? [...buf[driverA]] : []);
      setDataB(buf[driverB] ? [...buf[driverB]] : []);
    }
  }, [carDataZ, driverA, driverB]);

  const trackMerged = useMemo(() => Array.from({ length: BUCKETS }, (_, i) => ({
    pct: i,
    speedA: bucketsA[i]?.speed,
    speedB: bucketsB[i]?.speed,
    throttleA: bucketsA[i]?.throttle,
    throttleB: bucketsB[i]?.throttle,
    brakeA: bucketsA[i]?.brake,
    brakeB: bucketsB[i]?.brake,
  })), [bucketsA, bucketsB]);

  const timeMerged = useMemo(() => {
    const maxLen = Math.max(dataA.length, dataB.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      speedA: dataA[i]?.speed,
      speedB: dataB[i]?.speed,
      throttleA: dataA[i]?.throttle,
      throttleB: dataB[i]?.throttle,
      brakeA: dataA[i]?.brake,
      brakeB: dataB[i]?.brake,
    }));
  }, [dataA, dataB]);

  const hasTrackData = bucketsA.some(b => b !== null) || bucketsB.some(b => b !== null);
  const hasTimeData = dataA.length > 0 || dataB.length > 0;
  const hasData = mode === 'track' ? hasTrackData : hasTimeData;
  const merged = mode === 'track' ? trackMerged : timeMerged;

  const charts: { label: string; keyA: string; keyB: string; domain: [number, number]; height: number }[] = [
    { label: 'Speed km/h', keyA: 'speedA', keyB: 'speedB', domain: [0, 380], height: 60 },
    { label: 'Throttle %', keyA: 'throttleA', keyB: 'throttleB', domain: [0, 100], height: 50 },
    { label: 'Brake', keyA: 'brakeA', keyB: 'brakeB', domain: [0, 1], height: 35 },
  ];

  return (
    <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg p-3 flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span style={{ color: colorA }}>{tlaA}</span>
          <span className="text-gray-600 text-xs">── vs ──</span>
          <span style={{ color: colorB }}>{tlaB}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode('track')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${mode === 'track' ? 'bg-gray-700 text-white' : 'text-gray-600 hover:text-gray-400'}`}
          >
            Track
          </button>
          <button
            onClick={() => setMode('time')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${mode === 'time' ? 'bg-gray-700 text-white' : 'text-gray-600 hover:text-gray-400'}`}
          >
            Time
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center text-gray-600 text-xs py-8">
          {mode === 'track' && !project ? 'Waiting for circuit data…' : driverA || driverB ? 'Waiting for data…' : 'Select drivers to compare'}
        </div>
      ) : (
        <div className="flex flex-col">
          {charts.map(({ label, keyA, keyB, domain, height }, i) => (
            <div key={label} className={`py-2 ${i > 0 ? 'border-t border-gray-800' : ''}`}>
              <div className="text-[10px] text-gray-600 mb-0.5">{label}</div>
              <ResponsiveContainer width="100%" height={height}>
                <LineChart data={merged} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <YAxis domain={domain} hide />
                  <Line type="monotone" dataKey={keyA} stroke={colorA} dot={false} isAnimationActive={false} strokeWidth={1.5} connectNulls />
                  <Line type="monotone" dataKey={keyB} stroke={colorB} dot={false} isAnimationActive={false} strokeWidth={1.5} strokeDasharray={sameTeam ? '4 3' : undefined} connectNulls />
                  {mode === 'track' && currentPctA !== null && <ReferenceLine x={Math.round(currentPctA)} stroke={colorA} strokeWidth={1} strokeOpacity={0.8} />}
                  {mode === 'track' && currentPctB !== null && <ReferenceLine x={Math.round(currentPctB)} stroke={colorB} strokeWidth={1} strokeOpacity={0.8} strokeDasharray={sameTeam ? '4 3' : undefined} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
