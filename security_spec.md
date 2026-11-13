# Security Specification — DECILE Outreach Firestore

## 1. Data Invariants
1. Every document across `users`, `accounts`, `campaigns`, `leads`, `campaign_leads`, `messages`, `conversations`, `templates`, and `suppressions` MUST belong to a verified authenticated owner (`ownerId == request.auth.uid` and `request.auth.token.email_verified == true`).
2. `ownerId` and `createdAt` are immutable after document creation.
3. Server timestamps (`request.time`) are mandatory for `createdAt` on create and `updatedAt` on create/update.
4. Every string field has an explicit `.size()` upper bound; every list field has an explicit `.size()` bound.
5. `allow list` queries MUST explicitly filter `resource.data.ownerId == request.auth.uid`.
6. No plain-text or encrypted mailbox passwords are stored in client-readable Firestore documents; SMTP/IMAP passwords are encrypted with AES-256-GCM on the Express backend.

## 2. Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read/write**: Reading `/campaigns` with `request.auth == null`.
2. **Unverified email spoofing**: Writing `/accounts/acc1` with `email_verified: false`.
3. **Cross-tenant read**: User B calling `get` on User A's `/leads/lead1`.
4. **Cross-tenant list scrape**: Querying `/leads` without `where('ownerId', '==', uid)`.
5. **Identity spoofing on create**: User A creating `/campaigns/c1` with `ownerId: "user_B"`.
6. **Shadow ghost field**: User A creating `/leads/l1` with an extra `{ isAdmin: true }` field.
7. **Owner mutation on update**: User A updating `/campaigns/c1` to change `ownerId` to `"user_B"`.
8. **Timestamp forgery**: User A creating `/templates/t1` with a backdated `createdAt` instead of `request.time`.
9. **Oversized ID poisoning**: Writing `/campaigns/<200-char-id>` bypassing `isValidId()`.
10. **Oversized payload / Denial of Wallet**: Writing a 50KB `subject` string to `/campaigns/c1`.
11. **Unbounded array injection**: Writing 500 elements into `lead.tags`.
12. **Terminal state bypass**: Updating an immutable `messages/{id}` log entry after creation.
