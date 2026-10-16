import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './auth';
import { ticketsRouter } from './routes/tickets';
import { usersRouter } from './routes/users';
import { dashboardRouter } from './routes/dashboard';

export const app = express();
// Oculta el header X-Powered-By: Express para no revelar el framework (S5689 / CWE-200).
app.disable('x-powered-by');

// X-Content-Type-Options: nosniff en TODAS las respuestas (incluidos 401/404/500),
// para que el navegador no reinterprete el cuerpo con otro tipo MIME (ZAP 10021 / CWE-693).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// CORS totalmente permisivo con credenciales (A02 Security Misconfiguration / CWE-942):
// refleja cualquier Origin y permite enviar cookies. Habilita CSRF y robo cross-origin.
app.use(
  cors({
    origin: (_origin, cb) => cb(null, true),
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// NOTA: siguen sin configurarse otras cabeceras de seguridad (helmet):
//   Content-Security-Policy, X-Frame-Options, Strict-Transport-Security,
//   Referrer-Policy. (A02 / CWE-16, CWE-693).

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'secure-crm-api' }));

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/users', usersRouter);
app.use('/api/dashboard', dashboardRouter);

// Rutas inexistentes: 404 en JSON, igual que el resto de la API, en lugar de la
// página HTML por defecto de Express (ZAP 100001 Unexpected Content-Type).
app.use((_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

// Manejador de errores: registra el detalle en el servidor y responde al cliente con
// un mensaje genérico, sin stack ni mensajes internos (CWE-209 / ZAP 100000).
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Errores del parser de JSON (cuerpo malformado o demasiado grande): son del cliente.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Cuerpo de la petición demasiado grande' });
  }
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Petición inválida' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
