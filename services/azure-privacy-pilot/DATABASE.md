# PostgreSQL integration

## Implemented

- Separate `azure_intake` schema: single-use nonces and immutable operation
  reservations. Unique constraints arbitrate duplicate requests across servers.
- Transactional versioned migration with an advisory lock and SHA-256 checksum.
- Parameterized SQL, a three-connection pool, connection/statement/lock timeouts,
  TLS certificate and hostname verification. Optional CA bundle for Azure roots.
- Server factory connects the existing signed intake flow to PostgreSQL.
- Synthetic SQL integration tests using PGlite's PostgreSQL engine. These do
  not test Azure networking, TLS negotiation or simultaneous database sessions.

This is the durable intake layer, not a migration of the entire product database.
Existing Supabase migrations reference `auth.users`, `auth.uid()`, service roles,
Storage, RLS and payment RPCs. Applying those files directly to Azure would fail
or omit required security semantics. Frontend Supabase settings stay as they are.

## Server configuration

Set these on the backend through its secret/configuration settings, never Vite
variables, client JavaScript, git, command-line password arguments or chat:

| Setting | Value |
| --- | --- |
| `AZURE_PG_HOST` | Actual `<server>.postgres.database.azure.com` hostname |
| `AZURE_PG_DATABASE` | Dedicated pilot database |
| `AZURE_PG_USER` | Restricted runtime database login |
| `AZURE_PG_PASSWORD` | Runtime secret supplied securely |
| `AZURE_PG_CA_FILE` | Optional absolute path to trusted Azure root PEM bundle |

This adapter currently uses password authentication; it does not implement Entra
token renewal. Azure portal login and a subscription ID are not database credentials.
Keep `require_secure_transport` enabled and restrict the firewall/private network
to the backend. Never enable all public IPs to make a connection test pass.

## Apply and verify

From this directory, with Node 22 or newer:

```sh
npm ci
npm test
npm run db:migrate
npm run db:check
```

Run migration once with a separate migration login that owns the dedicated
database/schema. The command does not provision an Azure server or database.
After migration, the administrator grants the existing runtime login only:

```sql
-- Replace the quoted placeholder with the actual, administrator-created login.
GRANT USAGE ON SCHEMA azure_intake TO "pilot_runtime";
GRANT SELECT, INSERT ON azure_intake.handoff_nonces TO "pilot_runtime";
GRANT SELECT, INSERT ON azure_intake.operations TO "pilot_runtime";
```

Run `db:check` again with the runtime login. The runtime must not own the schema,
inherit the migration role, or receive UPDATE/DELETE/DDL permissions. There is
no browser database access and no Supabase RLS emulation in this schema: the
backend is the trust boundary. `findOperation` requires a subject derived from
verified authentication, never a caller-selected identity.

## Wire into a trusted backend

```js
import { openDatabase, createDatabaseIntake } from './database.mjs';

const db = await openDatabase();
const intake = createDatabaseIntake({
  db,
  secret: signingSecretBytes, // supplied by the backend secret provider
  checkEntitlement: authoritativeEntitlementCheck,
});
const reservation = await intake(signedHandoffToken);
// No upload permission or paid processing is issued by this module.
// Close with await db.end() during service shutdown.
```

`authoritativeEntitlementCheck` must validate the exact subject, operation and
product against the live payment/entitlement authority, including environment,
revocation and existing fulfillment. It has no default. Do not substitute
`async () => true`, accept a browser claim, or copy a stale paid status into this
database. Concurrent refunds can occur after an intake check; any future worker
must revalidate eligibility and use the existing exactly-once fulfillment claim
before a paid provider call. This module is not a payment or provider-job claim.

On timeout or database failure, deny intake. An ambiguous insert can have committed:
do not bypass duplicate protection or blindly retry processing. Nonce consumption
commits before entitlement checking, so failures burn the token. A fresh token
cannot reserve an already reserved operation.

## Deployment acceptance and remaining work

No live connection, Azure migration or production switch has been performed.
Needed next: an actual Azure PostgreSQL hostname/database, secure runtime and
migration access, and the server-side entitlement bridge plus HTTP/auth wiring.
Then run migration/check in staging, verify restricted-role access and cross-session
duplicates, restart the backend and prove reservations persist. TLS failure and
network denial must fail closed. Test only synthetic identities/documents.

No cleanup runs automatically. A separate maintenance identity may delete nonces
older than `expires_at + interval '10 minutes'` only with backend clocks kept in
sync; never delete operation reservations as a retry mechanism. Retention and
subject deletion need explicit lifecycle work before real users. For rollback,
disable the new route and preserve these tables for reconciliation; do not drop
or restore away consumed reservations while the route is active.

No infrastructure is provisioned, so this change itself adds no Azure charges.
Before provisioning, confirm the selected region/SKU estimate fits the intended
budget; a Cost Management budget does not stop resources automatically.

References:
- [Azure PostgreSQL TLS](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls-how-to-connect)
- [node-postgres TLS configuration](https://node-postgres.com/features/ssl)
