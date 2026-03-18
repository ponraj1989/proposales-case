import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { createLogger } from './logger';

const log = createLogger('auth');

const SESSION_COOKIE = 'proposales_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function getAuthorizedHashes(): string[] {
  const raw = process.env.AUTHORIZED_KEYS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateApiKey(key: string): boolean {
  const hashes = getAuthorizedHashes();
  if (hashes.length === 0) return false;

  const keyHash = hashKey(key);

  return hashes.some((authorizedHash) => {
    try {
      const a = Buffer.from(keyHash, 'hex');
      const b = Buffer.from(authorizedHash, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function createSession(apiKey: string): Promise<boolean> {
  if (!validateApiKey(apiKey)) {
    log.warn('Invalid API key login attempt');
    return false;
  }
  log.info('API key session created');

  const sessionToken = hashKey(apiKey + Date.now().toString());
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return true;
}

export async function getSession(): Promise<string | null> {
  // Check API key session first
  const cookieStore = await cookies();
  const apiKeySession = cookieStore.get(SESSION_COOKIE)?.value;
  if (apiKeySession) return apiKeySession;

  // Check NextAuth (Google) session
  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.email) {
    return `google:${nextAuthSession.user.email}`;
  }

  return null;
}

/** Get the full NextAuth session with user details */
export async function getGoogleSession() {
  return getServerSession(authOptions);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
