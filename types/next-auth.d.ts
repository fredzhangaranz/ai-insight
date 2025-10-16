import { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    username: string;
    role: string;
    mustChangePassword: boolean;
    lastLoginAt?: string | null;
    fullName?: string;
    email?: string;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: string;
      mustChangePassword: boolean;
      lastLoginAt?: string | null;
      fullName?: string;
      email?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: string;
    mustChangePassword?: boolean;
    lastLoginAt?: string | null;
    fullName?: string;
    email?: string;
  }
}
