# QR / share-link → installed-app routing — findings

**Problem:** When someone scans a Meleo share QR (a `…/#i=<encoded>` URL), it opens their
**default browser**, not the installed home-screen app — and on iOS the browser copy has
**none of their saved data**, so an imported share lands in the wrong place.

## Why it happens

- **iOS (WebKit):** an installed PWA (Add to Home Screen) has **storage isolated from Safari** —
  Cookies, Web Storage, and IndexedDB are separate between Safari and each installed PWA icon
  (Service Worker registration + CacheStorage are partially shared; app *data* is not). A URL
  opened from the camera/QR scanner opens in Safari, and iOS provides **no mechanism to route a
  plain https URL into an already-installed PWA**. So the scan can never land in the home-screen
  app, and even if it did, that app's IndexedDB isn't Safari's.
  - iOS 17.2+ copies *login cookies* to a PWA on install — helps auth, not our IndexedDB data.
- **Android (Chromium):** better — an installed PWA can capture in-scope links so a scanned URL
  focuses/opens the installed app instead of a new tab, via the manifest `launch_handler`
  (and, historically, `capture_links`, now folded into `launch_handler`). Still requires the
  PWA to be installed and, depending on OS/version, a one-time "open in app" opt-in.

## What we changed

- Added `launch_handler: { client_mode: ['navigate-existing', 'auto'] }` to the web manifest
  (`vite.config.ts`). On Chromium/Android this makes a scanned in-scope link navigate the
  **existing** installed window rather than spawning a fresh browser tab. No effect on iOS.

## Recommended reliable path (all platforms, today)

Use the **`.meleo` file share** for cross-device transfers: it opens into the installed app via
the OS share sheet (already supported — "Open a .meleo File" in More, and the New-Entry chooser's
"Import a Shared Item"). Unlike a URL, a file handed to the share sheet can target the installed
app directly. QR remains fine for **same-device / browser** use and for people who haven't
installed the app.

Follow-up (not done here): tighten in-app guidance so a share offers "send as file" prominently
for installed users, and note on the receiving side that scanning is best before install / on the
same browser the app lives in.

## The real fix needs the native build

Routing a scanned link into the installed app on iOS requires a native wrapper (App Store /
TWA-style) with **Universal Links** (`apple-app-site-association`) or a **custom URL scheme**, plus
a shared data store. This is a Phase-2 / native-build concern, consistent with the planned App
Store direction.

Sources:
- [PWA iOS Limitations and Safari Support (2026) — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [PWA on iOS — Current Status & Limitations (2025) — Brainhub](https://brainhub.eu/library/pwa-on-ios)
