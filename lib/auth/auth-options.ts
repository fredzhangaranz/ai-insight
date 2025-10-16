import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { UserService } from "@/lib/services/user-service";
import { getAuthConfig } from "./auth-config";

const authConfig = getAuthConfig();

export async function authorizeWithCredentials(
  credentials?: Record<string, string | undefined>
) {
  if (!authConfig.isEnabled) {
    return null;
  }

  const username = credentials?.username ?? credentials?.email;
  const password = credentials?.password;

  if (!username || !password) {
    return null;
  }

  const user = await UserService.verifyPassword(username, password);

  if (!user) {
    return null;
  }

  return {
    id: String(user.id),
    name: user.fullName,
    email: user.email,
    role: user.role,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
  };
}

export const authOptions: NextAuthOptions = {
  secret: authConfig.secret,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeWithCredentials,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: authConfig.sessionMaxAge,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.username = (user as any).username;
        token.mustChangePassword = (user as any).mustChangePassword;
        token.lastLoginAt = (user as any).lastLoginAt ?? null;
        token.fullName = (user as any).name;
        token.email = (user as any).email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.username = token.username as string;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.lastLoginAt =
          (typeof token.lastLoginAt === "string" ? token.lastLoginAt : null) ??
          null;
        session.user.fullName = token.fullName as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};

export default authOptions;
