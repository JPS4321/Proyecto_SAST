// Arranca la app Express real sobre la BD SQLite en memoria (DB_PATH=:memory:, ver
// vitest.config.ts) con un admin, un agente y un viewer cuyas contraseñas son reales.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { db, initSchema } from '../src/db';
import { app } from '../src/app';
import { JWT_SECRET } from '../src/auth';
import { hashPassword } from '../src/hash';

export const PASSWORDS = { admin: 'Admin123!', agent: 'Agente#2024', viewer: 'viewer-pass' } as const;

export interface TestServer {
  db: typeof db;
  ids: { admin: number; agent: number; viewer: number };
  tokens: { admin: string; agent: string; viewer: string };
  api: (path: string, init?: RequestInit & { token?: string | null }) => Promise<Response>;
  close: () => Promise<void>;
}

export function signToken(sub: number, username: string, role: string, secret = JWT_SECRET) {
  return jwt.sign({ sub, username, role }, secret);
}

export async function startServer(): Promise<TestServer> {
  initSchema();
  const insertUser = db.prepare(
    `INSERT INTO users (username, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)`
  );
  const ids = {
    admin: Number(insertUser.run('admin', 'admin@test.local', 'Ada Admin', 'admin', hashPassword(PASSWORDS.admin)).lastInsertRowid),
    agent: Number(insertUser.run('agente', 'agente@test.local', 'Ana Agente', 'agent', hashPassword(PASSWORDS.agent)).lastInsertRowid),
    viewer: Number(insertUser.run('viewer', 'viewer@test.local', 'Víctor Vista', 'viewer', hashPassword(PASSWORDS.viewer)).lastInsertRowid),
  };
  const tokens = {
    admin: signToken(ids.admin, 'admin', 'admin'),
    agent: signToken(ids.agent, 'agente', 'agent'),
    viewer: signToken(ids.viewer, 'viewer', 'viewer'),
  };

  const server: Server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const api: TestServer['api'] = (path, init = {}) => {
    const { token = tokens.admin, ...rest } = init;
    return fetch(baseUrl + path, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });
  };

  return {
    db,
    ids,
    tokens,
    api,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
