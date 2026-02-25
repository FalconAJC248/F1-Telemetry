import { useState, useMemo, Fragment, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';

interface TelemetryPoint {
  distance: number;
  speed: number;
  throttle: number;
  brake: number;
  rpm: number;
  gear: number;
  drs: number;
}

interface Corner {
  number: number;
  letter: string;
  distance: number;
}

interface CornerZone {
  number: number;
  letter: string;
  apex: number;
  entry: number | null;
  exit: number | null;
}

interface SessionDriver {
  abbreviation: string;
  full_name: string;
  team: string;
  team_color: string;
  number: string;
}

type MergedPoint = Record<string, number>;

const METRICS = [
  { key: 'speed',    label: 'Speed (km/h)',  color: '#e10600' },
  { key: 'throttle', label: 'Throttle (%)',  color: '#22c55e' },
  { key: 'brake',    label: 'Brake',          color: '#f97316' },
  { key: 'rpm',      label: 'RPM',            color: '#3b82f6' },
  { key: 'gear',     label: 'Gear',           color: '#a855f7' },
  { key: 'drs',      label: 'DRS',            color: '#06b6d4' },
];

const CORNER_COLOR = '#fbbf24';
const DRS_COLOR = '#a855f7';

interface DrsZone { start: number; end: number; }

function buildDrsZones(data: TelemetryPoint[]): DrsZone[] {
  if (data.length === 0) return [];
  const avg = data.reduce((sum, p) => sum + p.drs, 0) / data.length;
  const zones: DrsZone[] = [];
  let zoneStart: number | null = null;
  for (const point of data) {
    if (point.drs > avg && zoneStart === null) {
      zoneStart = point.distance;
    } else if (point.drs <= avg && zoneStart !== null) {
      zones.push({ start: zoneStart, end: point.distance });
      zoneStart = null;
    }
  }
  if (zoneStart !== null) {
    zones.push({ start: zoneStart, end: data[data.length - 1].distance });
  }
  return zones;
}

function mergeDriverData(primary: TelemetryPoint[], compare: TelemetryPoint[]): MergedPoint[] {
  return primary.map(p1 => {
    const p2 = compare.reduce((best, p) =>
      Math.abs(p.distance - p1.distance) < Math.abs(best.distance - p1.distance) ? p : best
    , compare[0]);
    return {
      distance: p1.distance,
      speed: p1.speed,       speed_2: p2.speed,
      throttle: p1.throttle, throttle_2: p2.throttle,
      brake: p1.brake,       brake_2: p2.brake,
      rpm: p1.rpm,           rpm_2: p2.rpm,
      gear: p1.gear,         gear_2: p2.gear,
      drs: p1.drs,           drs_2: p2.drs,
    };
  });
}

function buildCornerZones(data: TelemetryPoint[], corners: Corner[]): CornerZone[] {
  return corners.map(corner => {
    const apex = corner.distance;
    let apexIdx = 0;
    let minDiff = Infinity;
    data.forEach((p, i) => {
      const d = Math.abs(p.distance - apex);
      if (d < minDiff) { minDiff = d; apexIdx = i; }
    });

    let entry: number | null = null;
    let brakeFound = false;
    for (let i = apexIdx; i >= 0; i--) {
      if (data[i].brake > 0) { brakeFound = true; entry = data[i].distance; }
      else if (brakeFound) break;
      if (apex - data[i].distance > 400) break;
    }

    let exit: number | null = null;
    for (let i = apexIdx; i < data.length; i++) {
      if (data[i].throttle > 50) { exit = data[i].distance; break; }
      if (data[i].distance - apex > 400) break;
    }

    return { number: corner.number, letter: corner.letter, apex, entry, exit };
  });
}

interface CornerTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ name: string; value: number; color: string; dataKey: string }>;
  label?: number | string;
  cornerZones: CornerZone[];
  drsZones: DrsZone[];
  overlayMode: boolean;
  metricMaxes: Record<string, number>;
  driver: string;
  compareDriver: string | null;
}

