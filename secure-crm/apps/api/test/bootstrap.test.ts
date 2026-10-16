// Arranque del proceso: db.ts (ubicación de la BD), index.ts (servidor) y seed.ts (datos demo).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock('../src/app');
});

describe('db.ts', () => {
  test('con DB_PATH en disco crea el directorio y la BD en modo WAL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-crm-'));
    const file = path.join(dir, 'anidado', 'crm.db');
    vi.stubEnv('DB_PATH', file);
    try {
      const { db, initSchema } = await import('../src/db');
      initSchema();
      expect(fs.existsSync(file)).toBe(true);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
      expect(tables).toEqual(expect.arrayContaining([{ name: 'tickets' }, { name: 'users' }]));
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('auth.ts', () => {
  test('usa JWT_SECRET del entorno y, si falta, el valor de respaldo', async () => {
    vi.stubEnv('JWT_SECRET', 'desde-entorno');
    expect((await import('../src/auth')).JWT_SECRET).toBe('desde-entorno');
    vi.resetModules();
    vi.stubEnv('JWT_SECRET', '');
    expect((await import('../src/auth')).JWT_SECRET).toBe('secret123');
  });
});

describe('index.ts', () => {
  test('inicializa el esquema y escucha en API_PORT', async () => {
    const listen = vi.fn((_port: number, cb: () => void) => cb());
    vi.doMock('../src/app', () => ({ app: { listen } }));
    vi.stubEnv('API_PORT', '4555');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('../src/index');
    expect(listen).toHaveBeenCalledWith(4555, expect.any(Function));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('4555'));
    const { db } = await import('../src/db');
    expect(db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name IN ('users','tickets')").get()).toEqual({ c: 2 });
  });

  test('usa el puerto 4000 por defecto', async () => {
    const listen = vi.fn();
    vi.doMock('../src/app', () => ({ app: { listen } }));
    vi.stubEnv('API_PORT', '');
    await import('../src/index');
    expect(listen).toHaveBeenCalledWith(4000, expect.any(Function));
  });
});

describe('seed.ts', () => {
  test('crea los usuarios demo con contraseñas scrypt verificables y tickets', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('../src/seed');
    const { db } = await import('../src/db');
    const { verifyPassword } = await import('../src/hash');
    const users = db.prepare('SELECT username, role, password_hash FROM users ORDER BY id').all() as any[];
    expect(users.map((u) => [u.username, u.role])).toEqual([
      ['admin', 'admin'],
      ['jperez', 'agent'],
      ['mlopez', 'agent'],
      ['viewer', 'viewer'],
    ]);
    for (const u of users) expect(u.password_hash).toMatch(/^scrypt\$/);
    expect(verifyPassword('Admin123!', users[0].password_hash)).toBe(true);
    expect(verifyPassword('otra', users[0].password_hash)).toBe(false);
    expect((db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as any).c).toBeGreaterThan(0);
  });
});
