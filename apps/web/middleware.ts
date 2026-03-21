import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/api/auth'];

// Pages only sales users can access
const SALES_ONLY_PATHS = [
  '/dashboard/proposals',
  '/dashboard/companies',
  '/dashboard/analytics',
  '/dashboard/content',
];

function getSalesEmails(): string[] {
  const raw = process.env.SALES_EMAILS ?? '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the landing page (exact root path)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for passkey session cookie
  const apiKeySession = request.cookies.get('proposales_session')?.value;

  // Only decode JWT if no passkey session (avoid expensive crypto on every request)
  let nextAuthToken = null;
  if (!apiKeySession) {
    nextAuthToken = await getToken({
      req: request as any,
      secret: process.env.NEXTAUTH_SECRET,
    });
  }

  if (!apiKeySession && !nextAuthToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Determine role
  let role: string = 'customer';
  const roleCookie = request.cookies.get('proposales_role')?.value;
  if (roleCookie === 'sales' || roleCookie === 'customer') {
    role = roleCookie;
  } else if (nextAuthToken?.email) {
    const email = (nextAuthToken.email as string).toLowerCase();
    const salesEmails = getSalesEmails();
    role = salesEmails.includes(email) ? 'sales' : 'customer';
  }

  // Redirect root /dashboard for customers → /dashboard/ai
  if (role === 'customer' && pathname === '/dashboard') {
    return NextResponse.redirect(new URL('/dashboard/ai', request.url));
  }

  // Block customers from sales-only pages
  if (role === 'customer' && SALES_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard/ai', request.url));
  }

  // Add security headers + role header for server components
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('x-user-role', role);

  // Persist role cookie for Google users so the client has it immediately
  if (!roleCookie && nextAuthToken?.email) {
    response.cookies.set('proposales_role', role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