function CornerTooltip({ active, payload, label, cornerZones, drsZones, overlayMode, metricMaxes, driver, compareDriver }: CornerTooltipProps) {
  if (!active || !payload?.length) return null;

  const dist = Number(label);
  const corner = cornerZones.find(z => dist >= (z.entry ?? z.apex - 50) && dist <= (z.exit ?? z.apex + 50));
  const inDrs = drsZones.some(z => dist >= z.start && dist <= z.end);

  const d1Items = payload.filter(item => !item.dataKey.endsWith('_2'));
  const d2Items = payload.filter(item => item.dataKey.endsWith('_2'));

  const formatValue = (item: { value: number; dataKey: string }) => {
    const baseKey = item.dataKey.replace('_2', '');
    if (overlayMode) {
      return Math.round((item.value / 100) * (metricMaxes[baseKey] ?? 1));
    }
    return item.value;
  };

  const metricLabel = (dataKey: string) =>
    METRICS.find(m => m.key === dataKey.replace('_2', ''))?.label ?? dataKey;

  return (
    <div style={{ backgroundColor: '#15151e', border: '1px solid #374151', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', lineHeight: '1.7' }}>
      {corner && <p style={{ color: CORNER_COLOR, fontWeight: 600, marginBottom: '2px' }}>Turn {corner.number}{corner.letter}</p>}
      {inDrs && <p style={{ color: DRS_COLOR, fontWeight: 600, marginBottom: '2px' }}>DRS zone</p>}
      <p style={{ color: '#6b7280', marginBottom: '4px' }}>{Math.round(dist)} m</p>

      {compareDriver && <p style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: '2px' }}>{driver}</p>}
      {d1Items.map(item => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {metricLabel(item.dataKey)}: {formatValue(item)}
        </p>
      ))}

      {compareDriver && d2Items.length > 0 && (
        <>
          <p style={{ color: '#e5e7eb', fontWeight: 600, margin: '4px 0 2px' }}>{compareDriver}</p>
          {d2Items.map(item => (
            <p key={item.dataKey} style={{ color: item.color, opacity: 0.85 }}>
              {metricLabel(item.dataKey)}: {formatValue(item)}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 flex-1 bg-[#1e1e2e] rounded-lg" />
        ))}
      </div>
      <div className="bg-[#1e1e2e] rounded-lg border border-gray-800 p-4">
        <div className="h-4 bg-gray-800 rounded w-48 mb-6" />
        <div className="h-[360px] bg-gray-800 rounded" />
      </div>
    </div>
  );
}

export default function TelemetryView() {
  const { year, round, session, driver } = useParams();
  const navigate = useNavigate();
  const [overlayMode, setOverlayMode] = useState(false);
  const [metric, setMetric] = useState('speed');
  const [overlayMetrics, setOverlayMetrics] = useState<string[]>(['speed', 'throttle']);
  const [showCorners, setShowCorners] = useState(true);
  const [showDrs, setShowDrs] = useState(true);
  const [compareDriver, setCompareDriver] = useState<string | null>(null);
  const [showDriverPicker, setShowDriverPicker] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['telemetry', year, round, session, driver],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/telemetry/${year}/${round}/${encodeURIComponent(session!)}/${driver}`);
      if (!res.ok) throw new Error('Failed to fetch telemetry');
      return res.json() as Promise<TelemetryPoint[]>;
    },
  });

  const { data: corners } = useQuery({
    queryKey: ['corners', year, round, session],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/corners/${year}/${round}/${encodeURIComponent(session!)}`);
      if (!res.ok) return [] as Corner[];
      return res.json() as Promise<Corner[]>;
    },
    enabled: !!data,
  });

  const { data: sessionDrivers } = useQuery({
    queryKey: ['session-drivers', year, round, session],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/session/${year}/${round}/${encodeURIComponent(session!)}`);
      if (!res.ok) return [] as SessionDriver[];
      return res.json() as Promise<SessionDriver[]>;
    },
    enabled: showDriverPicker,
  });

  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ['telemetry', year, round, session, compareDriver],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/telemetry/${year}/${round}/${encodeURIComponent(session!)}/${compareDriver}`);
      if (!res.ok) throw new Error('Failed to fetch comparison telemetry');
      return res.json() as Promise<TelemetryPoint[]>;
    },
    enabled: !!compareDriver,
  });

  const effectiveData = useMemo<MergedPoint[] | null>(() => {
    if (!data) return null;
    if (!compareData) return data as unknown as MergedPoint[];
    return mergeDriverData(data, compareData);
  }, [data, compareData]);

  const { chartData, metricMaxes } = useMemo(() => {
    if (!effectiveData) return { chartData: [] as MergedPoint[], metricMaxes: {} as Record<string, number> };
    if (!overlayMode) return { chartData: effectiveData, metricMaxes: {} as Record<string, number> };

    const maxes: Record<string, number> = {};
    overlayMetrics.forEach(m => {
      const vals = effectiveData.flatMap(p => {
        const v2 = p[`${m}_2`];
        return v2 !== undefined ? [p[m] ?? 0, v2] : [p[m] ?? 0];
      });
      maxes[m] = Math.max(...vals, 1);
    });

    const normalized = effectiveData.map(point => ({
      distance: point.distance,
      ...Object.fromEntries(overlayMetrics.flatMap(m => {
        const entries: [string, number][] = [[m, Math.round(((point[m] ?? 0) / maxes[m]) * 100)]];
        if (point[`${m}_2`] !== undefined) {
          entries.push([`${m}_2`, Math.round((point[`${m}_2`] / maxes[m]) * 100)]);
        }
        return entries;
      })),
    }));

    return { chartData: normalized, metricMaxes: maxes };
  }, [effectiveData, overlayMode, overlayMetrics]);

  const cornerZones = useMemo<CornerZone[]>(() => {
    if (!data || !corners?.length) return [];
    return buildCornerZones(data, corners);
  }, [data, corners]);

  const drsZones = useMemo<DrsZone[]>(() => {
    if (!data) return [];
    return buildDrsZones(data);
  }, [data]);

  useEffect(() => {
    const title = compareDriver ? `${driver} vs ${compareDriver}` : driver;
    document.title = `${title} · ${session} · F1 Telemetry`;
  }, [driver, compareDriver, session]);

  // Lap summary stats
  const lapStats = useMemo(() => {
    if (!data) return null;
    const topSpeed = Math.max(...data.map(p => p.speed));
    const compareTopSpeed = compareData ? Math.max(...compareData.map(p => p.speed)) : null;
    return {
      topSpeed,
      compareTopSpeed,
      topSpeedDelta: compareTopSpeed !== null ? Math.round(topSpeed - compareTopSpeed) : null,
    };
  }, [data, compareData]);

  const enterOverlay = () => {
    const second = metric === 'speed' ? 'throttle' : 'speed';
    setOverlayMetrics([metric, second]);
    setOverlayMode(true);
  };

  const addOverlayMetric = () => {
    const next = METRICS.find(m => !overlayMetrics.includes(m.key));
    if (next && overlayMetrics.length < 4) setOverlayMetrics([...overlayMetrics, next.key]);
  };

  const removeOverlayMetric = (key: string) => {
    if (overlayMetrics.length > 2) setOverlayMetrics(overlayMetrics.filter(m => m !== key));
  };

  const updateOverlayMetric = (index: number, newKey: string) => {
    if (overlayMetrics.some((m, i) => m === newKey && i !== index)) return;
    const updated = [...overlayMetrics];
    updated[index] = newKey;
    setOverlayMetrics(updated);
  };

  const activeMetric = METRICS.find(m => m.key === metric)!;

  return (
    <div className="text-white">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-white mb-6 flex items-center gap-1 transition-colors text-sm"
      >
        ← Back
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          {driver}
          {compareDriver && <span className="text-gray-400 font-normal"> vs {compareDriver}</span>}
        </h1>
        <p className="text-gray-400 mt-1">{session} · Fastest Lap Telemetry</p>
      </div>

      {isLoading && <ChartSkeleton />}
      {error && (
        <div className="py-8">
          <p className="text-red-400 mb-3">Failed to load telemetry data</p>
          <button onClick={() => window.location.reload()} className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded px-4 py-2 transition-colors">
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Lap stat summary */}
          {lapStats && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Top Speed</p>
                <p className="text-xl font-bold text-white">
                  {lapStats.topSpeed}
                  <span className="text-sm font-normal text-gray-400"> km/h</span>
                </p>
                {lapStats.topSpeedDelta !== null && (
                  <p className={`text-xs mt-0.5 font-semibold ${lapStats.topSpeedDelta > 0 ? 'text-green-400' : lapStats.topSpeedDelta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {lapStats.topSpeedDelta > 0 ? '+' : ''}{lapStats.topSpeedDelta} vs {compareDriver}
                  </p>
                )}
              </div>
              <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Corners</p>
                <p className="text-xl font-bold text-white">
                  {cornerZones.length > 0 ? cornerZones.length : <span className="text-gray-600 text-base font-normal">loading…</span>}
                </p>
              </div>
              <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">DRS Zones</p>
                <p className="text-xl font-bold text-white">{drsZones.length}</p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg p-4 mb-4 space-y-4">

            {/* Metric controls */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Metric</p>
              {!overlayMode ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={metric}
                    onChange={e => setMetric(e.target.value)}
                    className="bg-[#15151e] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e10600] cursor-pointer"
                  >
                    {METRICS.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={enterOverlay}
                    className="px-4 py-2 text-sm bg-[#15151e] border border-gray-700 rounded hover:border-[#e10600] hover:text-white text-gray-300 transition-colors"
                  >
                    Compare metrics
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {overlayMetrics.map((key, i) => {
                    const def = METRICS.find(m => m.key === key)!;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: def.color }} />
                        <select
                          value={key}
                          onChange={e => updateOverlayMetric(i, e.target.value)}
                          className="bg-[#15151e] border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#e10600] cursor-pointer"
                        >
                          {METRICS.map(m => (
                            <option key={m.key} value={m.key} disabled={overlayMetrics.includes(m.key) && m.key !== key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        {overlayMetrics.length > 2 && (
                          <button onClick={() => removeOverlayMetric(key)} className="text-gray-500 hover:text-red-500 transition-colors leading-none px-1">×</button>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-1">
                    {overlayMetrics.length < 4 && (
                      <button onClick={addOverlayMetric} className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1 transition-colors">+ Add</button>
                    )}
                    <button onClick={() => setOverlayMode(false)} className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1 transition-colors">Single metric</button>
                    <span className="text-xs text-gray-600">values normalized 0–100</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-800" />

            {/* Driver comparison */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Compare Driver</p>
              {!compareDriver ? (
                <div>
                  <button
                    onClick={() => setShowDriverPicker(v => !v)}
                    className={`px-4 py-2 text-sm bg-[#15151e] border rounded transition-colors ${showDriverPicker ? 'border-white text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'}`}
                  >
                    + Add driver
                  </button>
                  {showDriverPicker && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!sessionDrivers && <span className="text-xs text-gray-500">Loading drivers...</span>}
                      {sessionDrivers
                        ?.filter(d => d.abbreviation !== driver)
                        .map(d => (
                          <button
                            key={d.abbreviation}
                            onClick={() => { setCompareDriver(d.abbreviation); setShowDriverPicker(false); }}
                            className="px-3 py-1.5 text-sm bg-[#15151e] border border-gray-700 rounded hover:border-white transition-colors flex items-center gap-2"
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.team_color }} />
                            <span className="font-mono font-bold">{d.abbreviation}</span>
                            <span className="text-gray-500 text-xs">{d.team}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#15151e] border border-gray-600 rounded text-sm">
                    <span className="text-gray-400">vs</span>
                    <span className="font-mono font-bold">{compareDriver}</span>
                    {compareLoading && <span className="text-xs text-gray-500">loading…</span>}
                  </div>
                  <button
                    onClick={() => setCompareDriver(null)}
                    className="text-gray-500 hover:text-red-500 transition-colors text-sm px-2"
                  >
                    × Remove
                  </button>
                  <div className="flex items-center gap-4 ml-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#9ca3af" strokeWidth="2" /></svg>
                      {driver}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#9ca3af" strokeWidth="2" strokeDasharray="5 3" /></svg>
                      {compareDriver}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-800" />

            {/* Zone toggles */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Overlays</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCorners(v => !v)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${showCorners ? 'border-[#fbbf24] text-[#fbbf24]' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}
                >
                  Corners
                </button>
                <button
                  onClick={() => setShowDrs(v => !v)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${showDrs ? 'border-[#a855f7] text-[#a855f7]' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}
                >
                  DRS zones
                </button>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-[#1e1e2e] rounded-lg p-4 border border-gray-800">
            <p className="text-xs text-gray-500 mb-4">
              {overlayMode
                ? `${overlayMetrics.map(k => METRICS.find(m => m.key === k)?.label).join(' · ')} — normalized over lap distance`
                : `${activeMetric.label} over lap distance`}
            </p>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 16, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="distance"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={v => `${Math.round(Number(v))}m`}
                  label={{ value: 'Distance (m)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  domain={overlayMode ? [0, 100] : undefined}
                  label={overlayMode ? { value: 'Normalized (%)', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 } : undefined}
                />
                <Tooltip
                  content={props => (
                    <CornerTooltip
                      {...props}
                      cornerZones={cornerZones}
                      drsZones={drsZones}
                      overlayMode={overlayMode}
                      metricMaxes={metricMaxes}
                      driver={driver!}
                      compareDriver={compareDriver}
                    />
                  )}
                />

                {showDrs && drsZones.map((zone, i) => (
                  <ReferenceArea key={`drs-${i}`} x1={zone.start} x2={zone.end} fill={DRS_COLOR} fillOpacity={0.1} stroke="none" />
                ))}

                {showCorners && cornerZones.map(zone => (
                  <Fragment key={`${zone.number}${zone.letter}`}>
                    {zone.entry !== null && zone.exit !== null && (
                      <ReferenceArea x1={zone.entry} x2={zone.exit} fill={CORNER_COLOR} fillOpacity={0.12} stroke="none" />
                    )}
                    <ReferenceLine
                      x={zone.apex}
                      stroke={CORNER_COLOR}
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{ value: `T${zone.number}${zone.letter}`, position: 'insideTopRight', fill: CORNER_COLOR, fontSize: 9 }}
                    />
                  </Fragment>
                ))}

                {overlayMode ? (
                  <>
                    {overlayMetrics.map(key => {
                      const def = METRICS.find(m => m.key === key)!;
                      return (
                        <Fragment key={key}>
                          <Line type="monotone" dataKey={key} name={key} stroke={def.color} dot={false} strokeWidth={2} isAnimationActive={false} />
                          {compareDriver && compareData && (
                            <Line type="monotone" dataKey={`${key}_2`} name={`${key}_2`} stroke={def.color} dot={false} strokeWidth={2} strokeDasharray="5 3" strokeOpacity={0.75} isAnimationActive={false} />
                          )}
                        </Fragment>
                      );
                    })}
                    <Legend
                      formatter={(value: string) => METRICS.find(m => m.key === value.replace('_2', ''))?.label ?? value}
                      wrapperStyle={{ paddingTop: '8px', fontSize: '12px', color: '#9ca3af' }}
                    />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey={metric} stroke={activeMetric.color} dot={false} strokeWidth={2} isAnimationActive={false} />
                    {compareDriver && compareData && (
                      <Line type="monotone" dataKey={`${metric}_2`} stroke={activeMetric.color} dot={false} strokeWidth={2} strokeDasharray="5 3" strokeOpacity={0.75} isAnimationActive={false} />
                    )}
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>

            {(showCorners && cornerZones.length > 0) || (showDrs && drsZones.length > 0) ? (
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800">
                {showCorners && cornerZones.length > 0 && <>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block w-6 border-t border-dashed" style={{ borderColor: CORNER_COLOR }} />
                    Corner apex
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block w-4 h-3 rounded-sm" style={{ backgroundColor: CORNER_COLOR, opacity: 0.35 }} />
                    Braking zone
                  </div>
                </>}
                {showDrs && drsZones.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block w-4 h-3 rounded-sm" style={{ backgroundColor: DRS_COLOR, opacity: 0.35 }} />
                    DRS zone
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
