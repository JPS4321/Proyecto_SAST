import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Hash de contraseñas con scrypt (función de derivación lenta y resistente a GPU)
// y un salt aleatorio por usuario. Corrige A04 / CWE-327 y CWE-759 (antes: MD5 sin salt).
// Formato almacenado: scrypt$<salt hex>$<hash hex>
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
  // Comparación en tiempo constante para no filtrar información por timing.
  return timingSafeEqual(expected, actual);
}
