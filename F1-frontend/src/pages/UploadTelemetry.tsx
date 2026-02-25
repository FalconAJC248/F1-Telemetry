import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function UploadTelemetry() {
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Upload Telemetry · F1 Telemetry'; }, []);

  return (
    <div className="text-white max-w-lg mx-auto py-24 flex flex-col items-center text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-[#1e1e2e] border border-gray-700 flex items-center justify-center mb-6">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <p className="text-xs font-semibold uppercase tracking-widest text-[#e10600] mb-3">Coming Soon</p>
      <h1 className="text-3xl font-bold mb-4">Upload Your Telemetry</h1>
      <p className="text-gray-400 leading-relaxed mb-8">
        We're working on the ability to import your own telemetry data from sim racing or real
        data loggers and visualise it alongside official F1 sessions.
      </p>

      <ul className="text-left space-y-3 mb-10 w-full">
        {[
          'Import CSV or proprietary data logger formats',
          'Overlay your data against F1 driver telemetry',
          'Compare sector times and driving lines',
        ].map(item => (
          <li key={item} className="flex items-start gap-3 text-sm text-gray-400">
            <span className="mt-0.5 w-4 h-4 rounded-full border border-gray-700 flex-shrink-0 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <button
        onClick={() => navigate('/')}
        className="px-6 py-3 bg-[#1e1e2e] border border-gray-700 rounded hover:border-[#e10600] hover:text-white text-gray-300 transition-colors text-sm font-semibold"
      >
        ← Back to home
      </button>
    </div>
  );
}
