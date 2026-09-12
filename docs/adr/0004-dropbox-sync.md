# ADR-0004 — In-app Dropbox backup sync (proposed)

- **Status:** proposed — not accepted, not scheduled. Written 2026-09-12 so the decision can
  be made on the trade-offs rather than re-derived.
- **Relates to:** `PLAN.md` 1.3 (one-tap re-export), `docs/dropbox-sync-guide.md` (the manual
  workflow that works today), ADR-0003 (at-rest encryption).

## Context

Meleo is local-first with no backend and no accounts (`CLAUDE.md` › What NOT to Do). A backup
file is the only way records survive a lost phone or move to a new one. Today that is a manual
export through the OS share sheet. The owner asked what it would take to have that copy land in
the user's own Dropbox automatically.

What this is, precisely: **the existing backup file, uploaded to the user's Dropbox on a
schedule, and offered for restore from there.** It is not multi-device live sync, and it is
not a Meleo account. The user's Dropbox is the user's own storage; Meleo never sees a token
for anyone but the person holding the phone.

## The decision to make

Build it or not. The recommendation at the end says *not yet*, and what would change that.

## Design, if built

### Scope (deliberately narrow)

1. **Connect Dropbox** in More → Your data. One button, one OAuth screen, done.
2. **Automatic upload** of the backup file to `/Apps/Meleo/meleo-backup.json` (Dropbox
   "app folder" permission — the app can see only that folder) after any write, debounced to
   at most once every 10 minutes, and on app open if the last upload is older than a day.
   Manual **Back up now** as well.
3. **Restore from Dropbox**: download that file and hand it to the existing `importBackup`.
   Same confirm dialog, same "replaces current data" semantics, same version gates.
4. **Disconnect**: forget the token; the file in Dropbox is left alone.

Out of scope: merging, per-record sync, sharing between users, any Meleo-side server.

### Auth

OAuth 2 **authorization code with PKCE**, which is designed for apps that cannot keep a secret.
The app key ships in the bundle (that is expected for PKCE). Redirect back to the PWA's own
origin; the code is exchanged from the page with `fetch`. Request offline access so a refresh
token is issued; store both tokens in `localStorage` under `fieldservice_dropbox` owned by a
new `dropboxSync.ts`, and **blocklist that key in `backup.ts`** so a token never rides inside a
backup file.

A Dropbox developer app must be registered (free) with the redirect URI of each deployed
origin (GitHub Pages, Netlify). That is the one piece of outside setup the owner has to do and
keep.

### Network

Two hosts join `CSP_DIRECTIVES.connect-src`: `https://api.dropboxapi.com` and
`https://content.dropboxapi.com` (the auth page itself is a navigation, not a fetch). Every
call goes through `fetchWithTimeout`. No SDK: the four endpoints needed (token, upload,
download, get_metadata) are plain HTTPS and an SDK would add ~100 kB to a bundle we just
trimmed.

### Conflict rule

There is exactly one file. Uploads send the Dropbox `rev` we last saw; if the server's `rev`
differs, another device wrote since we read, and the upload is **refused, not forced**. The
user sees "Dropbox has a newer backup from another device" with two buttons: *Restore it here*
(that device becomes the follower) or *Replace it with this phone's records*. This keeps the
guide's rule — one device counts — enforceable instead of merely advised.

### Privacy

The backup contains names, addresses, and notes about third parties. Uploading it to a cloud
service is a new disclosure the privacy policy must name (Dropbox, what is sent, that it is
the user's own account). It also changes ADR-0003's premise: that ADR declined encryption
*on the device*, where the OS already protects storage. A copy that leaves the device is a
different threat model. **If this is built, the file should be encrypted before upload** with
a passphrase the user sets on connect (WebCrypto AES-GCM, key from PBKDF2), and the passphrase
is never stored — losing it means the cloud copy is unreadable, which the connect screen must
say in plain words. Restoring on a new phone then asks for the passphrase.

### Testability

- `dropboxSync.ts` is written against an injected `fetch` so the rev-check, retry, and
  debounce logic are unit-tested with no network.
- The crypto wrapper is a pure module with a round-trip test and a wrong-passphrase test.
- The UI glue (connect button, status line, conflict dialog) follows the Backup card's pattern.

### Cost

Roughly three days of work for one person, plus ongoing: a Dropbox app registration to
maintain, token-refresh edge cases, and a support surface ("it says conflict") that the manual
flow does not have. Bundle impact is small (no SDK).

## Recommendation

**Do not build it yet.** The manual flow in `docs/dropbox-sync-guide.md` covers the real need
(a copy that survives the phone) with zero new trust relationships, and the reframe work
(`docs/tracking-first-plan.md`) is still finishing Wave 5. Three things would change the
answer:

1. Testers actually lose data because they did not export — the "Last backup" nag in Wave 5
   (F044) is the cheap fix to try first.
2. More than a handful of users run two devices and hit the one-device rule in practice.
3. The owner is comfortable registering and maintaining a Dropbox developer app, and with the
   privacy-policy change.

If it is built, build it in this order and stop after any step that proves unnecessary:
encryption wrapper → `dropboxSync.ts` with injected fetch → connect/disconnect → manual
"Back up now" → restore from Dropbox → automatic upload → conflict dialog.

## Consequences of accepting

- `CLAUDE.md`: the "no backend" statement gains a qualifier ("the user's own cloud storage,
  by explicit connection, is not a Meleo backend"), the CSP host list grows by two, the
  localStorage table gains `fieldservice_dropbox`.
- The privacy policy names Dropbox.
- ADR-0003 gets a note that off-device copies are encrypted even though on-device storage
  is not.
