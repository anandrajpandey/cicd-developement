import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compareSync } from 'bcryptjs';
import { z } from 'zod';

import authConfig from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function verifyPassword(password: string): boolean {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const plainPassword = process.env.ADMIN_PASSWORD;

  if (passwordHash) {
    return compareSync(password, passwordHash);
  }

  if (plainPassword) {
    return password === plainPassword;
  }

  return false;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@local.dev';
        if (parsed.data.email !== adminEmail) {
          return null;
        }

        if (!verifyPassword(parsed.data.password)) {
          return null;
        }

        return {
          id: 'admin-user',
          email: adminEmail,
          name: 'Local Admin',
        };
      },
    }),
  ],
});
