'use client';
import { useState } from 'react';
import { serverUrl } from '../../lib/client';
type Overview = {
  draining: boolean;
  healthy: boolean;
  metrics: Record<string, number>;
  rooms: { code: string; phase: string; players: number; connected: number }[];
};
export default function Admin() {
  const [token, setToken] = useState(''),
    [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function request(path = '/api/admin', body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${serverUrl()}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(`Request rejected (${response.status})`);
      if (!body) setData(await response.json());
      else await request();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page" dir="ltr">
      <span className="section-kicker">CHAOS ROOM / OPERATIONS</span>
      <h1>
        Server control<span className="accent">.</span>
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        The admin token stays in memory for this tab. It is never stored on this device.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void request();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          aria-label="Admin token"
          placeholder="Admin token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <button disabled={busy} className="button primary">
          Connect
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p style={{ marginTop: 20 }}>
            Database: {data.healthy ? 'healthy' : 'unavailable'} · New matches:{' '}
            {data.draining ? 'paused' : 'enabled'}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void request('/api/admin/drain', { enabled: !data.draining })}
          >
            {data.draining ? 'Resume new matches' : 'Pause new matches'}
          </button>
          <button className="button secondary" onClick={() => void request()}>
            Refresh
          </button>
          <pre>
            {Object.entries(data.metrics)
              .map(([name, value]) => `${name}: ${value}`)
              .join('\n')}
          </pre>
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Phase</th>
                <th>Connected</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => (
                <tr key={room.code}>
                  <td>{room.code}</td>
                  <td>{room.phase}</td>
                  <td>
                    {room.connected}/{room.players}
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      disabled={room.phase === 'cancelled'}
                      onClick={() => {
                        if (window.confirm(`Stop room ${room.code}?`))
                          void request('/api/admin/close', { code: room.code });
                      }}
                    >
                      Stop match
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
