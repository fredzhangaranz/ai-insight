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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.username = token.username as string;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
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
