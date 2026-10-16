# Informe técnico de vulnerabilidades identificadas y corregidas — Secure CRM

**Proyecto:** Secure CRM (monorepo pnpm: `apps/api` Express + better-sqlite3, `apps/web` Next.js, `packages/shared`)
**Rama analizada:** `correcciones-sonarqube`
**Commits relevantes:**

| Commit | Fecha (‑06:00) | Contenido |
|---|---|---|
| `2494b78` | 2026‑10‑15 21:00 | Código original (línea base vulnerable) |
| `899aa53` | 2026‑10‑16 01:03 | Se agregan los reportes de `analisis-seguridad/despues/` (SonarQube, ZAP, Semgrep, audit) |
| `fa9b177` | 2026‑10‑16 08:52 | Correcciones de código, configuración, dependencias, pruebas automatizadas y reportes `antes/` |
| `f7c9be4` | 2026‑10‑16 09:19 | Actualización de `despues/audit.json`, `despues/reporte-zap-api-baseline.html` y `despues/reporte-zap-baseline.html` |

**Herramientas:** SonarQube (SAST + importación de SARIF), Semgrep OSS (SAST), OWASP ZAP (DAST), `pnpm audit` (SCA).

> **Nota sobre la clasificación OWASP:** se usa la numeración del **OWASP Top 10:2025**, que es la que aparece en los comentarios del propio código (A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A07 Authentication Failures, A08 Software or Data Integrity Failures, A10 Mishandling of Exceptional Conditions).

---

## 0. Alcance, metodología y advertencias de comparabilidad

### 0.1 Fuentes de evidencia utilizadas

- Código fuente actual y su diferencia con la línea base (`git diff 2494b78 fa9b177`).
- Reportes en `analisis-seguridad/antes/` y `analisis-seguridad/despues/`.
- Ejecución de las pruebas automatizadas (`pnpm test`) en el estado actual de la rama, realizada al elaborar este informe:

```
apps/api:  Test Files 7 passed (7) — Tests 66 passed | 5 expected fail (71)
apps/web:  Test Files 5 passed (5) — Tests 33 passed (33)
```

Los **5 "expected fail"** son pruebas marcadas con `test.fails` que documentan vulnerabilidades que **siguen presentes** (JWT sin verificación de firma y control de acceso roto). Se detallan en la sección de riesgos residuales.

### 0.2 Tipos de hallazgo

En este informe se distinguen tres categorías:

| Categoría | Significado |
|---|---|
| **Vulnerabilidad confirmada** | Hay evidencia explotable o directa: alerta de ataque activo (p. ej. ZAP 40018), código que demuestra el fallo, o prueba automatizada que lo reproduce. |
| **Advertencia de herramienta** | Alerta de configuración, *hotspot* o regla heurística (cabeceras, usuario del contenedor, versión expuesta). Es un riesgo real pero de explotabilidad indirecta. |
| **Problema de mantenibilidad** | *Code smell* de SonarQube sin impacto directo de seguridad. |

### 0.3 Advertencias sobre los escaneos antes/después (**importante**)

Los análisis "antes" y "después" **no se ejecutaron con alcances ni configuraciones idénticos**. Esto debe tenerse en cuenta al interpretar las reducciones:

1. **SonarQube cambió de alcance.** En `fa9b177` se modificó `sonar-project.properties`:
   - `sonar.sources=.` → `sonar.sources=apps,packages`: **la carpeta `docs/` dejó de analizarse**. 13 de los 41 hallazgos "antes" estaban en `docs/`; su desaparición en el "después" no es, por sí sola, prueba de corrección (aunque el código de `docs/` sí se modificó, ver §M).
   - Se **eliminó** `sonar.sarifReportPaths=semgrep.sarif`: el análisis "después" **ya no importa los resultados de Semgrep**. Los 3 hallazgos `external_Semgrep OSS:*` del "antes" no pueden reaparecer en SonarQube por diseño; su verificación debe hacerse con el SARIF de Semgrep directamente (que sí reporta 0 resultados).
   - Se agregaron `sonar.tests`, exclusión de `apps/*/test/**` y cobertura (`lcov`).
2. **Momento del análisis de SonarQube.** El reporte "después" se generó el 16/10/2026 a las 01:01, *antes* del commit de las correcciones (08:52). Por tanto se analizó el árbol de trabajo de ese momento, que no puede vincularse con certeza a un commit concreto.
3. **Versiones de Semgrep distintas:** 1.180.0 (antes) vs 1.181.0 (después). Ambos cargaron 1 074 reglas, por lo que el conjunto de reglas parece equivalente, pero no se conserva la línea de comandos usada.
4. **ZAP — tipos de escaneo distintos:**

   | Objetivo | Antes | Después |
   |---|---|---|
   | API, baseline (pasivo) | `reporte-zap-api-baseline.html` | `reporte-zap-api-baseline.html` |
   | API, full (activo) sin autenticación | `reporte-zap-api-full.html` | `reporte-zap-api-full.html` (generado 15/10 23:53 local, **antes** de terminar algunas correcciones, ver V‑09) |
   | API autenticada | `reporte-zap-api-autenticado.html` (solo alertas pasivas) | `reporte-zap-api-full-autenticado.html` (full) |
   | Frontend, baseline | `reporte-zap-baseline.html` | `reporte-zap-baseline.html` |
   | Frontend, full | `reporte-zap-full-rapido.html` (cubre `:3000` y `:4000`) | **No disponible: el ZAP Full Scan del frontend no se completó por falta de recursos** |

   En consecuencia, **no existe verificación DAST activa del frontend después de las correcciones**.
5. **`pnpm audit`:** el número de dependencias pasó de 305 a 435 (se agregaron Vitest, Testing Library, jsdom, etc.), por lo que la superficie analizada cambió.
6. **Limitación de detección:** ni SonarQube ni Semgrep detectaron en el "antes" la inyección SQL, el JWT sin verificar, el IDOR ni el XSS. Que una herramienta reporte 0 hallazgos **no implica** ausencia de vulnerabilidades; varias de las más graves siguen presentes (§R).

---

## 1. Tabla resumen

### 1.1 Hallazgos corregidos

| ID | Vulnerabilidad | Herramienta | Severidad | Archivo afectado | Solución propuesta | Solución implementada | Estado |
|---|---|---|---|---|---|---|---|
| V‑01 | SQL Injection en login | ZAP (40018, activo) | **High** (ZAP) | `apps/api/src/auth.ts` | Consultas parametrizadas | `SELECT … WHERE username = ?` + verificación de contraseña en código | **Verificada** |
| V‑02 | SQL Injection en búsqueda de tickets | ZAP (40018, activo) | **High** (ZAP) | `apps/api/src/routes/tickets.ts` | Consultas parametrizadas + escape de `LIKE` | Parámetro `@term` con `ESCAPE '\'`, validación de tipo/longitud de `q` | **Verificada** |
| V‑03 | Hash de contraseñas con MD5 sin salt | SonarQube (S4790), Semgrep (`md5-used-as-password`) | **Critical** (Sonar) / Warning (Semgrep) | `apps/api/src/hash.ts` | KDF lenta con salt (bcrypt/argon2/scrypt) | scrypt + salt aleatorio de 16 B + `timingSafeEqual` | **Verificada** |
| V‑04 | Contenedores ejecutados como `root` | Semgrep (`missing-user`), SonarQube (S6471) | **Critical** (Semgrep vía Sonar) / Minor (S6471) | `apps/api/Dockerfile`, `apps/web/Dockerfile` | Declarar usuario no privilegiado | `USER node` + `chown` de directorios de escritura | **Verificada** (SAST) |
| V‑05 | Divulgación de información en errores (SQL, stack, mensajes del motor) | ZAP (100000, 500 en `q` y login); revisión de código | Low (ZAP) | `apps/api/src/index.ts`, `auth.ts`, `routes/users.ts` | Mensajes genéricos al cliente, registro en servidor | Nuevo manejador de errores en `app.ts`; respuestas genéricas | **Verificada** |
| V‑06 | Validación de entrada insuficiente (500 ante tipos inesperados) | ZAP (100000) | Low (ZAP) | `routes/tickets.ts`, `routes/users.ts`, `index.ts` | Validación de tipos, listas blancas, límites | `validateTicketBody`, `parseId`, `ROLES`, límite `100kb` | **Verificada** |
| V‑07 | Exposición de `password_hash` y PII en `/api/users` | Revisión de código (sin alerta en los reportes) | No asignada por herramienta | `apps/api/src/routes/users.ts` | Minimización de datos | Columnas explícitas sin hash; correo solo para admin | **Verificada por pruebas** (sin evidencia de herramienta) |
| V‑08 | Cabecera `X-Powered-By` (API) | SonarQube (S5689), ZAP (10037) | Minor (Sonar) / Low (ZAP) | `apps/api/src/index.ts` | Deshabilitar cabecera | `app.disable('x-powered-by')` | **Verificada en API**; persiste en frontend |
| V‑09 | Falta `X-Content-Type-Options` | ZAP (10021) | Low | API y frontend | Enviar `nosniff` en todas las respuestas | Middleware en `app.ts`; `headers()` en `next.config.mjs` | **Verificada** (API parcialmente, ver detalle) |
| V‑10 | Respuestas `text/html` en la API (404 por defecto de Express) | ZAP (100001) | Low | `apps/api/src/index.ts` | 404 en JSON | Manejador 404 JSON en `app.ts` | **Parcialmente verificada** |
| V‑11 | Dependencias con vulnerabilidades conocidas | pnpm audit | 6 Critical, 18 High, 25 Moderate, 4 Low | `package.json` (raíz, api, web), `pnpm-lock.yaml` | Actualizar a versiones parcheadas | `next 15.5.28`, `jsonwebtoken ^9.0.3`, `lodash ^4.18.1`, `express ^4.22.3`, overrides | **Verificada** (queda 1 High sin parche) |
| V‑12 | Instalación en Docker sin lockfile | Revisión de código (sin alerta) | No asignada | Dockerfiles | `--frozen-lockfile` | Se copia `pnpm-lock.yaml` y se usa `--frozen-lockfile` | Implementada, **sin verificación de herramienta** |
| M‑01…M‑34 | 34 *code smells* (mantenibilidad) | SonarQube | Major/Minor | `apps/web/**`, `apps/api/src/db.ts`, `hash.ts`, `docs/**` | Refactorizaciones menores | Ver §M | **Verificada** en `apps`; `docs/` corregido pero **fuera del alcance** del escaneo posterior |

