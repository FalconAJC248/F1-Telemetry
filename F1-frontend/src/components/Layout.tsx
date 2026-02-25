import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const navActive = pathname.startsWith('/telemetry') || pathname.startsWith('/event');

  return (
    <div className="min-h-screen bg-[#15151e]">
      {/* F1 red accent stripe */}
      <div className="h-1 bg-[#e10600]" />

      <header className="bg-[#1e1e2e] border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
              <span className="text-2xl font-bold text-[#e10600]">F1</span>
              <span className="text-xl text-white ml-2 font-semibold">Telemetry</span>
            </Link>
            <nav>
              <Link
                to="/telemetry"
                className={`text-sm font-semibold tracking-wide transition-colors relative pb-0.5 ${
                  navActive
                    ? 'text-white after:absolute after:inset-x-0 after:-bottom-[17px] after:h-0.5 after:bg-[#e10600]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Explore Races
              </Link>
            </nav>
          </div>

          <button
            onClick={() => navigate('/upload')}
            className={`flex items-center gap-2 px-4 py-2 text-sm border rounded transition-colors font-semibold ${
              pathname === '/upload'
                ? 'border-[#e10600] text-white'
                : 'border-gray-600 text-gray-300 hover:border-[#e10600] hover:text-white'
            }`}
          >
            <span className="text-base leading-none">↑</span>
            Upload Telemetry
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
