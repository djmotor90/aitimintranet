import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Our internal users.id (uuid) */
      id: string;
      platformRole: "admin" | "member";
    } & DefaultSession["user"];
    /** Delegated Graph access token (for presence etc.) */
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    platformRole?: "admin" | "member";
    accessToken?: string;
    refreshToken?: string;
    /** Epoch seconds */
    expiresAt?: number;
    error?: "RefreshTokenError";
  }
}
