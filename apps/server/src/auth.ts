import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      keyLength,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const key = await derive(password, salt),
    stored = Buffer.from(expected, 'hex');
  return stored.length === key.length && timingSafeEqual(stored, key);
}
export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function newToken() {
  return randomBytes(32).toString('hex');
}
export function equalToken(a: string, b: string) {
  return timingSafeEqual(Buffer.from(tokenHash(a)), Buffer.from(tokenHash(b)));
}