### 1.2 Hallazgos NO corregidos (riesgos residuales)

| ID | Vulnerabilidad | Evidencia | Archivo | Estado |
|---|---|---|---|---|
| R‑01 | **JWT sin verificación de firma** (`jwt.decode`) — CWE‑347 | Código + 2 pruebas `test.fails` | `apps/api/src/middleware/auth.ts:21` | **Pendiente — sigue vulnerable** |
| R‑02 | Secreto JWT débil por defecto (`'secret123'`) — CWE‑798 | Código | `apps/api/src/auth.ts:9` | Pendiente |
| R‑03 | **Control de acceso roto / IDOR / escalada de privilegios** — CWE‑639/862/915 | Código + 3 pruebas `test.fails` | `routes/tickets.ts`, `routes/users.ts` | **Pendiente — sigue vulnerable** |
| R‑04 | XSS mediante `dangerouslySetInnerHTML` — CWE‑79 | Código (no detectado por herramientas) | `apps/web/app/tickets/page.tsx:70,102`, `apps/web/app/tickets/[id]/page.tsx:97` | Pendiente |
| R‑05 | Cookie de sesión sin `HttpOnly`/`Secure`/`SameSite`; token en `localStorage` | Código | `apps/api/src/auth.ts:48`, `apps/web/lib/api.ts:13` | Pendiente |
| R‑06 | CORS que refleja cualquier origen con credenciales — CWE‑942 | Código | `apps/api/src/app.ts:22-27` | Pendiente |
| R‑07 | Sin limitación de intentos de login — CWE‑307 | Código | `apps/api/src/auth.ts:23-24` | Pendiente |
| R‑08 | Cabeceras de seguridad ausentes en el frontend (CSP, anti‑clickjacking, COEP/COOP/CORP, Permissions‑Policy, `X-Powered-By: Next.js`) | ZAP baseline después | `apps/web/next.config.mjs` | Pendiente |
| R‑09 | `braces@3.0.3` (GHSA‑vfj7‑8cjw‑p6xm, High, sin versión parcheada) | pnpm audit después | dependencia transitiva de `tailwindcss` | Pendiente (sin parche disponible) |
| R‑10 | Contraseña por defecto `'changeme'` al crear usuarios | Código | `apps/api/src/routes/users.ts:78` | Pendiente |

---

## 2. Desarrollo de cada hallazgo corregido

### V‑01 — SQL Injection en el endpoint de login

#### 1. Vulnerabilidad encontrada

- **Tipo:** Vulnerabilidad confirmada.
- **Descripción técnica:** la consulta de autenticación se construía concatenando directamente `username` (entrada del cliente) y el hash de la contraseña en una cadena SQL. Un atacante puede cerrar la comilla e inyectar SQL, p. ej. `admin' --`, que comenta la comparación de la contraseña y autentica como `admin`.
- **Herramienta:** OWASP ZAP, *Active Scan* (`antes/reporte-zap-api-full.html`), regla **40018 SQL Injection**. Evidencia: `POST /api/auth/login`, parámetro `username`, ataque `'`, respuesta `HTTP/1.1 500 Internal Server Error`. SonarQube y Semgrep **no** la detectaron.
- **Severidad / clasificación:** High (ZAP) · **A05:2025 Injection** · **CWE‑89**.
- **Ubicación:** `apps/api/src/auth.ts`, manejador `authRouter.post('/login')`, líneas 29‑34 (commit `2494b78`).
- **Código vulnerable original:**

```ts
// auth.ts (2494b78), líneas 27-34
// Query construida por concatenación de strings (A05 Injection / CWE-89).
// Un pentester puede inyectar:  admin' --   ó   ' OR '1'='1' --
const hashed = weakHash(String(password ?? ''));
const sql = `SELECT * FROM users WHERE username = '${username}' AND password_hash = '${hashed}'`;

let row: any;
try {
  row = db.prepare(sql).get();
```

- **Riesgo e impacto:** omisión total de la autenticación (acceso como cualquier usuario, incluido `admin`), lectura de datos arbitrarios de la BD mediante `UNION`, y filtración de la consulta en el mensaje de error (ver V‑05).

#### 2. Propuesta de solución

- Usar **consultas parametrizadas** (*prepared statements* con marcadores `?`), de modo que la entrada se envíe como dato y nunca se interprete como SQL.
- Separar la búsqueda del usuario de la verificación de la contraseña (necesario además por el cambio a hashes con salt, V‑03).
- **Justificación:** es la defensa primaria recomendada por OWASP (SQL Injection Prevention Cheat Sheet); el escape manual o las listas negras son frágiles.
- **Controles:** parametrización de consultas, conversión explícita de tipo (`String(...)`), verificación de credenciales en código.

#### 3. Cómo se solucionó

- **Archivo/función:** `apps/api/src/auth.ts`, `authRouter.post('/login')`.

```ts
// auth.ts (actual), líneas 26-42
// Con hashes con salt ya no se puede comparar el hash en el WHERE: se busca al
// usuario por nombre (consulta parametrizada) y la contraseña se verifica en código.
const sql = 'SELECT * FROM users WHERE username = ?';

let row: any;
try {
  row = db.prepare(sql).get(String(username ?? ''));
} catch (err: any) {
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

if (!row || !verifyPassword(String(password ?? ''), row.password_hash)) {
  return res.status(401).json({ error: 'Credenciales inválidas' });
}
```

- **Mitigación:** better-sqlite3 envía el valor ligado al marcador `?` por separado del texto SQL; una comilla en `username` se trata como carácter literal. `String(...)` evita además que objetos tipo `{ "$ne": null }` lleguen al motor.

#### 4. Verificación

- **Pruebas automatizadas** (`apps/api/test/auth.test.ts`):
  - `payloads de SQL Injection en usuario o contraseña no autentican` — prueba `admin' --`, `admin'/*`, `' OR '1'='1' --`, `' OR 1=1 LIMIT 1 --`, contraseña `' OR '1'='1` y un `UNION SELECT`; todas devuelven `401 {"error":"Credenciales inválidas"}`.
  - `operadores tipo NoSQL ({ $ne: null }) no autentican ni provocan errores`.
  - `un fallo de la BD responde 500 genérico sin revelar SQL ni detalles`.
  - `apps/api/test/users.test.ts`: `el nombre de usuario con comillas se guarda literal (sin SQL Injection)`.
- **DAST:** ZAP API full **antes**: 40018 High, 2 instancias (login y búsqueda). **Después** (`reporte-zap-api-full.html` y `reporte-zap-api-full-autenticado.html`): **sin alertas 40018**.
- **Estado:** **Verificada.**

---

### V‑02 — SQL Injection en la búsqueda de tickets (`GET /api/tickets?q=`)

#### 1. Vulnerabilidad encontrada

