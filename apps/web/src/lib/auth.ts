import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const GRAPH_SCOPES = "openid profile email offline_access User.Read Presence.Read.All";

const devAuthEnabled = process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production";

// Fail loudly at RUNTIME if AUTH_URL is missing in production. Without it,
// Auth.js falls back to deriving the OAuth redirect_uri from request headers,
// which behind some reverse-proxy misconfigurations yields the internal
// container hostname (e.g. https://8d202286fcb1:3000/...) and breaks sign-in
// with OAuthCallbackError.
//
// We only check at runtime (NEXT_RUNTIME is set by the standalone server, not
// during `next build` which sets NEXT_PHASE) so the guard doesn't break
// production builds where Coolify may inject env vars at runtime only.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_RUNTIME !== undefined &&
  process.env.NEXT_PHASE === undefined &&
  !process.env.AUTH_URL
) {
  // eslint-disable-next-line no-console
  console.error(
    "\n[FATAL] AUTH_URL is not set. In production, AUTH_URL must be the public\n" +
      "        canonical URL of the app (e.g. https://intranet.apps.aitim.ai).\n" +
      "        Without it, OAuth callbacks use the wrong host and sign-in fails.\n",
  );
  throw new Error("AUTH_URL is required in production. See docs/coolify.md.");
}

/** Upsert the signing-in Entra user and return our internal row. Lazy db import keeps proxy bundle light. */
async function provisionUser(profile: {
  oid: string;
  email: string;
  name: string;
}): Promise<{ id: string; platformRole: "admin" | "member" } | null> {
  const { db, users } = await import("@aitim/db");
  const { eq } = await import("drizzle-orm");

  const existing = await db.select().from(users).where(eq(users.entraObjectId, profile.oid));
  if (existing[0]) {
    if (!existing[0].isActive) return null; // deactivated accounts may not sign in
    await db
      .update(users)
      .set({ email: profile.email, displayName: profile.name })
      .where(eq(users.id, existing[0].id));
    return { id: existing[0].id, platformRole: existing[0].platformRole };
  }
  const [created] = await db
    .insert(users)
    .values({
      entraObjectId: profile.oid,
      email: profile.email,
      displayName: profile.name,
      platformRole: "member",
    })
    .returning();
  return { id: created.id, platformRole: created.platformRole };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          grant_type: "refresh_token",
          refresh_token: token.refreshToken!,
          scope: GRAPH_SCOPES,
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in),
      error: undefined,
    };
  } catch (error) {
    console.error("Failed to refresh Entra access token", error);
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    MicrosoftEntraID({
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: GRAPH_SCOPES } },
    }),
    ...(devAuthEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Dev Login",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(credentials) {
              const { db, users } = await import("@aitim/db");
              const { eq } = await import("drizzle-orm");
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, String(credentials?.email ?? "dev@aitim.local")));
              if (!user || !user.isActive) return null;
              return { id: user.id, email: user.email, name: user.displayName };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Initial sign-in via Entra
      if (account?.provider === "microsoft-entra-id" && profile) {
        const provisioned = await provisionUser({
          oid: String(profile.oid ?? profile.sub),
          email: String(profile.email ?? profile.preferred_username ?? ""),
          name: String(profile.name ?? ""),
        });
        if (!provisioned) return { ...token, error: "RefreshTokenError" };
        token.userId = provisioned.id;
        token.platformRole = provisioned.platformRole;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.roleCheckedAt = Date.now();
        return token;
      }
      // Initial sign-in via dev credentials
      if (account?.provider === "dev" && user) {
        const { db, users } = await import("@aitim/db");
        const { eq } = await import("drizzle-orm");
        const [row] = await db.select().from(users).where(eq(users.id, user.id!));
        token.userId = row.id;
        token.platformRole = row.platformRole;
        token.roleCheckedAt = Date.now();
        return token;
      }
      // Subsequent requests: refresh the Graph token if expired
      if (token.refreshToken && token.expiresAt && Date.now() / 1000 > token.expiresAt - 60) {
        token = await refreshAccessToken(token);
      }
      // Re-read role/active status from DB every 5 minutes so promotions,
      // group-mapping syncs, and deactivations reach live sessions.
      const now = Date.now();
      if (token.userId && (!token.roleCheckedAt || now - token.roleCheckedAt > 5 * 60_000)) {
        try {
          const { db, users } = await import("@aitim/db");
          const { eq } = await import("drizzle-orm");
          const [row] = await db
            .select({ platformRole: users.platformRole, isActive: users.isActive })
            .from(users)
            .where(eq(users.id, token.userId));
          // User deleted or deactivated: invalidate the session.
          if (!row || !row.isActive) return { ...token, userId: undefined };
          token.platformRole = row.platformRole;
          token.roleCheckedAt = now;
        } catch (err) {
          // Transient DB issue: keep the existing role rather than dropping the session.
          console.error("Session role refresh failed", err);
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.platformRole = token.platformRole ?? "member";
      }
      session.accessToken = token.accessToken;
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/forms/") ||
        pathname.startsWith("/api/forms/") ||
        pathname.startsWith("/api/auth/") ||
        pathname.startsWith("/api/health");
      if (isPublic) return true;
      // Require a resolvable internal user id — a session whose user no longer
      // exists (e.g. after a DB rebuild) must land on /login, not loop.
      return !!session?.user?.id;
    },
  },
});
