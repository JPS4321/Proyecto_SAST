import { Router } from 'express';
import { db } from '../db';
import { hashPassword } from '../hash';
import { authenticate, AuthedRequest } from '../middleware/auth';

export const usersRouter = Router();
usersRouter.use(authenticate);

const ROLES = new Set(['admin', 'agent', 'viewer']);
const TEXT_LIMITS: Record<string, number> = { username: 50, email: 254, fullName: 200, password: 256 };

// Solo se seleccionan las columnas que se devuelven: el password_hash nunca sale de la BD.
const PUBLIC_COLUMNS = 'id, username, email, full_name, role, created_at';

// Mínimo privilegio en la respuesta (ZAP 10062 PII Disclosure / CWE-359):
// nunca se devuelve el hash de la contraseña y el correo solo se muestra a administradores,
// que son quienes lo necesitan en la pantalla de gestión de usuarios.
function toPublicUser(r: any, requester?: AuthedRequest['user']) {
  return {
    id: r.id,
    username: r.username,
    ...(requester?.role === 'admin' ? { email: r.email } : {}),
    fullName: r.full_name,
    role: r.role,
    createdAt: r.created_at,
  };
}

// Los ids de la ruta deben ser enteros positivos.
function parseId(raw: string): number | null {
  return /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}

// GET /api/users
// Broken Access Control: NO se valida que el usuario sea admin (A01 / CWE-862).
usersRouter.get('/', (req: AuthedRequest, res) => {
  const rows = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`).all() as any[];
  res.json(rows.map((r) => toPublicUser(r, req.user)));
});

// GET /api/users/:id  (IDOR: cualquier usuario autenticado consulta cualquier id)
usersRouter.get('/:id', (req: AuthedRequest, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Id de usuario inválido' });
  const r = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id) as any;
  if (!r) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(toPublicUser(r, req.user));
});

// POST /api/users
// Mass assignment / escalada de privilegios (A01 + A08 / CWE-915):
// se acepta el campo 'role' directo del cliente, sin lista blanca ni check de admin.
// Un usuario cualquiera puede crear una cuenta con "role":"admin".
usersRouter.post('/', (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'Cuerpo inválido' });
  if (typeof b.username !== 'string' || !b.username.trim()) {
    return res.status(400).json({ error: 'El campo username es obligatorio' });
  }
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    const v = b[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return res.status(400).json({ error: `El campo ${field} debe ser texto` });
    if (v.length > max) return res.status(400).json({ error: `El campo ${field} supera ${max} caracteres` });
  }
  if (b.role != null && !ROLES.has(b.role)) return res.status(400).json({ error: 'Rol inválido' });
  try {
    const info = db
      .prepare(
        `INSERT INTO users (username, email, full_name, role, password_hash)
         VALUES (@username, @email, @full_name, @role, @password_hash)`
      )
      .run({
        username: b.username,
        email: b.email ?? '',
        full_name: b.fullName ?? b.username,
        role: b.role ?? 'viewer',
        password_hash: hashPassword(String(b.password ?? 'changeme')),
      });
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as any;
    res.status(201).json({
      id: r.id, username: r.username, email: r.email,
      fullName: r.full_name, role: r.role, createdAt: r.created_at,
    });
  } catch (err: any) {
    // Sin detalle del motor de BD en la respuesta (CWE-209).
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    console.error(err);
    res.status(400).json({ error: 'No se pudo crear el usuario' });
  }
});

// PUT /api/users/:id/role  (cambio de rol sin check de admin -> A01)
usersRouter.put('/:id/role', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Id de usuario inválido' });
  const b = req.body ?? {};
  if (!ROLES.has(b.role)) return res.status(400).json({ error: 'Rol inválido' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, id);
  const r = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as any;
  if (!r) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ id: r.id, username: r.username, role: r.role });
});