- **Tipo:** Vulnerabilidad confirmada.
- **Descripción técnica:** el parámetro `q` se interpolaba tres veces dentro de cláusulas `LIKE '%${q}%'`. Además, `req.query.q` se convertía con `as string`, sin validar que realmente fuera texto (Express puede entregar arrays u objetos con `?q=a&q=b` o `?q[x]=1`).
- **Herramienta:** OWASP ZAP *Active Scan*, regla **40018**: `GET /api/tickets?q=%27`, evidencia `HTTP/1.1 500`. También la alerta 100000 (500) con `q=5;URL='https://…owasp.org'`.
- **Severidad / clasificación:** High (ZAP) · **A05:2025 Injection** · **CWE‑89**.
- **Ubicación:** `apps/api/src/routes/tickets.ts`, `ticketsRouter.get('/')`, líneas 37‑41 (`2494b78`).
- **Código vulnerable original:**

```ts
// tickets.ts (2494b78), líneas 36-41
ticketsRouter.get('/', (req, res) => {
  const q = (req.query.q as string) || '';
  let rows: any[];
  if (q) {
    const sql = `${SELECT} WHERE t.title LIKE '%${q}%' OR t.description LIKE '%${q}%' OR t.customer_name LIKE '%${q}%' ORDER BY t.created_at DESC`;
    rows = db.prepare(sql).all();
```

- **Riesgo e impacto:** cualquier usuario autenticado podía extraer toda la base de datos (incluida la tabla `users` con hashes MD5) mediante `UNION SELECT`, o provocar errores 500.

#### 2. Propuesta de solución

- Consulta parametrizada con un parámetro nombrado.
- **Escapar los comodines de `LIKE`** (`%`, `_`, `\`) para que el término del usuario se busque literalmente (no es inyección SQL, pero evita búsquedas no intencionadas y costosas).
- Validar que `q` sea `string` y limitar su longitud.
- **Controles:** parametrización, *input validation* (tipo y longitud), escape específico de contexto (`LIKE … ESCAPE`).

#### 3. Cómo se solucionó

- **Archivo/función:** `apps/api/src/routes/tickets.ts`: `ticketsRouter.get('/')` y la nueva función `escapeLike`.

```ts
// tickets.ts (actual), líneas 68-97
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => '\\' + c);
}

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
  }
  ...
```

- **Mitigación:** el texto SQL es constante; `q` viaja solo como valor de `@term`. Nótese que `${SELECT}` es una constante del servidor, no entrada del usuario.

#### 4. Verificación

- **Pruebas** (`apps/api/test/api.test.ts`): `una comilla simple no provoca error SQL` (devuelve 200 y solo el ticket con comilla literal), `payloads de inyección se tratan como texto y no alteran la consulta`, `los comodines de LIKE del usuario se buscan literalmente`, `q repetido o demasiado largo devuelve 400, no 500`.
- **DAST:** antes 40018 High en `/api/tickets?q=%27`; después **no aparece** en los escaneos full de la API.
- **Estado:** **Verificada.**

> **Nota:** el comentario de la línea 76 sigue indicando que `q` se refleja en el frontend (XSS). Eso **no** se corrigió; ver R‑04.

---

### V‑03 — Almacenamiento de contraseñas con MD5 sin salt

#### 1. Vulnerabilidad encontrada

- **Tipo:** Vulnerabilidad confirmada (debilidad criptográfica).
- **Descripción técnica:** las contraseñas se almacenaban como `MD5(password)` en hexadecimal, sin salt ni factor de trabajo. MD5 es extremadamente rápido de calcular (miles de millones por segundo en GPU) y, sin salt, contraseñas iguales producen hashes iguales y son atacables con tablas precalculadas.
- **Herramientas:**
  - SonarQube **typescript:S4790** — *"Make sure this weak hash algorithm is not used in a sensitive context here."* — CRITICAL, SECURITY: HIGH.
  - Semgrep **`javascript.lang.security.audit.md5-used-as-password`** — nivel *warning* (en Sonar: MAJOR, SECURITY: MEDIUM).
- **Clasificación:** **A04:2025 Cryptographic Failures** · **CWE‑327**, **CWE‑759** (hash sin salt), CWE‑916.
- **Ubicación:** `apps/api/src/hash.ts`, función `weakHash`, línea 7. Usada en `auth.ts`, `routes/users.ts` y `seed.ts`.
- **Código vulnerable original:**

```ts
// hash.ts (2494b78)
import crypto from 'crypto';

export function weakHash(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}
```

- **Riesgo e impacto:** ante cualquier fuga de la BD (agravada por V‑02 y V‑07, que permitían leer los hashes), las contraseñas se recuperarían casi de inmediato.

#### 2. Propuesta de solución

- Usar una **función de derivación de claves lenta y con salt** (bcrypt, argon2 o scrypt). Semgrep sugiere bcrypt.
- Se eligió **scrypt** del módulo nativo `node:crypto`: no añade dependencias, es *memory‑hard* (resistente a GPU/ASIC) y está recomendado por OWASP Password Storage Cheat Sheet.
- Comparar en **tiempo constante**.
- **Controles:** KDF lenta, salt aleatorio por usuario, comparación en tiempo constante, rechazo de formatos heredados.

#### 3. Cómo se solucionó

- **Archivos/funciones:** `apps/api/src/hash.ts` (`hashPassword`, `verifyPassword`); `auth.ts` (usa `verifyPassword`); `routes/users.ts` y `seed.ts` (usan `hashPassword`).

```ts
// hash.ts (actual)
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
```

- **Mitigación:** cada hash usa un salt de 128 bits distinto, lo que invalida tablas precalculadas; scrypt incrementa el costo computacional y de memoria de cada intento; `timingSafeEqual` elimina el canal lateral de tiempo; los hashes MD5 heredados se rechazan (`scheme !== 'scrypt'`).
- **Observación:** se usan los parámetros por defecto de `scryptSync` (N=16384, r=8, p=1). Son aceptables, pero no se ajustaron explícitamente.

#### 4. Verificación

- **Pruebas** (`apps/api/test/hash.test.ts`): `produce el formato scrypt$<salt>$<hash> y nunca contiene la contraseña`, `usa un salt distinto en cada llamada`, `acepta la contraseña correcta`, `rechaza una contraseña incorrecta o vacía`, `rechaza hashes heredados (MD5 sin salt) o mal formados`. También `bootstrap.test.ts › crea los usuarios demo con contraseñas scrypt verificables`.
- **SAST:** SonarQube S4790: 1 → 0. Semgrep `md5-used-as-password`: 1 → 0 (`despues/semgrep.sarif`, 0 resultados).
- **Estado:** **Verificada.**

---

### V‑04 — Contenedores Docker ejecutados como `root`

#### 1. Vulnerabilidad encontrada

- **Tipo:** Advertencia de herramienta (hardening de configuración).
- **Descripción técnica:** ningún Dockerfile declaraba `USER`, por lo que los procesos Node.js corrían como `root` dentro del contenedor.
- **Herramientas:**
  - Semgrep **`dockerfile.security.missing-user.missing-user`** — nivel *error*; importado en SonarQube como CRITICAL / SECURITY: HIGH. `apps/api/Dockerfile:22`, `apps/web/Dockerfile:26`.
  - SonarQube **docker:S6471** — *"The 'node' image runs with 'root' as the default user"* — MINOR. `apps/api/Dockerfile:2`, `apps/web/Dockerfile:3`.
- **Clasificación:** **A02:2025 Security Misconfiguration** · **CWE‑250** (ejecución con privilegios innecesarios).
- **Código vulnerable original:**

```dockerfile
# apps/api/Dockerfile (2494b78), líneas 18-22
RUN pnpm --filter @secure-crm/shared build && pnpm --filter @secure-crm/api build
EXPOSE 4000
CMD ["sh", "-c", "node apps/api/dist/seed.js && node apps/api/dist/index.js"]

# apps/web/Dockerfile (2494b78), líneas 23-26
RUN pnpm --filter @secure-crm/shared build && pnpm --filter @secure-crm/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@secure-crm/web", "start"]
```

- **Riesgo e impacto:** si un atacante logra ejecución de código en la aplicación (p. ej. vía una dependencia vulnerable, ver V‑11), obtiene privilegios de `root` en el contenedor, lo que facilita la escalada y el escape.

#### 2. Propuesta de solución

- Ejecutar como el usuario no privilegiado `node` (incluido en la imagen oficial `node:20-bookworm`), concediéndole permisos solo sobre los directorios que necesita escribir.
- **Controles:** principio de mínimo privilegio, *container hardening*.

#### 3. Cómo se solucionó

```dockerfile
# apps/api/Dockerfile (actual)
RUN pnpm --filter @secure-crm/shared build \
    && pnpm --filter @secure-crm/api build \
    && mkdir -p apps/api/data \
    && chown -R node:node apps/api/data

