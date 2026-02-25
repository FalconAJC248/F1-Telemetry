import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => { document.title = 'F1 Telemetry'; }, []);

  return (
    <div className="text-white">
      {/* Hero */}
      <div className="py-16 max-w-2xl">
        <p className="text-[#e10600] text-sm font-semibold tracking-widest uppercase mb-4">
          Formula 1 Data
        </p>
        <h1 className="text-5xl font-bold leading-tight mb-6">
          Explore F1 telemetry,<br />lap by lap.
        </h1>
        <p className="text-gray-400 text-lg leading-relaxed mb-10">
          Dive into fastest-lap telemetry for any driver, race and season.
          Compare speed, throttle, braking, gear and DRS — all in one place.
        </p>
        <button
          onClick={() => navigate('/telemetry')}
          className="inline-flex items-center gap-3 px-8 py-4 bg-[#e10600] hover:bg-[#b30500] text-white font-bold rounded transition-colors text-lg"
        >
          Browse Races
          <span className="text-xl">→</span>
        </button>
      </div>

      {/* Feature highlights */}
      <div className="border-t border-gray-800 pt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { icon: '📈', title: 'Telemetry charts', body: 'Speed, throttle, braking, RPM and gear plotted over lap distance.' },
          { icon: '🔁', title: 'Driver comparison', body: 'Overlay two drivers on the same chart to find where time is gained or lost.' },
          { icon: '🏎️', title: 'Corner & DRS data', body: 'See braking zones, corner apexes and DRS activation regions at a glance.' },
        ].map(f => (
          <div key={f.title} className="bg-[#1e1e2e] border border-gray-800 rounded-lg p-5">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="font-bold text-white mb-1">{f.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
