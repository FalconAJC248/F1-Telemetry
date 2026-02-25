import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { flagUrl } from '../utils/countryFlags';

interface Race {
  RoundNumber: number;
  Country: string;
  Location: string;
  EventName: string;
  EventDate: string;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

const TODAY = new Date();

export default function YearSelect() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const years = [2026, 2025, 2024, 2023, 2022, 2021, 2020];
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Explore Races · F1 Telemetry'; }, []);

  const { data: races, isLoading, error } = useQuery<Race[]>({
    queryKey: ['races', selectedYear],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/races/${selectedYear}`);
      if (!res.ok) throw new Error('Failed to fetch races');
      return res.json();
    },
    enabled: selectedYear !== null,
  });

  const upcoming = races?.filter(r => new Date(r.EventDate) >= TODAY) ?? [];
  const past = races?.filter(r => new Date(r.EventDate) < TODAY) ?? [];

  const RaceCard = ({ race }: { race: Race }) => (
    <div
      onClick={() => navigate(`/event/${selectedYear}/${encodeURIComponent(race.EventName)}`)}
      className="flex items-center gap-4 p-4 bg-[#1e1e2e] border border-gray-800 rounded-lg cursor-pointer hover:border-[#e10600] transition-colors group"
    >
      <div className="w-8 flex-shrink-0 flex items-center justify-center">
        {flagUrl(race.Country)
          ? <img src={flagUrl(race.Country)!} alt={race.Country} className="w-7 h-auto rounded-sm shadow-sm" />
          : <span className="text-gray-600 text-lg">🏁</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white group-hover:text-[#e10600] transition-colors truncate">{race.EventName}</div>
        <div className="text-sm text-gray-400">{race.Location}, {race.Country}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Round {race.RoundNumber}</div>
        {race.EventDate && <div className="text-xs text-gray-500 mt-0.5">{formatDate(race.EventDate)}</div>}
      </div>
      <span className="text-gray-600 group-hover:text-[#e10600] transition-colors ml-1">→</span>
    </div>
  );

  return (
    <div className="text-white">
      <h1 className="text-3xl font-bold mb-2">Explore Races</h1>
      <p className="text-gray-400 mb-6">Select a season to browse events and driver telemetry.</p>

      <div className="flex flex-wrap gap-3 mb-8">
        {years.map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-6 py-2.5 rounded font-semibold transition-colors border ${
              selectedYear === year
                ? 'bg-[#e10600] border-[#e10600] text-white'
                : 'bg-[#1e1e2e] border-gray-700 text-gray-300 hover:border-[#e10600] hover:text-white'
            }`}
          >
            {year}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!selectedYear && (
        <div className="py-16 text-center border border-dashed border-gray-800 rounded-lg">
          <p className="text-gray-600 text-sm">Select a season above to browse races</p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 bg-[#1e1e2e] rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-8 text-center">
          <p className="text-red-400 mb-3">Failed to load races</p>
          <button
            onClick={() => setSelectedYear(s => s)}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded px-4 py-2 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {races && (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[#e10600]">Upcoming</h2>
                <span className="text-xs text-gray-600">{upcoming.length} races</span>
              </div>
              <div className="space-y-2">{upcoming.map(r => <RaceCard key={r.RoundNumber} race={r} />)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                {upcoming.length > 0
                  ? <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Past Races</h2>
                  : <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">{selectedYear} Season</h2>
                }
                <span className="text-xs text-gray-600">{past.length} races</span>
              </div>
              <div className="space-y-2">{past.map(r => <RaceCard key={r.RoundNumber} race={r} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