# Ejecutar como usuario sin privilegios
USER node
```

```dockerfile
# apps/web/Dockerfile (actual)
RUN pnpm --filter @secure-crm/shared build \
    && pnpm --filter @secure-crm/web build \
    && chown -R node:node apps/web/.next

USER node
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
```

- **Mitigación:** el proceso final corre como `node` (UID 1000); solo `apps/api/data` (BD SQLite) y `apps/web/.next` son escribibles por ese usuario. En la web se invoca `next` directamente para no depender de `pnpm` en tiempo de ejecución.

#### 4. Verificación

- **SAST:** Semgrep `missing-user`: 2 → 0. SonarQube S6471: 2 → 0.
- **No se encontró evidencia** en el repositorio de una construcción y ejecución de las imágenes verificando el UID en tiempo de ejecución (p. ej. `docker exec … id`). Los escaneos ZAP "después" demuestran que la aplicación se ejecutó, pero no indican si fue en Docker.
- **Estado:** **Verificada por SAST**; verificación en tiempo de ejecución sin evidencia.

---

### V‑05 — Divulgación de información sensible en mensajes de error

#### 1. Vulnerabilidad encontrada

- **Tipo:** Vulnerabilidad confirmada (por código); la herramienta solo detectó el síntoma (500).
- **Descripción técnica:** tres puntos devolvían al cliente detalles internos:
  1. Manejador global de errores: devolvía `err.message` y `err.stack`.
  2. Login: devolvía la consulta SQL completa y el mensaje del motor.
  3. Creación de usuario: devolvía el mensaje de SQLite (p. ej. `UNIQUE constraint failed: users.username`).
- **Herramienta:** OWASP ZAP **100000** *"A Server Error response code was returned by the server"* (Low, CWE‑388) en `GET /api/tickets?q=…` y `POST /api/auth/login`. ZAP detecta el código 500, no el contenido filtrado; el contenido se confirma por revisión de código.
- **Clasificación:** A02:2025 Security Misconfiguration (según el comentario del código) / A10:2025 Mishandling of Exceptional Conditions · **CWE‑209**.
- **Código vulnerable original:**

```ts
// index.ts (2494b78), líneas 41-47
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err?.message,
    stack: err?.stack,
  });
});

// auth.ts (2494b78), línea 37
return res.status(500).json({ error: 'Error en la consulta', sql, detail: String(err?.message ?? err) });

// routes/users.ts (2494b78), línea 68
res.status(400).json({ error: 'No se pudo crear el usuario', detail: String(err?.message ?? err) });
```

- **Riesgo e impacto:** el atacante obtiene la estructura de la consulta SQL (facilita V‑01), rutas internas del servidor, versiones y nombres de tablas/columnas.

#### 2. Propuesta de solución

- Mensajes genéricos al cliente; detalle completo solo en el registro del servidor.
- Diferenciar errores del cliente (4xx) de errores del servidor (5xx).
- **Controles:** manejo seguro de excepciones, separación entre registro interno y respuesta externa.

#### 3. Cómo se solucionó

- **Archivos:** nuevo `apps/api/src/app.ts` (se extrajo la configuración de Express desde `index.ts`), `auth.ts`, `routes/users.ts`.

```ts
// app.ts (actual), líneas 51-64
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
```

```ts
// routes/users.ts (actual), líneas 85-92
} catch (err: any) {
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'El nombre de usuario ya existe' });
  }
  console.error(err);
  res.status(400).json({ error: 'No se pudo crear el usuario' });
}
```

#### 4. Verificación

- **Pruebas:** `app.test.ts › un error inesperado devuelve 500 sin stack ni mensaje interno`, `cuerpo mayor a 100kb devuelve 413 sin detalles`, `otros errores 4xx del parser devuelven un mensaje genérico`; `api.test.ts › JSON malformado devuelve 400 sin stack ni detalles internos`; `auth.test.ts › un fallo de la BD responde 500 genérico sin revelar SQL ni detalles`; `users.test.ts › username duplicado devuelve 409 sin detalles del motor`.
- **DAST:** ZAP API full antes: 100000 *Server Error* (Low, 2 instancias). Después: no hay alertas de *Server Error*; solo *Client Error* informativas (4xx esperados por la nueva validación).
- **Estado:** **Verificada.**

---

### V‑06 — Validación de entrada insuficiente (errores 500 ante tipos inesperados)

#### 1. Vulnerabilidad encontrada

- **Tipo:** Advertencia de herramienta / debilidad de robustez.
- **Descripción técnica:** los manejadores pasaban `req.params.id` y campos del cuerpo directamente a better-sqlite3 sin validar tipo, rango ni longitud. Valores como objetos, arrays o `Infinity` provocaban excepciones (500). Tampoco había límite explícito del tamaño del cuerpo JSON ni lista blanca para `status`, `priority` y `role`.
- **Herramienta:** OWASP ZAP **100000** (500 en la API). La falta de validación concreta se identifica por revisión del código.
- **Clasificación:** A10:2025 Mishandling of Exceptional Conditions · **CWE‑20** (Improper Input Validation), CWE‑770 (sin límite de recursos).
- **Ubicación original:** `routes/tickets.ts` (GET/PUT/DELETE `/:id`, POST, PUT), `routes/users.ts` (GET `/:id`, POST, PUT `/:id/role`), `index.ts:24` (`app.use(express.json())`).

```ts
// tickets.ts (2494b78), línea 52
const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(req.params.id);
// users.ts (2494b78), línea 75 — rol sin lista blanca
db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, req.params.id);
```

- **Riesgo e impacto:** denegación de servicio parcial, datos inconsistentes (roles o estados arbitrarios) y, combinado con V‑05, fuga de información.

#### 2. Propuesta de solución

- Validación del lado del servidor con **listas blancas** (estados, prioridades, roles), validación de tipos, longitudes máximas y formato de identificadores; límite del cuerpo JSON.
- **Controles:** *input validation* (allow‑list), límites de tamaño, respuestas 400/413 controladas.

#### 3. Cómo se solucionó

```ts
// tickets.ts (actual), líneas 33-66
const STATUSES = new Set(['open', 'in_progress', 'closed']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const TEXT_LIMITS = { title: 200, description: 5000, customerName: 200, customerEmail: 254 };

function validateTicketBody(b: any): string | null {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return 'Cuerpo inválido';
  for (const [field, max] of Object.entries(TEXT_LIMITS)) { /* tipo string y longitud */ }
  if (b.status != null && !STATUSES.has(b.status)) return 'Estado inválido';
  if (b.priority != null && !PRIORITIES.has(b.priority)) return 'Prioridad inválida';
  if (b.assigneeId != null && !(Number.isSafeInteger(b.assigneeId) && b.assigneeId > 0)) {
    return 'assigneeId inválido';
  }
  return null;
}

function parseId(raw: string): number | null {
  return /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}
```

```ts
// users.ts (actual), líneas 9-10 y 100
const ROLES = new Set(['admin', 'agent', 'viewer']);
const TEXT_LIMITS = { username: 50, email: 254, fullName: 200, password: 256 };
...
if (!ROLES.has(b.role)) return res.status(400).json({ error: 'Rol inválido' });
```

```ts
// app.ts (actual), línea 29
app.use(express.json({ limit: '100kb' }));
```

- **Mitigación:** las entradas inválidas se rechazan con 400 antes de llegar a la BD.
- **Importante:** la validación restringe **qué valores** se aceptan, pero **no quién** puede enviarlos. Un `viewer` sigue pudiendo asignar `role: "admin"` (válido según la lista blanca). Ver R‑03.

#### 4. Verificación

- **Pruebas:** `api.test.ts › ids no numéricos devuelven 400`, `tipos inesperados en el cuerpo devuelven 400`, `validación en usuarios: rol inválido y duplicados no generan 500`; `tickets.test.ts › rechaza cuerpos no-objeto, textos demasiado largos y valores fuera de lista`, `id inválido devuelve 400 e inexistente 404`; `users.test.ts › valida cuerpo, username, tipos, longitudes y rol`, `rechaza roles inválidos, ids inválidos e ids inexistentes`.
- **DAST:** las alertas 500 desaparecen; las de *Client Error* (informativas) aumentan de 28 a 43 (full) y aparecen 33 en el full autenticado, lo cual es coherente con que ahora las entradas inválidas se rechacen con 4xx.
- **Estado:** **Verificada.**

---

### V‑07 — Exposición del hash de contraseña y de PII en `/api/users`

#### 1. Vulnerabilidad encontrada

- **Tipo:** Vulnerabilidad confirmada por revisión de código.
- **Descripción técnica:** `GET /api/users` y `GET /api/users/:id` hacían `SELECT *` y devolvían `passwordHash` (MD5) y el correo de todos los usuarios a cualquier usuario autenticado. El tipo compartido `User` incluía `passwordHash?`.
- **Herramienta:** **ninguna de las herramientas lo reportó** en `analisis-seguridad/antes/`. El código corregido menciona "ZAP 10062 PII Disclosure", pero **esa alerta no aparece en ninguno de los reportes "antes" del repositorio**; por tanto la evidencia proviene únicamente del código fuente.
- **Clasificación:** A01:2025 Broken Access Control / A04:2025 · **CWE‑200**, CWE‑359 (exposición de información personal).
- **Ubicación:** `apps/api/src/routes/users.ts`, líneas 13‑26 y 29‑41 (`2494b78`); `packages/shared/src/index.ts`.

```ts
// users.ts (2494b78), líneas 13-24
usersRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id, username: r.username, email: r.email, fullName: r.full_name, role: r.role,
      passwordHash: r.password_hash, // fuga intencional
      createdAt: r.created_at,
    }))
  );
});
```

- **Riesgo e impacto:** un `viewer` obtenía los hashes MD5 de todos los usuarios (incluido `admin`) y podía crackearlos offline (V‑03).

#### 2. Propuesta de solución

- **Minimización de datos:** seleccionar solo las columnas necesarias, nunca el hash; mostrar el correo únicamente a quien lo necesita (rol `admin`).
- **Controles:** *data minimization*, proyección explícita de columnas, filtrado de la respuesta según rol.

#### 3. Cómo se solucionó

```ts
// users.ts (actual), líneas 12-27 y 36-39
const PUBLIC_COLUMNS = 'id, username, email, full_name, role, created_at';

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

