# Keeping Meleo backed up with Dropbox

Meleo keeps everything on your phone. There is no Meleo server, so nothing is copied anywhere
unless you copy it. Dropbox is a good place for that copy: it survives a lost or replaced phone,
and it lets you move your records to a new device.

This is a **backup**, not a live sync. Two phones do not stay in step on their own — see
"Using two devices" below before you try that.

---

## One-time setup

1. Install the **Dropbox app** on your phone and sign in.
2. In Dropbox, create a folder for Meleo, for example `Apps/Meleo`. Any folder works; a
   dedicated one keeps old backups easy to find.
3. On iPhone, open **Files → Browse → ⋯ → Edit** and switch **Dropbox** on, so Dropbox shows up
   as a location when Meleo asks you to pick a file. Android shows Dropbox in the file picker
   automatically once the app is installed.

---

## Making a backup (about 20 seconds)

1. In Meleo, open **More → Your data → Export Backup**.
2. Your phone's share sheet opens. Choose **Dropbox** (on iPhone it may read **Save to Dropbox**).
3. Pick your Meleo folder and tap **Save**.

The file is named `meleo-backup-YYYY-MM-DD.json`, with today's date, so each backup sits
beside the previous one rather than replacing it. Meleo's More tab then shows *Last backup:
just now*.

**How often:** once a week is plenty for most publishers. Pioneers logging every day may prefer
every couple of days. The *Last backup* line on the More tab tells you how long it has been.

If the share sheet does not offer Dropbox, tap **More** or **Edit** in the share sheet to add it,
or choose **Save to Files** and pick the Dropbox location there.

---

## Restoring on a new phone

Restoring **replaces everything** on the phone you restore to. On a brand-new install that is
what you want. On a phone that already has records, export a backup from it first.

1. Install Meleo on the new phone and open it once, so it is set up.
2. Open **More → Your data → Restore (replaces current data)**.
3. In the file picker, go to **Dropbox → your Meleo folder** and choose the newest
   `meleo-backup-…json`. On Android, if Dropbox does not appear, open the Dropbox app, long-press
   the file, choose **Make available offline**, then try again.
4. Meleo checks the file, restores it, and reloads. Contacts, streets, territories, time
   records, goals, and settings all come back.

A backup made by a newer version of Meleo than the one installed is refused with a message
telling you to update the app first. Update, then restore. Older backups always restore.

---

## Using two devices

Meleo has no account and no server, so it cannot merge changes made on two phones. If you use a
tablet at home and a phone in the ministry, pick **one device as the one that counts** and
treat the other as read-only:

- Log time, calls, and return visits on the main device.
- When you want the other device up to date, export from the main device and restore on the
  other. Anything entered on the other device since its last restore is lost, which is why it
  should be read-only.

For handing a single contact, street, or territory to someone else (or to your own second
device), use **Share** on that item instead. That sends just that item as a QR code, link, or
`.meleo` file and never touches the rest of your records.

---

## What is in the file, and who can see it

The backup is a plain text file containing every record in the app: names, addresses, phone
numbers, notes, call history, and time logs. Anyone who can open your Dropbox can read it.

- Keep Dropbox itself protected: a strong password and two-step verification.
- Do not share the Meleo folder with anyone.
- If you delete old backups, empty Dropbox's **Deleted files** too.
- Meleo does not encrypt the file. A future version may offer a passphrase on export; until
  then, Dropbox's own protection is what guards the copy.

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "That doesn't look like a Meleo backup file." | The file was renamed, edited, or is not a backup | Pick a `meleo-backup-…json` that Meleo itself exported |
| "This backup was made by a newer version of Meleo…" | The phone's app is older than the one that made the file | Update Meleo, then restore |
| Share sheet has no Dropbox | Dropbox is not installed or not enabled for sharing | Install it, or use **Save to Files** and choose Dropbox as the location |
| Restored, but the map is empty | Map pins come from stored coordinates and load fine offline; tiles need a connection | Connect to the internet once and open the Map tab |
