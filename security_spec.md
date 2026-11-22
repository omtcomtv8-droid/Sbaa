# Firestore Security Specification

## 1. Roles & Capabilities
- **Owner Administrator (`request.auth.token.email_verified == true && request.auth.token.email.lower() == 'zakurmahmut@gmail.com'` or `/admins/{uid}` member)**:
  - Full `get`, `list`, `create`, `update`, `delete` on `/activation_codes/{codeId}`, `/devices/{deviceId}`, `/sessions/{sessionToken}` (except non-deletable immutable audit logs).
  - Full `get`, `list`, `create`, `update` on `/users/{userId}` and `get`, `list`, `create` on `/audit_logs/{logId}`.
- **Authenticated Verified Google Trader (`request.auth.uid`, `email_verified == true`)**:
  - Can `get`/`create`/`update` their own `/users/{userId}` profile (cannot escalate `role` to `admin`, no `list`, no `delete`).
  - Can `get` an `/activation_codes/{codeId}` document ONLY when unbound (`status == 'UNUSED'` and no mismatching `boundUserEmail`) or already bound to their own `uid` (`boundUserId == request.auth.uid`). No `list`, `create`, or `delete`.
  - Can `update` an `/activation_codes/{codeId}` document ONLY for single-use first redemption (`UNUSED -> ACTIVE` binding `boundUserId == request.auth.uid` with immutable code metadata), or updating their own bound code's active device count / expiration status (`ACTIVE -> ACTIVE | EXPIRED`). Terminal states (`EXPIRED`, `REVOKED`, `DISABLED`) are locked.
  - Can `get`/`list`/`create`/`update` their own `/devices/{deviceId}` and `/sessions/{sessionToken}` records scoped to `userId == request.auth.uid` (cannot un-revoke a revoked device or reactivate an expired/revoked session).
  - Can `create` bounded `/audit_logs/{logId}` entries (no `get`, `list`, `update`, `delete`).
  - Can manage their own `/users/{userId}/connections`, `/users/{userId}/orders`, `/users/{userId}/settings`, and `/userTrades/{tradeId}` documents.
- **Unauthenticated Users & Cross-User Access**:
  - Zero access to any collection (`allow read, write: if false;` catch-all at top).
- **Credential Secrets**:
  - `/admins/{adminId}` password hashes remain strictly inaccessible to all clients (`allow read, write: if false;`).

## 2. Schema & Field Constraints
- Every writable collection enforces `hasAll(...)` for required fields, `hasOnly(...)` for allowed fields, explicit type checks, string length bounds, and enum checks.
- Path IDs (`userId`, `codeId`, `deviceId`, `sessionToken`, `logId`, `connectionId`, `orderId`, `settingId`, `tradeId`) are validated via `isValidId()`.