usersRouter.get('/', (req: AuthedRequest, res) => {
  const rows = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`).all() as any[];
  res.json(rows.map((r) => toPublicUser(r, req.user)));
});
```

- También se eliminó `passwordHash` del tipo `User` en `packages/shared/src/index.ts` y `email` pasó a ser opcional.
- **Limitación:** el filtrado del correo depende de `req.user.role`, que se obtiene de un JWT **no verificado** (R‑01). Un atacante que falsifique un token con `role: "admin"` recupera los correos. El hash, en cambio, ya no sale nunca de la BD.

#### 4. Verificación

- **Pruebas:** `api.test.ts › /api/users nunca devuelve el hash de la contraseña`, `el correo solo se incluye para administradores`; `users.test.ts › devuelve el usuario sin hash; el correo solo para admin`; `auth.test.ts › credenciales válidas devuelven un JWT firmado y el usuario sin hash`.
- **Escaneos:** no aplica (no había alerta "antes").
- **Estado:** **Verificada por pruebas automatizadas**; sin evidencia de herramientas antes/después. El control de correo por rol es **parcial** mientras R‑01 siga abierto.

---

### V‑08 — Divulgación del framework mediante `X-Powered-By`

#### 1. Vulnerabilidad encontrada

- **Tipo:** Advertencia de herramienta.
- **Descripción técnica:** Express añade por defecto `X-Powered-By: Express`, lo que facilita el *fingerprinting*.
- **Herramientas:** SonarQube **typescript:S5689** (MINOR) en `apps/api/src/index.ts:12`; ZAP **10037** (Low) en la API (sistémica) y en el frontend (`X-Powered-By: Next.js`, 3 instancias).
- **Clasificación:** A02:2025 · CWE‑200 (ZAP lo asocia a CWE‑497).

```ts
// index.ts (2494b78), línea 12
const app = express();
```

- **Riesgo e impacto:** bajo; ayuda a un atacante a buscar vulnerabilidades específicas de la versión.

#### 2. Propuesta de solución

- Deshabilitar la cabecera en Express (y en Next.js con `poweredByHeader: false`).

#### 3. Cómo se solucionó

```ts
// app.ts (actual), líneas 9-11
export const app = express();
// Oculta el header X-Powered-By: Express para no revelar el framework (S5689 / CWE-200).
app.disable('x-powered-by');
```

- **No se modificó** el frontend: `apps/web/next.config.mjs` no define `poweredByHeader: false`.

#### 4. Verificación

- **Prueba:** `app.test.ts › no revela el framework en X-Powered-By`.
- **SAST:** SonarQube S5689: 1 → 0.
- **DAST API:** 10037 presente en todos los escaneos API "antes"; **ausente** en los tres escaneos API "después".
- **DAST frontend:** 10037 **sigue presente** en `despues/reporte-zap-baseline.html` (3 instancias, `X-Powered-By: Next.js`).
- **Estado:** **Verificada en la API**; **pendiente en el frontend** (R‑08).

---

### V‑09 — Ausencia de la cabecera `X-Content-Type-Options`

#### 1. Vulnerabilidad encontrada

- **Tipo:** Advertencia de herramienta.
- **Descripción técnica:** ninguna respuesta incluía `X-Content-Type-Options: nosniff`, lo que permite que navegadores antiguos reinterpreten el tipo MIME del cuerpo (*MIME sniffing*).
- **Herramienta:** ZAP **10021** (Low, CWE‑693): sistémica en la API y en el frontend "antes".
- **Clasificación:** A02:2025 Security Misconfiguration · **CWE‑693**.
- **Ubicación:** configuración de `apps/api/src/index.ts` (sin middleware de cabeceras) y `apps/web/next.config.mjs` (sin `headers()`).

#### 2. Propuesta de solución

- Añadir `nosniff` en **todas** las respuestas, incluidas las de error (ZAP indica que también aplica a 401/403/500). Alternativamente, usar `helmet`.
- **Controles:** cabeceras de seguridad HTTP.

#### 3. Cómo se solucionó

```ts
// apps/api/src/app.ts (actual), líneas 13-18 — se registra antes de cualquier ruta
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
```

```js
// apps/web/next.config.mjs (actual)
async headers() {
  return [
    {
      source: '/:path*',
      headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
    },
  ];
},
```

#### 4. Verificación

- **Pruebas:** `api.test.ts › X-Content-Type-Options: nosniff en respuestas 200, 400, 401 y 404`; `next-app.test.tsx › envía X-Content-Type-Options: nosniff en todas las rutas`.
- **DAST frontend:** 10021 presente "antes" (sistémica) → **ausente** en `despues/reporte-zap-baseline.html`.
- **DAST API:**
  - `despues/reporte-zap-api-full.html` (15/10, 23:53 local) **todavía muestra 1 instancia** en `GET /api/health`. Este escaneo es anterior a la versión final del código.
  - `despues/reporte-zap-api-full-autenticado.html` (16/10, 00:13 local) y `despues/reporte-zap-api-baseline.html` (16/10, 09:13 local): **sin alerta 10021**.
- **Estado:** **Verificada en el frontend y en los escaneos API más recientes**; el escaneo API full no autenticado "después" está desactualizado respecto del código final.

---

### V‑10 — Respuestas `text/html` inesperadas en la API

#### 1. Vulnerabilidad encontrada

- **Tipo:** Advertencia de herramienta (baja).
- **Descripción técnica:** para rutas inexistentes, Express devolvía su página HTML por defecto (`Cannot GET …`) en lugar de JSON, lo que es inconsistente para una API y puede revelar información del framework.
- **Herramienta:** ZAP **100001** *Unexpected Content-Type was returned* (Low), 18 instancias en `antes/reporte-zap-api-full.html`.
- **Clasificación:** A02:2025 · sin CWE asignado por ZAP.

#### 2. Propuesta de solución

- Manejador catch‑all que responda 404 en JSON, coherente con el resto de la API.

#### 3. Cómo se solucionó

```ts
// app.ts (actual), líneas 43-47
// Rutas inexistentes: 404 en JSON, igual que el resto de la API, en lugar de la
// página HTML por defecto de Express (ZAP 100001 Unexpected Content-Type).
app.use((_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});
```

#### 4. Verificación

- **Prueba:** `api.test.ts › las rutas inexistentes devuelven 404 en JSON`.
- **DAST:**
  - `despues/reporte-zap-api-full.html`: **17 instancias todavía presentes** (p. ej. `/`, `/api`, `/api/auth/actuator/health`, `/latest/meta-data/`), todas con `text/html`. Como se indicó en V‑09, este escaneo se ejecutó antes de la versión final del código.
  - `despues/reporte-zap-api-full-autenticado.html` y `despues/reporte-zap-api-baseline.html`: **sin alerta 100001**.
- **Estado:** **Parcialmente verificada.** El código y la prueba confirman la corrección, pero no hay un escaneo **full no autenticado** posterior a la versión final que lo confirme con el mismo alcance que el "antes". Se recomienda repetirlo.

---

### V‑11 — Dependencias con vulnerabilidades conocidas

#### 1. Vulnerabilidad encontrada

- **Tipo:** Vulnerabilidades confirmadas en componentes de terceros (SCA).
- **Herramienta:** `pnpm audit` (`antes/audit.json`): **53 avisos** — 6 critical, 18 high, 25 moderate, 4 low — sobre 305 dependencias.
- **Clasificación:** **A03:2025 Software Supply Chain Failures** (antes "Vulnerable and Outdated Components").
- **Principales paquetes afectados:**

| Paquete (versión antes) | Ruta | Avisos destacados | Severidad máx. |
|---|---|---|---|
| `next` 14.2.15 | `apps/web` | GHSA‑f82v‑jwr5‑mffw (bypass de autorización en middleware), GHSA‑2xp9‑vwfh‑vxw4 y GHSA‑p293‑qw3h‑jr36 (RCE), varios DoS, SSRF y XSS | Critical |
| `lodash` 4.17.11 | `apps/api` | GHSA‑jf85‑cpcp‑j695 (Prototype Pollution), GHSA‑35jh‑r3h4‑6jhm (Command Injection), GHSA‑r5fr‑rjxr‑66jc (Code Injection en `_.template`) | Critical |
| `jsonwebtoken` 8.5.1 | `apps/api` | GHSA‑qwph‑4952‑7xr6 (bypass de validación de firma por algoritmo por defecto inseguro, CWE‑347), GHSA‑8cf7‑32gw‑wr33, GHSA‑hjrf‑2m68‑5959 | High |
| `proxy-addr` (vía express) | `apps/api` | GHSA‑jqcg‑44mw‑7w3h (IP spoofing) | Critical |
| `shell-quote` (vía concurrently) | raíz | GHSA‑pqg4‑j6r4‑53mv (inyección de comandos) | Critical |
| `postcss` (vía next) | `apps/web` | GHSA‑6g55‑p6wh‑862q, GHSA‑r28c‑9q8g‑f849 (lectura arbitraria/path traversal), GHSA‑qx2v‑qp2m‑jg93 (XSS) | High |
| `qs` (vía express) | `apps/api` | GHSA‑4mjr‑xmp4‑gh2g, GHSA‑x5fp‑wj9c‑mxmx (DoS) | Moderate |
| `source-map-js`, `postcss-selector-parser` | `apps/web` | DoS / consumo de CPU | High / Moderate |
| `braces` 3.0.3 (vía tailwindcss) | `apps/web` | GHSA‑vfj7‑8cjw‑p6xm (DoS por recursión) | High |

- **Versiones vulnerables originales** (`apps/api/package.json`, `2494b78`):

```json
"express": "^4.21.0",
"jsonwebtoken": "8.5.1",
"lodash": "4.17.11"
```

```json
// apps/web/package.json (2494b78)
"next": "14.2.15"
```

- **Riesgo e impacto:** ejecución remota de código, bypass de autorización, DoS y SSRF en el frontend; contaminación de prototipos e inyección de código en la API.

#### 2. Propuesta de solución

- Actualizar cada paquete a una versión igual o superior a la indicada en `patched_versions` y forzar las transitivas con `pnpm.overrides` cuando el paquete padre no las actualice.
- **Controles:** gestión de vulnerabilidades de dependencias, *pinning* mediante lockfile.

#### 3. Cómo se solucionó

```json
// apps/api/package.json (actual)
"express": "^4.22.3",
"jsonwebtoken": "^9.0.3",
"lodash": "^4.18.1",
"@types/jsonwebtoken": "^9.0.10"
```

```json
// apps/web/package.json (actual)
"next": "15.5.28",
"postcss": "^8.5.30",
"tailwindcss": "^3.4.19"
```

```json
// package.json raíz (actual)
"devDependencies": { "concurrently": "^9.2.5" },
"pnpm": {
  "overrides": {
    "next>postcss": "^8.5.30",
    "postcss-selector-parser": "^7.1.6"
  }
}
```

Versiones resueltas en `pnpm-lock.yaml`: `next@15.5.28`, `jsonwebtoken@9.0.3`, `lodash@4.18.1`, `express@4.22.3`, `proxy-addr@2.0.8`, `qs@6.16.1`, `shell-quote@1.12.0`, `postcss@8.5.30`, `source-map-js@1.2.2`, `postcss-selector-parser@7.1.6`, `braces@3.0.3`.

> **Aclaración importante sobre `jsonwebtoken`:** la actualización a 9.0.3 corrige los avisos **de la librería** (p. ej. el algoritmo por defecto inseguro). **No corrige** la vulnerabilidad de la aplicación R‑01, porque el middleware sigue usando `jwt.decode`, que nunca verifica la firma en ninguna versión.

#### 4. Verificación

- **Resultado** (`despues/audit.json`, actualizado en `f7c9be4`): **1 aviso** — 0 critical, **1 high**, 0 moderate, 0 low — sobre 435 dependencias.
- El aviso restante es `braces@3.0.3` (GHSA‑vfj7‑8cjw‑p6xm, CVSS 7.5, `patched_versions: "<0.0.0"`, es decir, **sin versión corregida publicada**). Llega como dependencia transitiva de `tailwindcss → chokidar`, que se usa en tiempo de construcción.
- **Pruebas funcionales:** las 99 pruebas que pasan en API y web confirman que la aplicación sigue funcionando tras la migración a Next 15 y jsonwebtoken 9.
- **Estado:** **Verificada** (53 → 1); el aviso residual no tiene parche disponible (R‑09).

---

### V‑12 — Instalación de dependencias en Docker sin lockfile

#### 1. Vulnerabilidad encontrada

- **Tipo:** Mejora de hardening; **ninguna herramienta lo reportó**.
- **Descripción técnica:** los Dockerfiles copiaban solo `package.json` y ejecutaban `pnpm install` sin `pnpm-lock.yaml`, por lo que cada construcción podía resolver versiones distintas (posiblemente vulnerables) dentro de los rangos `^`.

```dockerfile
# apps/api/Dockerfile (2494b78)
COPY pnpm-workspace.yaml package.json ./
RUN pnpm install --filter @secure-crm/shared --filter @secure-crm/api
```

- **Clasificación:** A03:2025 Software Supply Chain Failures / A08:2025 · CWE‑1104 (uso de componentes no mantenidos/no controlados). Severidad no asignada por herramienta.

#### 2. Propuesta de solución

- Copiar el lockfile y usar `--frozen-lockfile` para que la imagen use exactamente las versiones auditadas.

#### 3. Cómo se solucionó

```dockerfile
# apps/api/Dockerfile y apps/web/Dockerfile (actual)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --filter @secure-crm/shared --filter @secure-crm/api
```

- Además, `.dockerignore` excluye `**/coverage` y `.gitignore` excluye `coverage/` y `.scannerwork/`.

#### 4. Verificación

- No hay evidencia en el repositorio de una construcción de imagen tras el cambio.
- **Estado:** **Implementada; sin verificación** (no hay hallazgo de herramienta antes ni prueba de construcción después).

---

### M — Problemas de mantenibilidad (SonarQube, *code smells*)

Estos hallazgos **no son vulnerabilidades de seguridad**; se corrigieron para dejar el Quality Gate limpio. De los 41 hallazgos "antes", **34 son CODE_SMELL** y 7 son VULNERABILITY (V‑03, V‑04, V‑08).

| Regla | Descripción | Instancias | Archivos (líneas antes) | Corrección aplicada |
|---|---|---|---|---|
| typescript:S6759 | Props de componentes React no marcados como solo lectura | 13 | `layout.tsx:15`, `AppShell.tsx:14`, `brand.tsx:5,9,20,30`, `charts.tsx:5,53`, `ui.tsx:22,28,65,73,82` | Tipos envueltos en `Readonly<…>` |
| typescript:S3358 | Ternario anidado | 2 | `tickets/[id]/page.tsx:114`, `tickets/page.tsx:79` | Variable `saveLabel` con `if`; renderizado condicional con `&&` |
| typescript:S4624 | Template literals anidados | 2 | `tickets/page.tsx:41`, `lib/api.ts:55` | Concatenación previa en variable (`search`) |
| typescript:S7744 | Objeto vacío inútil | 1 | `lib/api.ts:36` | `...(options.headers \|\| {})` → `...options.headers` |
| typescript:S7772 | Preferir `node:` en imports nativos | 3 | `db.ts:2,3`, `hash.ts:1` | `node:path`, `node:fs`, `node:crypto` |
| css:S7924 | Contraste insuficiente | 2 | `docs/assets/site.css:123,885` | Colores `rgba` → colores opacos equivalentes |
| css:S1874 | `word-break: break-word` obsoleto | 1 | `docs/assets/site.css:783` | `overflow-wrap: anywhere` |
| Web:AvoidCommentedOutCodeCheck | Código comentado | 2 | `docs/dast/index.html:470,505` | Bloques eliminados |
| javascript:S7761 | Preferir `.dataset` a `setAttribute` | 2 | `docs/dast/index.html:776`, `docs/sast/index.html:1303` | `p.dataset.active = …` |
| javascript:S7781 | Preferir `replaceAll` | 3 | `docs/dast/index.html:970` | `.replaceAll("&", "&amp;")…` |
| Web:S6811 | `aria-selected` no válido en `button` | 1 | `docs/sast/index.html:62` | `aria-current` (+ selector CSS) |
| Web:S6851 | Palabra "image" redundante en `alt` | 2 | `docs/sast/index.html:267,271` | Texto `alt` reescrito |

**Verificación:** SonarQube "después" reporta `code_smells = 0`. Sin embargo:

- Los **13 hallazgos en `docs/`** quedaron **fuera del alcance** del análisis posterior (`sonar.sources=apps,packages`). El diff de `fa9b177` muestra que el código sí se corrigió, pero **SonarQube no lo re‑analizó**. Estado: **corregido en código, no verificado por escaneo**.
- Los **21 hallazgos en `apps/`** sí están en el alcance de ambos análisis. Estado: **verificados**.

---

## 3. Riesgos residuales (vulnerabilidades NO corregidas)

Las siguientes vulnerabilidades **siguen presentes** en el código actual de la rama. Ninguna de ellas fue reportada por SonarQube, Semgrep ni ZAP, lo que explica por qué los escaneos "después" aparecen limpios a pesar de su existencia.

### R‑01 — JWT aceptado sin verificar la firma (**sigue vulnerable**)

- **Clasificación:** A07:2025 Authentication Failures · **CWE‑347**. Severidad estimada: crítica (permite suplantar a cualquier usuario, incluido `admin`).
- **Ubicación:** `apps/api/src/middleware/auth.ts`, función `authenticate`, línea 21.

```ts
// middleware/auth.ts (actual — sin cambios respecto de 2494b78)
// jwt.decode NO verifica la firma. La firma se ignora por completo.
const payload = jwt.decode(token) as any;
if (!payload) {
  return res.status(401).json({ error: 'Token inválido' });
}
req.user = { sub: payload.sub, username: payload.username, role: payload.role };
```

- **Evidencia de que sigue vulnerable:** dos pruebas marcadas como fallo esperado en `apps/api/test/auth.test.ts`:
  - `test.fails('[vuln. conocida CWE-347] rechaza tokens firmados con otro secreto')`
  - `test.fails('[vuln. conocida CWE-347] rechaza tokens sin firma (alg none)')`

  Ambas **fallan** en la ejecución actual (por eso Vitest las cuenta como "expected fail"): un token firmado con otro secreto, o un token `alg: none` sin firma, es **aceptado** por `/api/users`.
- **Corrección recomendada:** `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` dentro de un `try/catch` que devuelva 401.
- **Nota:** actualizar `jsonwebtoken` a 9.0.3 (V‑11) **no** corrige este problema.

### R‑02 — Secreto JWT débil y codificado en el fuente

- `apps/api/src/auth.ts:9`: `const JWT_SECRET = process.env.JWT_SECRET || 'secret123';` — CWE‑798 / CWE‑521. La prueba `bootstrap.test.ts › usa JWT_SECRET del entorno y, si falta, el valor de respaldo` confirma que el valor por defecto sigue activo.
- **Recomendación:** exigir `JWT_SECRET` al arrancar (fallar si no existe) y usar un valor aleatorio de al menos 256 bits.

### R‑03 — Control de acceso roto, IDOR y escalada de privilegios (**sigue vulnerable**)

- **Clasificación:** **A01:2025 Broken Access Control** · CWE‑639 (IDOR), CWE‑862 (falta de autorización), CWE‑915 (mass assignment del campo `role`).
- **Ubicaciones** (todas sin verificación de rol ni de propiedad):

| Endpoint | Archivo:línea | Problema |
|---|---|---|
| `GET /api/tickets/:id` | `routes/tickets.ts:103` | Cualquier usuario lee cualquier ticket (IDOR) |
| `POST /api/tickets` | `routes/tickets.ts:114` | Un `viewer` (solo lectura) crea tickets |
| `PUT /api/tickets/:id` | `routes/tickets.ts:140` | Cualquier usuario edita cualquier ticket (IDOR) |
| `DELETE /api/tickets/:id` | `routes/tickets.ts:169` | Cualquier usuario borra cualquier ticket |
| `GET /api/users`, `GET /api/users/:id` | `routes/users.ts:36,42` | Cualquier usuario lista/consulta usuarios |
| `POST /api/users` | `routes/users.ts:54` | Cualquier usuario crea cuentas, incluso con `role: "admin"` |
| `PUT /api/users/:id/role` | `routes/users.ts:96` | Cualquier usuario cambia roles, incluido el suyo a `admin` |

- **Evidencia de que sigue vulnerable:** tres pruebas `test.fails`:
  - `users.test.ts › [vuln. conocida A01] un viewer no puede escalar su propio rol a admin`
  - `users.test.ts › [vuln. conocida A01] un viewer no puede crear cuentas de administrador`
  - `tickets.test.ts › [vuln. conocida A01] un viewer no puede crear tickets`
- La validación agregada en V‑06 (`ROLES`, `parseId`) **no** es un control de autorización.
- **Recomendación:** middleware `requireRole('admin')` en la gestión de usuarios, comprobación de propiedad/asignación en tickets, y denegar escritura al rol `viewer`. Esto solo es efectivo después de corregir R‑01.

### R‑04 — Cross‑Site Scripting (XSS) en el frontend

- **Clasificación:** A05:2025 Injection · **CWE‑79**. No detectado por ninguna herramienta en los reportes disponibles (y el ZAP Full Scan del frontend "después" no se completó).
- **Ubicaciones:**
  - `apps/web/app/tickets/page.tsx:70` — término de búsqueda reflejado: `dangerouslySetInnerHTML={{ __html: `“${activeQuery}”` }}` (XSS reflejado vía `?q=`).
  - `apps/web/app/tickets/page.tsx:102` — `dangerouslySetInnerHTML={{ __html: t.title }}` (XSS almacenado).
  - `apps/web/app/tickets/[id]/page.tsx:97` — `dangerouslySetInnerHTML={{ __html: t.description }}` (XSS almacenado).
- **Impacto agravado:** el JWT se guarda en `localStorage` (`apps/web/lib/api.ts:13`) y la cookie no es `HttpOnly` (R‑05), por lo que un XSS permite robar la sesión. No hay CSP (R‑08).
- **Recomendación:** renderizar como texto (`{t.title}`) o sanitizar con DOMPurify; añadir CSP.

### R‑05 — Gestión insegura de la sesión

- `apps/api/src/auth.ts:48`: `res.cookie('session', token, { httpOnly: false, secure: false });` — sin `HttpOnly`, `Secure` ni `SameSite` (CWE‑1004, CWE‑614, CWE‑1275).
- `apps/web/lib/api.ts:13-14`: token y usuario en `localStorage`.

### R‑06 — CORS permisivo con credenciales

- `apps/api/src/app.ts:22-27`: `origin: (_origin, cb) => cb(null, true), credentials: true` refleja cualquier origen y permite cookies — A02:2025 · CWE‑942. Combinado con la cookie sin `SameSite`, facilita CSRF y lectura cross‑origin.

### R‑07 — Sin protección contra fuerza bruta en login

- `apps/api/src/auth.ts:23-24` (comentario y código): sin *rate limiting* ni bloqueo de cuenta — A07:2025 · CWE‑307. El cambio a scrypt (V‑03) encarece cada intento en el servidor, pero no lo limita.

### R‑08 — Cabeceras de seguridad ausentes en el frontend

`despues/reporte-zap-baseline.html` mantiene las mismas alertas que el "antes", salvo `X-Content-Type-Options`:

| Alerta ZAP | Riesgo | Antes | Después |
|---|---|---|---|
| 10038 Content Security Policy Header Not Set | Medium | 3 | 3 |
| 10020 Missing Anti‑clickjacking Header | Medium | 1 | 1 |
| 90004 Cross‑Origin‑Embedder‑Policy | Low | 1 | 1 |
| 90004 Cross‑Origin‑Opener‑Policy | Low | 1 | 1 |
| 90004 Cross‑Origin‑Resource‑Policy | Low | Sistémica | Sistémica |
| 10063 Permissions Policy Header Not Set | Low | Sistémica | Sistémica |
| 10037 X‑Powered‑By (`Next.js`) | Low | 3 | 3 |
| 10021 X‑Content‑Type‑Options Header Missing | Low | Sistémica | **0** |

En la API tampoco se configuraron CSP, `X-Frame-Options`, HSTS ni `Referrer-Policy` (lo reconoce el comentario de `app.ts:33-35`), aunque ZAP no las reporta para respuestas JSON.

### R‑09 — `braces@3.0.3` sin parche

- GHSA‑vfj7‑8cjw‑p6xm (High, CVSS 7.5, DoS). Dependencia transitiva de construcción (`tailwindcss → chokidar → braces`). No existe versión corregida (`patched_versions: "<0.0.0"`). El riesgo en producción es bajo porque se usa al compilar, pero debe vigilarse.

### R‑10 — Contraseña por defecto al crear usuarios

- `apps/api/src/routes/users.ts:78`: `hashPassword(String(b.password ?? 'changeme'))`. Si el cliente omite `password`, la cuenta queda con una contraseña conocida (CWE‑1393). Combinado con R‑03, cualquier usuario puede crear un `admin` con contraseña `changeme`.

---

## 4. Comparación antes / después

### 4.1 SonarQube

| Métrica | Antes (10/10/2026) | Después (16/10/2026 01:01) |
|---|---|---|
| Total de hallazgos | 41 | 0 |
| CRITICAL | 3 | 0 |
| MAJOR | 14 | 0 |
| MINOR | 24 | 0 |
| Vulnerabilities | 7 (4 nativas + 3 importadas de Semgrep) | 0 |
| Code smells | 34 | 0 |
| Cobertura | No medida | 83.6 % (código nuevo: 99.6 %) |
| Quality Gate | — | **OK** (new_coverage ≥ 80, duplicación ≤ 3 %, new_violations = 0) |
| Alcance | `sonar.sources=.` + SARIF de Semgrep | `apps,packages`, **sin `docs/`** y **sin SARIF de Semgrep** |

### 4.2 Semgrep

| Regla | Archivo | Antes | Después |
|---|---|---|---|
| `dockerfile.security.missing-user` (error) | `apps/api/Dockerfile:22` | 1 | 0 |
| `dockerfile.security.missing-user` (error) | `apps/web/Dockerfile:26` | 1 | 0 |
| `md5-used-as-password` (warning) | `apps/api/src/hash.ts:7` | 1 | 0 |
| **Total** | | **3** | **0** |

Versión 1.180.0 → 1.181.0; 1 074 reglas cargadas en ambos casos.

### 4.3 pnpm audit

| Severidad | Antes | Después |
|---|---|---|
| Critical | 6 | 0 |
| High | 18 | 1 (`braces`, sin parche) |
| Moderate | 25 | 0 |
| Low | 4 | 0 |
| **Total** | **53** | **1** |
| Dependencias analizadas | 305 | 435 |

### 4.4 OWASP ZAP — API (`localhost:4000`)

| Alerta | Riesgo | Full antes | Full después (no aut., 15/10 23:53) | Full autenticado después (16/10 00:13) | Baseline antes | Baseline después (16/10 09:13) |
|---|---|---|---|---|---|---|
| 40018 SQL Injection | **High** | **2** | 0 | 0 | — (pasivo) | — (pasivo) |
| 100000 Server Error (500) | Low | 2 | 0 | 0 | 0 | 0 |
| 10037 X‑Powered‑By | Low | Sistémica | 0 | 0 | Sistémica | 0 |
| 100001 Unexpected Content‑Type | Low | 18 | **17** | 0 | 0 | 0 |
| 10021 X‑Content‑Type‑Options | Low | Sistémica | **1** | 0 | 1 | 0 |
| 100000 Client Error (4xx) | Info | 28 | 43 | 33 | 11 | 0 |
| 10111 Authentication Request Identified | Info | 2 | 2 | 2 | 2 | 0 |
| 10049 Non‑Storable / Storable Content | Info | Sistémica | Sistémica / 1 | Sistémica | Sistémica / 1 | Sistémica |

El reporte autenticado "antes" (`reporte-zap-api-autenticado.html`) solo contiene alertas pasivas (10037, 10021, 100000 *Client Error*, 10111, 10049), por lo que no es directamente comparable con el *full* autenticado "después".

### 4.5 OWASP ZAP — Frontend (`localhost:3000`)

- **Baseline:** antes 11 tipos de alerta → después 10 (solo desaparece 10021). Ver tabla de R‑08.
- **Full scan:** el "antes" (`reporte-zap-full-rapido.html`) incluía además *CSP: Failure to Define Directive with No Fallback* (10055, Medium). **No existe Full Scan del frontend "después"** porque no se completó por falta de recursos; por tanto no hay verificación activa del frontend tras los cambios, y el XSS (R‑04) no ha sido sometido a DAST.

### 4.6 Pruebas automatizadas

| Paquete | Antes (`2494b78`) | Después (estado actual) |
|---|---|---|
| `apps/api` | Sin pruebas | 7 archivos, 66 superadas + **5 fallos esperados** (vulnerabilidades abiertas) |
| `apps/web` | Sin pruebas | 5 archivos, 33 superadas |

---

## 5. Conclusiones

1. **Se corrigieron de forma verificable las vulnerabilidades de mayor severidad detectadas por las herramientas:** las dos inyecciones SQL (ZAP High), el almacenamiento de contraseñas con MD5 (SonarQube Critical / Semgrep) y los contenedores como `root` (Semgrep). Cada corrección está respaldada por el cambio de código, por pruebas automatizadas que reproducen el ataque y por la desaparición de la alerta en el escaneo posterior.
2. **La superficie de dependencias vulnerables se redujo de 53 a 1 aviso**, eliminando todos los críticos (incluidas RCE y bypass de autorización en Next.js).
3. **Se reforzó la robustez de la API:** manejo de errores sin fuga de información, validación de entrada con listas blancas, límite de cuerpo, respuestas JSON consistentes y cabeceras `nosniff`/sin `X-Powered-By`.
4. **Los resultados "0 hallazgos" de SonarQube y Semgrep no significan que la aplicación sea segura.** Las vulnerabilidades más críticas del diseño —**JWT sin verificación de firma (R‑01)** y **control de acceso roto/IDOR (R‑03)**— **siguen presentes** y están documentadas con pruebas que fallan a propósito. También persisten el XSS, la cookie insegura, el CORS permisivo y la falta de *rate limiting*. Ninguna herramienta SAST las detectó, lo que ilustra las limitaciones del análisis automatizado y la necesidad de revisión manual y pruebas de seguridad dirigidas.
5. **La comparación antes/después tiene limitaciones metodológicas:** cambio de alcance en SonarQube (sin `docs/` ni SARIF de Semgrep), un escaneo ZAP API full "después" ejecutado antes del código final y ausencia del Full Scan del frontend. Estas diferencias deben mencionarse al presentar las cifras.

## 6. Riesgos residuales y recomendaciones priorizadas

| Prioridad | Riesgo | Acción recomendada |
|---|---|---|
| 1 | R‑01 JWT sin verificar | Reemplazar `jwt.decode` por `jwt.verify` con algoritmo fijo; convertir las pruebas `test.fails` en pruebas normales |
| 2 | R‑03 Broken Access Control / IDOR | Middleware de autorización por rol y por propiedad; denegar escritura a `viewer`; solo `admin` gestiona usuarios y roles |
| 3 | R‑02 Secreto JWT por defecto | Eliminar el valor de respaldo y exigir `JWT_SECRET` fuerte |
| 4 | R‑04 XSS | Eliminar `dangerouslySetInnerHTML` o sanitizar; añadir CSP |
| 5 | R‑05 / R‑06 Sesión y CORS | Cookie `HttpOnly; Secure; SameSite=Strict`; lista blanca de orígenes CORS; no guardar el token en `localStorage` |
| 6 | R‑07 Fuerza bruta | *Rate limiting* (p. ej. `express-rate-limit`) y bloqueo temporal |
| 7 | R‑08 Cabeceras frontend | `headers()` con CSP, `X-Frame-Options`/`frame-ancestors`, COOP/COEP/CORP, `Permissions-Policy`; `poweredByHeader: false` |
| 8 | R‑10 Contraseña por defecto | Exigir contraseña al crear usuarios con política mínima |
| 9 | R‑09 `braces` | Monitorizar el aviso y actualizar cuando exista parche |
| — | Verificación | Repetir el ZAP API full no autenticado con el código final; completar el ZAP Full Scan del frontend; volver a incluir `docs/` y el SARIF de Semgrep en SonarQube para que la comparación tenga el mismo alcance |
