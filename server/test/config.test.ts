import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('parses valid env', () => {
    const cfg = loadConfig({ PORT: '5900', DATA_DIR: '/data', NODE_ENV: 'production' });
    expect(cfg.port).toBe(5900);
    expect(cfg.dataDir).toBe('/data');
    expect(cfg.nodeEnv).toBe('production');
  });

  it('defaults PORT to 5900 and NODE_ENV to development', () => {
    const cfg = loadConfig({ DATA_DIR: '/data' });
    expect(cfg.port).toBe(5900);
    expect(cfg.nodeEnv).toBe('development');
  });

  it('throws if DATA_DIR is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATA_DIR/);
  });

  it('throws if PORT is not a number', () => {
    expect(() => loadConfig({ DATA_DIR: '/data', PORT: 'abc' })).toThrow();
  });

  it('exposes derived paths', () => {
    const cfg = loadConfig({ DATA_DIR: '/x' });
    expect(cfg.dbPath).toBe('/x/db/receipts.db');
    expect(cfg.fileRoot).toBe('/x/file');
  });
});
