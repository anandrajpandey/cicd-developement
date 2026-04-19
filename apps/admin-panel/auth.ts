import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { db, users } from '@agentic-cicd/db';
import { eq } from 'drizzle-orm';

import authConfig from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function verifyFallbackPassword(password: string): boolean {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const plainPassword = process.env.ADMIN_PASSWORD;

  if (passwordHash) {
    return bcrypt.compareSync(password, passwordHash);
  }

  if (plainPassword) {
    return password === plainPassword;
  }

  return false;
}

async function authorizeAdmin(email: string, password: string) {
  const databaseUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (databaseUser) {
    const valid = bcrypt.compareSync(password, databaseUser.passwordHash);
    if (!valid) {
      return null;
    }

    return {
      id: databaseUser.userId,
      email: databaseUser.email,
      name: 'Local Admin',
    };
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@local.dev';
  if (email !== adminEmail) {
    return null;
  }

  if (!verifyFallbackPassword(password)) {
    return null;
  }

  return {
    id: 'admin-user',
    email: adminEmail,
    name: 'Local Admin',
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        try {
          return await authorizeAdmin(parsed.data.email, parsed.data.password);
        } catch {
          const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@local.dev';
          if (parsed.data.email !== adminEmail) {
            return null;
          }

          if (!verifyFallbackPassword(parsed.data.password)) {
            return null;
          }

          return {
            id: 'admin-user',
            email: adminEmail,
            name: 'Local Admin',
          };
        }
      },
    }),
  ],
});
