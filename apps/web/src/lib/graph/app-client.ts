/**
 * Microsoft Graph client using the daemon app registration
 * (client-credentials flow). Used by the worker and admin-triggered syncs.
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DAEMON_CLIENT_ID!,
        client_secret: process.env.DAEMON_CLIENT_SECRET!,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!res.ok) throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAppToken();
  const url = path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path}`;
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
}

export interface GraphUser {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  accountEnabled?: boolean;
  "@removed"?: { reason: string };
}

/** Iterate a delta/paged Graph collection, returning all values + final deltaLink. */
export async function collectPaged<T>(
  firstUrl: string,
): Promise<{ values: T[]; deltaLink?: string }> {
  const values: T[] = [];
  let url: string | undefined = firstUrl;
  let deltaLink: string | undefined;
  while (url) {
    const res = await graphFetch(url);
    if (!res.ok) throw new Error(`Graph request failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    values.push(...(page.value ?? []));
    url = page["@odata.nextLink"];
    deltaLink = page["@odata.deltaLink"] ?? deltaLink;
  }
  return { values, deltaLink };
}
