import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { flagUrl } from '../utils/countryFlags';

interface Driver {
  number: string;
  abbreviation: string;
  full_name: string;
  team: string;
  team_color: string;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default function EventDetails() {
  const { year, round } = useParams();
  const navigate = useNavigate();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', year, round],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8000/event/${year}/${round}`);
      if (!res.ok) throw new Error('Failed to fetch event');
      return res.json();
    },
  });

  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['session-drivers', year, round, selectedSession],
    queryFn: async () => {
      const res = await fetch(
        `http://localhost:8000/session/${year}/${round}/${encodeURIComponent(selectedSession!)}`
      );
      if (!res.ok) throw new Error('Failed to fetch session drivers');
      return res.json() as Promise<Driver[]>;
    },
    enabled: !!selectedSession,
  });

  useEffect(() => {
    if (event?.EventName) document.title = `${event.EventName} · F1 Telemetry`;
  }, [event]);

  if (isLoading) return (
    <div className="text-white space-y-4 animate-pulse">
      <div className="h-8 bg-[#1e1e2e] rounded w-64" />
      <div className="h-4 bg-[#1e1e2e] rounded w-40" />
    </div>
  );
  if (error) return (
    <div className="text-white">
      <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white mb-6 flex items-center gap-1 transition-colors text-sm">← Back</button>
      <p className="text-red-400 mb-3">Failed to load event</p>
      <button onClick={() => window.location.reload()} className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded px-4 py-2 transition-colors">Retry</button>
    </div>
  );

  const sessions = [
    { key: 'Session1', name: event?.Session1, date: event?.Session1Date },
    { key: 'Session2', name: event?.Session2, date: event?.Session2Date },
    { key: 'Session3', name: event?.Session3, date: event?.Session3Date },
    { key: 'Session4', name: event?.Session4, date: event?.Session4Date },
    { key: 'Session5', name: event?.Session5, date: event?.Session5Date },
  ].filter(s => s.name);

  return (
    <div className="text-white">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-white mb-6 flex items-center gap-1 transition-colors text-sm"
      >
        ← Back
      </button>

      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          {flagUrl(event?.Country) && (
            <img
              src={flagUrl(event.Country)!}
              alt={event.Country}
              className="w-12 h-auto rounded shadow-md flex-shrink-0"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold mb-1">{event?.EventName}</h1>
            <p className="text-gray-400">{event?.Country} · {event?.Location}</p>
          </div>
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-600 bg-[#1e1e2e] border border-gray-800 rounded px-3 py-1.5 mt-1">
          Round {round}
        </span>
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Sessions</h2>
      <div className="flex flex-wrap gap-3 mb-10">
        {sessions.map((session) => {
          const isActive = selectedSession === session.name;
          return (
            <button
              key={session.key}
              onClick={() => setSelectedSession(session.name)}
              className={`px-5 py-3 rounded transition-colors border text-left ${
                isActive
                  ? 'bg-[#e10600] border-[#e10600] text-white'
                  : 'bg-[#1e1e2e] border-gray-700 hover:border-[#e10600] text-gray-300 hover:text-white'
              }`}
            >
              <div className="font-semibold text-sm">{session.name}</div>
              {session.date && (
                <div className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                  {formatDate(String(session.date))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedSession && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            {selectedSession} — Drivers
          </h2>
          {driversLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-20 bg-[#1e1e2e] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {drivers?.map((driver) => (
                <button
                  key={driver.number}
                  onClick={() => navigate(`/event/${year}/${round}/${encodeURIComponent(selectedSession!)}/${driver.abbreviation}`)}
                  className="bg-[#1e1e2e] rounded-lg border border-gray-800 text-left hover:border-[#e10600] transition-colors w-full overflow-hidden flex group"
                >
                  {/* Team color stripe */}
                  <div className="w-1 flex-shrink-0" style={{ backgroundColor: driver.team_color }} />
                  <div className="p-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-sm text-white">{driver.abbreviation}</span>
                      <span className="text-xs text-gray-500 font-mono">#{driver.number}</span>
                    </div>
                    <p className="text-sm text-white font-medium truncate">{driver.full_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{driver.team}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
