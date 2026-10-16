// Pruebas unitarias del hash de contraseñas (scrypt con salt por usuario).
import { describe, expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../src/hash';

describe('hashPassword', () => {
  test('produce el formato scrypt$<salt>$<hash> y nunca contiene la contraseña', () => {
    const stored = hashPassword('S3creta!');
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored).not.toContain('S3creta!');
  });

  test('usa un salt distinto en cada llamada', () => {
    expect(hashPassword('igual')).not.toBe(hashPassword('igual'));
  });
});

describe('verifyPassword', () => {
  const stored = hashPassword('correcta');

  test('acepta la contraseña correcta', () => {
    expect(verifyPassword('correcta', stored)).toBe(true);
  });

  test('rechaza una contraseña incorrecta o vacía', () => {
    expect(verifyPassword('incorrecta', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  test('rechaza hashes heredados (MD5 sin salt) o mal formados', () => {
    expect(verifyPassword('admin', '21232f297a57a5a743894a0e4a801fc3')).toBe(false);
    expect(verifyPassword('admin', 'md5$aa$bb')).toBe(false);
    expect(verifyPassword('admin', 'scrypt$$abcd')).toBe(false);
    expect(verifyPassword('admin', 'scrypt$abcd$')).toBe(false);
  });
});
