import { Router } from 'express';
import { db } from '../db';
import { authenticate, AuthedRequest } from '../middleware/auth';

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);

function mapTicket(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
  SELECT t.*, a.full_name AS assignee_name, c.full_name AS created_by_name
  FROM tickets t
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN users c ON c.id = t.created_by_id
`;

const STATUSES = new Set(['open', 'in_progress', 'closed']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const MAX_QUERY_LENGTH = 200;
// Longitud máxima de cada campo de texto aceptado en POST/PUT.
const TEXT_LIMITS: Record<string, number> = {
  title: 200,
  description: 5000,
  customerName: 200,
  customerEmail: 254,
};

// Valida los campos conocidos del cuerpo (los demás se ignoran, como antes).
// Devuelve un mensaje de error o null. Evita que tipos inesperados (objetos, arrays,
// números enormes) lleguen a better-sqlite3 y provoquen un 500 (ZAP 100000).
function validateTicketBody(b: any): string | null {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return 'Cuerpo inválido';
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    const v = b[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return `El campo ${field} debe ser texto`;
    if (v.length > max) return `El campo ${field} supera ${max} caracteres`;
  }
  if (b.status != null && !STATUSES.has(b.status)) return 'Estado inválido';
  if (b.priority != null && !PRIORITIES.has(b.priority)) return 'Prioridad inválida';
  if (b.assigneeId != null && !(Number.isSafeInteger(b.assigneeId) && b.assigneeId > 0)) {
    return 'assigneeId inválido';
  }
  return null;
}

// Los ids de la ruta deben ser enteros positivos.
function parseId(raw: string): number | null {
  return /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}

// Escapa los comodines de LIKE para que '%' y '_' del usuario se busquen literalmente.
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => '\\' + c);
}

// GET /api/tickets?q=...
// Búsqueda por título, descripción o nombre del cliente con consulta parametrizada:
// 'q' se pasa como parámetro a better-sqlite3 y nunca se concatena al SQL (CWE-89).
// El término 'q' se refleja tal cual en el frontend -> habilita XSS reflejado (CWE-79).
ticketsRouter.get('/', (req, res) => {
  const q = req.query.q ?? '';
  // ?q=a&q=b o ?q[x]=1 llegan como array/objeto: se rechazan en vez de fallar con 500.
  if (typeof q !== 'string') {
    return res.status(400).json({ error: 'El parámetro q debe ser texto' });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ error: `El parámetro q supera ${MAX_QUERY_LENGTH} caracteres` });
  }
  let rows: any[];
  if (q) {
    const sql = String.raw`${SELECT}
      WHERE t.title LIKE @term ESCAPE '\'
         OR t.description LIKE @term ESCAPE '\'
         OR t.customer_name LIKE @term ESCAPE '\'
      ORDER BY t.created_at DESC`;
    rows = db.prepare(sql).all({ term: `%${escapeLike(q)}%` });
  } else {
    rows = db.prepare(`${SELECT} ORDER BY t.created_at DESC`).all();
  }
  res.json({ query: q, tickets: rows.map(mapTicket) });
});

// GET /api/tickets/:id
// Sin verificación de propiedad ni rol (A01 Broken Access Control / IDOR / CWE-639).
// Cualquier usuario autenticado (incluso 'viewer') lee cualquier ticket por id.
ticketsRouter.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Id de ticket inválido' });
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Ticket no encontrado' });
  res.json(mapTicket(row));
});

// POST /api/tickets
// Mass assignment: se aceptan campos del cliente sin lista blanca (A08 / CWE-915).
// No se valida el rol: un 'viewer' (solo lectura) puede crear tickets (A01).
ticketsRouter.post('/', (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  const invalid = validateTicketBody(b);
  if (invalid) return res.status(400).json({ error: invalid });
  const info = db
    .prepare(
      `INSERT INTO tickets (title, description, status, priority, customer_name, customer_email, assignee_id, created_by_id)
       VALUES (@title, @description, @status, @priority, @customer_name, @customer_email, @assignee_id, @created_by_id)`
    )
    .run({
      title: b.title ?? '',
      description: b.description ?? '',
      status: b.status ?? 'open',
      priority: b.priority ?? 'medium',
      customer_name: b.customerName ?? '',
      customer_email: b.customerEmail ?? '',
      assignee_id: b.assigneeId ?? null,
      created_by_id: req.user!.sub,
    });
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(mapTicket(row));
});

// PUT /api/tickets/:id
// Sin verificación de propiedad ni rol (A01 / IDOR): un 'viewer' puede editar
// cualquier ticket de cualquier agente.
ticketsRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Id de ticket inválido' });
  const b = req.body ?? {};
  const invalid = validateTicketBody(b);
  if (invalid) return res.status(400).json({ error: invalid });
  const existing = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Ticket no encontrado' });
  db.prepare(
    `UPDATE tickets SET
       title = @title, description = @description, status = @status, priority = @priority,
       customer_name = @customer_name, customer_email = @customer_email,
       assignee_id = @assignee_id, updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id,
    title: b.title ?? existing.title,
    description: b.description ?? existing.description,
    status: b.status ?? existing.status,
    priority: b.priority ?? existing.priority,
    customer_name: b.customerName ?? existing.customer_name,
    customer_email: b.customerEmail ?? existing.customer_email,
    assignee_id: b.assigneeId ?? existing.assignee_id,
  });
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id);
  res.json(mapTicket(row));
});

// DELETE /api/tickets/:id  (sin verificación de rol -> A01)
ticketsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Id de ticket inválido' });
  const info = db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Ticket no encontrado' });
  res.json({ ok: true });
});
