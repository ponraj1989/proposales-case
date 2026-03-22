import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import connectDB from '@/lib/mongodb';
import { User } from '@/lib/models';

const SESSION_COOKIE = 'proposales_session';
const ROLE_COOKIE = 'proposales_role';
const USER_ID_COOKIE = 'proposales_uid';
const STABLE_UID_COOKIE = 'proposales_stable_uid';

function getSalesEmails(): string[] {
  const raw = process.env.SALES_EMAILS ?? '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function GET() {
  const cookieStore = await cookies();

  // Fast path: passkey session — no JWT decode needed
  const apiKeySession = cookieStore.get(SESSION_COOKIE)?.value;
  if (apiKeySession) {
    const role = cookieStore.get(ROLE_COOKIE)?.value || 'customer';
    const userId = cookieStore.get(USER_ID_COOKIE)?.value || null;
    const stableUid = cookieStore.get(STABLE_UID_COOKIE)?.value || null;
    return NextResponse.json({
      authenticated: true,
      role,
      userId,
      stableUid,
      name: null,
      email: null,
      image: null,
    });
  }

  // Google OAuth path — single getServerSession call
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const email = session.user.email.toLowerCase();
  const salesEmails = getSalesEmails();
  const role = salesEmails.includes(email) ? 'sales' : 'customer';

  // Get userId from cookie first, else find/create in MongoDB
  let userId: string | null = cookieStore.get(USER_ID_COOKIE)?.value || null;
  if (!userId) {
    await connectDB();
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name: session.user.name || email,
        image: session.user.image,
        role,
        authMethod: 'google',
      });
    }
    userId = user._id.toString();
  }

  return NextResponse.json({
    authenticated: true,
    role,
    userId,
    stableUid: `google:${email}`,
    name: session.user.name || null,
    email: session.user.email || null,
    image: session.user.image || null,
  });
}
