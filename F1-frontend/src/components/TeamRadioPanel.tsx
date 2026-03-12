import { useRef, useState } from 'react';

interface RadioCapture {
  RacingNumber?: string;
  UtcTime?: string;
  Path?: string;
}

interface Props {
  captures: RadioCapture[];
  driverInfo: Record<string, { Tla: string; TeamColour: string }>;
}

const AUDIO_BASE = 'https://livetiming.formula1.com';

export default function TeamRadioPanel({ captures, driverInfo }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingPath, setPlayingPath] = useState<string | null>(null);

  if (captures.length === 0) return null;

  function toggle(path: string) {
    const url = AUDIO_BASE + (path.startsWith('/') ? path : '/' + path);
    if (playingPath === path) {
      audioRef.current?.pause();
      setPlayingPath(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingPath(null);
    setPlayingPath(path);
  }

  return (
    <div className="bg-[#1e1e2e] border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-800">
        <span className="text-[10px] uppercase tracking-widest text-gray-600">Team Radio</span>
      </div>
      <div className="flex flex-col divide-y divide-gray-800/60 max-h-48 overflow-y-auto">
        {[...captures].reverse().map((c, i) => {
          if (!c.Path) return null;
          const info = c.RacingNumber ? driverInfo[c.RacingNumber] : undefined;
          const color = info?.TeamColour ? `#${info.TeamColour}` : '#555';
          const tla = info?.Tla ?? c.RacingNumber ?? '?';
          const time = c.UtcTime ? new Date(c.UtcTime).toLocaleTimeString() : '';
          const isPlaying = playingPath === c.Path;

          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2">
              <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="font-bold text-sm" style={{ color }}>{tla}</span>
              <span className="text-xs text-gray-600 flex-shrink-0">{time}</span>
              <button
                onClick={() => toggle(c.Path!)}
                className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors flex-shrink-0 ${
                  isPlaying
                    ? 'bg-[#e10600]/20 text-[#e10600] border border-[#e10600]/30'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {isPlaying ? '■ Stop' : '▶ Play'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
