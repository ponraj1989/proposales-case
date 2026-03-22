import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import connectDB from '@/lib/mongodb';
import { User } from '@/lib/models';

const SESSION_COOKIE = 'proposales_session';
const ROLE_COOKIE = 'proposales_role';
const USER_ID_COOKIE = 'proposales_uid';
const STABLE_UID_COOKIE = 'proposales_stable_uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type UserRole = 'customer' | 'sales';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function getSalesEmails(): string[] {
  const raw = process.env.SALES_EMAILS ?? '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Validate a passkey against env-configured passkeys.
 */
function validatePasskey(passkey: string): { role: UserRole; label: string; stableUid: string } | null {
  const trimmed = passkey.trim();

  // Check sales passkey
  if (process.env.SALES_PASSKEY_1 && trimmed === process.env.SALES_PASSKEY_1) {
    return { role: 'sales', label: 'Sales Admin', stableUid: 'email:rajjose17@gmail.com' };
  }

  // Check user passkey
  if (process.env.USER_PASSKEY_1 && trimmed === process.env.USER_PASSKEY_1) {
    return { role: 'customer', label: 'Guest', stableUid: 'email:toponraja@gmail.com' };
  }

  return null;
}

/** Legacy AUTHORIZED_KEYS validation (SHA-256 hashes) */
function validateApiKeyHash(key: string): boolean {
  const raw = process.env.AUTHORIZED_KEYS ?? '';
  const hashes = raw.split(',').map((s) => s.trim()).filter(Boolean);
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

function setCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  token: string,
  role: UserRole,
  userId?: string,
  stableUid?: string,
) {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
  cookieStore.set(SESSION_COOKIE, token, opts);
  cookieStore.set(ROLE_COOKIE, role, opts);
  if (userId) cookieStore.set(USER_ID_COOKIE, userId, opts);
  if (stableUid) cookieStore.set(STABLE_UID_COOKIE, stableUid, opts);
}

/**
 * Create session from passkey login. Creates/updates user in MongoDB.
 */
export async function createPasskeySession(
  passkey: string,
): Promise<{ success: boolean; role?: UserRole; error?: string }> {
  // Try env passkeys first
  const result = validatePasskey(passkey);
  if (result) {
    await connectDB();
    // Use configured email/name for passkey users
    const email = result.role === 'customer' ? 'toponraja@gmail.com' : 'rajjose17@gmail.com';
    const name = result.role === 'customer' ? 'Ponraj' : 'Sales Admin';

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name,
        role: result.role,
        authMethod: 'passkey',
      });
    } else if (user.role !== result.role) {
      user.role = result.role;
      await user.save();
    }

    const sessionToken = hashKey(passkey + Date.now().toString());
    const cookieStore = await cookies();
    setCookies(cookieStore, sessionToken, result.role, user._id.toString(), result.stableUid);

    return { success: true, role: result.role };
  }

  // Fallback: legacy AUTHORIZED_KEYS (treated as sales)
  if (validateApiKeyHash(passkey)) {
    const sessionToken = hashKey(passkey + Date.now().toString());
    const cookieStore = await cookies();
    setCookies(cookieStore, sessionToken, 'sales', undefined, 'sales-legacy');
    return { success: true, role: 'sales' };
  }

  return { success: false, error: 'Invalid passkey' };
}

/** Backward-compatible alias */
export async function createSession(apiKey: string): Promise<boolean> {
  const result = await createPasskeySession(apiKey);
  return result.success;
}

/**
 * Get current session identifier.
 */
export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const apiKeySession = cookieStore.get(SESSION_COOKIE)?.value;
  if (apiKeySession) {
    // Return stable UID so conversations persist across logins
    const stableUid = cookieStore.get(STABLE_UID_COOKIE)?.value;
    return stableUid || apiKeySession;
  }

  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.email) {
    return `email:${nextAuthSession.user.email.toLowerCase()}`;
  }

  return null;
}

/**
 * Get the role of the current user.
 */
export async function getUserRole(): Promise<UserRole> {
  const cookieStore = await cookies();

  // Passkey session — role stored in cookie
  const roleCookie = cookieStore.get(ROLE_COOKIE)?.value;
  if (roleCookie === 'sales' || roleCookie === 'customer') {
    return roleCookie;
  }

  // NextAuth (Google) session — check SALES_EMAILS
  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.email) {
    const email = nextAuthSession.user.email.toLowerCase();
    const salesEmails = getSalesEmails();
    return salesEmails.includes(email) ? 'sales' : 'customer';
  }

  return 'customer';
}

/**
 * Get current user's MongoDB ID, creating user if needed.
 */
export async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const uid = cookieStore.get(USER_ID_COOKIE)?.value;
  if (uid) return uid;

  // For Google users, find or create in MongoDB
  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.email) {
    await connectDB();
    const email = nextAuthSession.user.email.toLowerCase();
    const salesEmails = getSalesEmails();
    const role: UserRole = salesEmails.includes(email) ? 'sales' : 'customer';

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name: nextAuthSession.user.name || email,
        image: nextAuthSession.user.image,
        role,
        authMethod: 'google',
      });
    }
    return user._id.toString();
  }

  return null;
}

/** Get the full NextAuth session with user details */
export async function getGoogleSession() {
  return getServerSession(authOptions);
}

/**
 * Get the current user's email address.
 * For Google users, returns the OAuth email.
 * For passkey users, returns the passkey-generated email from MongoDB.
 */
export async function getUserEmail(): Promise<string | null> {
  // Check NextAuth (Google) session first
  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.email) {
    return nextAuthSession.user.email.toLowerCase();
  }

  // For passkey users, look up from MongoDB
  const cookieStore = await cookies();
  const uid = cookieStore.get(USER_ID_COOKIE)?.value;
  if (uid) {
    await connectDB();
    const user = await User.findById(uid).select('email').lean();
    if (user && typeof user === 'object' && 'email' in user) {
      return (user as { email: string }).email;
    }
  }

  return null;
}

/**
 * Get the current user's display name.
 */
export async function getUserName(): Promise<string | null> {
  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.name) {
    return nextAuthSession.user.name;
  }

  const cookieStore = await cookies();
  const uid = cookieStore.get(USER_ID_COOKIE)?.value;
  if (uid) {
    await connectDB();
    const user = await User.findById(uid).select('name').lean();
    if (user && typeof user === 'object' && 'name' in user) {
      return (user as { name: string }).name;
    }
  }

  return null;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ROLE_COOKIE);
  cookieStore.delete(USER_ID_COOKIE);
  cookieStore.delete(STABLE_UID_COOKIE);
}
