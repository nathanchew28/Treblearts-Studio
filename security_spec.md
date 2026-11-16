# Security Specification — Cadence Studio

## 1. Data Invariants
1. **Strict Ownership**: Users may only create/update their own `/users/{userId}` profile, `/attempts/{attemptId}`, and delete their own `/exercises/{exerciseId}` or `/performances/{performanceId}`.
2. **No PII in Public Collections**: `/users/{userId}` contains zero email addresses, phone numbers, or private metadata.
3. **Strict Schema & Bounds**: Every string field enforces `.size()` limits; `notes` is bounded to `1..400` entries; `badges` is bounded to `0..24` strings; `audioDataUrl` is bounded to `680,000` chars.
4. **Temporal & Identity Integrity**: `createdAt` and `updatedAt` must equal `request.time`; `uid`, `authorId`, `userId`, and `createdAt` are immutable once written.
5. **Atomic Applause**: Applauding a public performance requires an atomic batch creating `/performances/{performanceId}/applause/{uid}` and incrementing `applauseCount` by exactly `1` (`existsAfter` + `getAfter`).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on User**: Creating `/users/{uid}` with extra field `isAdmin: true`.
2. **Identity Spoofing on Exercise**: Creating `/exercises/{id}` with `authorId: "other-user"`.
3. **Unverified Email Write**: Attempting any write with `request.auth.token.email_verified == false`.
4. **ID Poisoning**: Creating `/exercises/../../bad_id` or a 500-char document ID.
5. **Client Timestamp Forgery**: Creating `/attempts/{id}` with a backdated `createdAt`.
6. **Attempt Tampering**: Updating an existing `/attempts/{id}` to inflate `score` or `accuracy`.
7. **PlaysCount Inflation**: Updating someone else's `/exercises/{id}` with `playsCount: existing + 50`.
8. **Private Exercise Scraping**: Listing `/exercises` without filtering `isPublic == true` or `authorId == uid`.
9. **Unauthorized Exercise Edit**: Updating another teacher's `/exercises/{id}` `title` or `notationText`.
10. **Applause Replay / Inflation**: Incrementing `applauseCount` on `/performances/{id}` without creating `/applause/{uid}` atomically.
11. **Denial-of-Wallet Oversized Payload**: Submitting `notationText` > 120,000 chars or `notes.size() > 400`.
12. **Immutable Field Mutation**: Updating `authorId` or `createdAt` on an existing `/exercises/{id}` or `/performances/{id}`.
