'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Command, Snapshot, ClientEvents, ServerEvents } from '@chaos/shared';
export function serverUrl() {
  return (
    process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/+$/, '') ||
    (typeof window === 'undefined'
      ? 'http://localhost:4000'
      : `${window.location.protocol}//${window.location.hostname}:4000`)
  );
}
function commandId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type Identity = {
  id: string;
  user: { name: string; skin: string; owned: string[] } | null;
  googleEnabled: boolean;
  storage: string;
};
export type GameSocket = Socket<ServerEvents, ClientEvents>;
export function useConnection() {
  const socket = useRef<GameSocket | null>(null),
    [identity, setIdentity] = useState<Identity | null>(null),
    [state, setState] = useState<Snapshot | null>(null),
    [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting'),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        const response = await fetch(`${serverUrl()}/api/session`, {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const value = (await response.json()) as Identity;
        if (disposed) return;
        setIdentity(value);
        const s = io(serverUrl(), {
          withCredentials: true,
          autoConnect: false,
          reconnectionDelay: 500,
          reconnectionDelayMax: 3000,
        });
        socket.current = s;
        s.on('connect', () => setConnection('online'));
        s.on('disconnect', () => setConnection('offline'));
        s.on('connect_error', (error) => {
          setConnection('offline');
          if (error.message === 'SESSION_REQUIRED') {
            s.disconnect();
            setState(null);
            setAttempt((n) => n + 1);
          }
        });
        s.on('snapshot', setState);
        s.on('notice', (n) => {
          setNotice(n.message);
          if (['REMOVED_BY_HOST', 'SESSION_MOVED'].includes(n.message)) {
            setState(null);
            history.replaceState(null, '', '/');
          }
        });
        s.connect();
      } catch {
        if (!disposed) {
          setConnection('offline');
          retry = setTimeout(connect, 3000);
        }
      }
    }
    connect();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(retry);
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [attempt]);
  function send(data: Omit<Command, 'id'> | Record<string, unknown>): Promise<Ack> {
    return new Promise((resolve) => {
      const s = socket.current;
      if (!s?.connected) {
        resolve({ ok: false, error: 'OFFLINE' });
        return;
      }
      const command = { ...data, id: commandId() } as Command;
      let tries = 0;
      function emit() {
        s!.timeout(3500).emit('command', command, (err: Error | null, result: Ack) => {
          if (err) {
            if (++tries < 3 && s!.connected) emit();
            else resolve({ ok: false, error: 'OFFLINE' });
          } else resolve(result);
        });
      }
      emit();
    });
  }
  return {
    socket,
    identity,
    state,
    setState,
    connection,
    notice,
    setNotice,
    send,
    retry: () => setAttempt((n) => n + 1),
  };
}
