import type { NextAuthConfig } from 'next-auth';

const authConfig = {
  trustHost: true,
  providers: [],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth: session, request }) {
      const isLoggedIn = Boolean(session?.user);
      const pathname = request.nextUrl.pathname;
      const isPublic =
        pathname === '/login' ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/_next') ||
        pathname === '/favicon.ico';

      if (isPublic) {
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
