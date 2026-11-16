import { describe, it, expect } from 'vitest';
import { configurationIssues } from '../apps/server/src/config';
const valid = {
  NODE_ENV: 'production',
  SESSION_SECRET: 's'.repeat(48),
  ADMIN_TOKEN: 'a'.repeat(48),
  MONGODB_URI: 'mongodb://127.0.0.1/chaos',
  WEB_ORIGIN: 'https://play.example.com',
  API_ORIGIN: 'https://api.example.com',
};
describe('production startup configuration', () => {
  it('accepts valid config without requiring optional Google credentials', () =>
    expect(configurationIssues(valid)).toEqual([]));
  it('rejects missing secrets, database and insecure or malformed origins', () => {
    const issues = configurationIssues({
      ...valid,
      SESSION_SECRET: 'short',
      ADMIN_TOKEN: '',
      MONGODB_URI: '',
      WEB_ORIGIN: 'http://play.example.com',
      API_ORIGIN: 'https://user:secret@api.example.com/callback',
    });
    expect(issues).toHaveLength(5);
    expect(issues.join(' ')).not.toContain('user:secret');
  });
  it('requires paired Google credentials', () =>
    expect(configurationIssues({ ...valid, GOOGLE_CLIENT_ID: 'client' })).toContain(
      'Configure both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
    ));
  it('rejects invalid limits instead of silently disabling throttling', () =>
    expect(
      configurationIssues({ MAX_ROOMS: 'NaN', MAX_CONNECTIONS_PER_IP: '-1', TRUST_PROXY: 'all' }),
    ).toHaveLength(3));
});
