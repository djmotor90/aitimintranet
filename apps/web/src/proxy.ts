import { auth } from "@/lib/auth";

// Authorization decisions live in the `authorized` callback in src/lib/auth.ts.
// Wrapping in auth() lets Auth.js redirect unauthenticated users to /login.
export default auth(() => {});

export const config = {
  // Everything except static assets; public routes are allowed in the
  // `authorized` callback in src/lib/auth.ts.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
