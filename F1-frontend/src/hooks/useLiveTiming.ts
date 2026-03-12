import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveTimingState = Record<string, unknown>;

interface UseLiveTimingResult {
  state: LiveTimingState;
  connected: boolean;
}

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/live`;
const RECONNECT_DELAY_MS = 3000;

export function useLiveTiming(): UseLiveTimingResult {
  const [state, setState] = useState<LiveTimingState>({});
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'snapshot') {
          setState(msg.data);
        } else if (msg.type === 'update') {
          setState(prev => ({ ...prev, [msg.topic as string]: msg.data }));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, connected };
}
