# Microsoft Entra ID Setup

The intranet needs **two app registrations** in your Entra tenant (portal.azure.com → Entra ID → App registrations).

## 1. `aitim-intranet-web` — interactive SSO

- **Supported account types:** Accounts in this organizational directory only (single tenant)
- **Platform:** Web
- **Redirect URIs:**
  - `https://intranet.<your-domain>/api/auth/callback/microsoft-entra-id`
  - `http://localhost:3000/api/auth/callback/microsoft-entra-id` (dev)
- **API permissions (Delegated):**
  - `openid`, `profile`, `email`, `offline_access`, `User.Read`
  - `Presence.Read.All` — **requires admin consent** (colleague presence dots)
- **Token configuration:** add optional claim → *groups* (Group IDs) to ID token
- **Certificates & secrets:** create a client secret; note the value immediately

Env vars:

```
AUTH_MICROSOFT_ENTRA_ID_ID=<Application (client) ID>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0
ENTRA_TENANT_ID=<Directory (tenant) ID>
```

## 2. `aitim-intranet-daemon` — background worker (client credentials)

- **Supported account types:** single tenant
- **No redirect URIs**
- **API permissions (Application)** — all require **admin consent**:
  - `User.Read.All` — directory sync
  - `Group.Read.All`, `GroupMember.Read.All` — group/role sync
  - `Mail.Send` — notification emails
- **Certificates & secrets:** create a client secret

Env vars:

```
DAEMON_CLIENT_ID=<Application (client) ID>
DAEMON_CLIENT_SECRET=<client secret value>
GRAPH_SENDER_UPN=intranet@<your-domain>
```

### Restrict Mail.Send to the intranet mailbox (strongly recommended)

By default `Mail.Send` can send as *anyone*. Scope it to the dedicated mailbox with
an Exchange Application Access Policy (Exchange Online PowerShell):

```powershell
# One-time: create a mail-enabled security group containing only intranet@<domain>
New-ApplicationAccessPolicy `
  -AppId <DAEMON_CLIENT_ID> `
  -PolicyScopeGroupId IntranetSenders@<your-domain> `
  -AccessRight RestrictAccess `
  -Description "Intranet may only send as intranet@"

# Verify
Test-ApplicationAccessPolicy -AppId <DAEMON_CLIENT_ID> -Identity intranet@<your-domain>
```

## 3. Admin group mapping

Create (or pick) an Entra security group for intranet admins, e.g. `AITIM-Intranet-Admins`.
After first sign-in, map it under **Admin → Group role mappings** in the app
(target: platform role `admin`). Until then, the seeded/protected admin flag controls access.
