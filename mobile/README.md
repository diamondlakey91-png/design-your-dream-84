# Permivio Mobile (Capacitor)

Native iOS + Android wrappers around the Permivio web app. The shells load
the deployed web URL (see `capacitor.config.ts` → `server.url`), so every
web deploy automatically ships to the installed apps. No JS rebundling
required for content changes.

## One-time setup

Requires a **Mac with Xcode** for iOS, and **Android Studio + JDK 17** for Android.

```bash
# From project root, on your local machine
bun install

# Add the native platform folders (creates ios/ and android/)
bunx cap add ios
bunx cap add android

# Sync web config into the native projects
bunx cap sync
```

Commit the generated `ios/` and `android/` folders.

## Update the URL the app points at

Edit `capacitor.config.ts` → `server.url` and re-run:

```bash
bunx cap sync
```

## Run on a device / simulator

```bash
# iOS (opens Xcode)
bunx cap open ios

# Android (opens Android Studio)
bunx cap open android
```

Then press Run in the IDE.

## App icons & splash screens

1. Put a 1024×1024 PNG at `mobile/assets/icon.png` and a 2732×2732 PNG at
   `mobile/assets/splash.png`.
2. `bun add -d @capacitor/assets`
3. `bunx capacitor-assets generate`

## Publishing

**iOS App Store**
- Apple Developer account ($99/yr)
- In Xcode: set signing team, bump version, Product → Archive → Distribute App
- Submit via App Store Connect

**Google Play Store**
- Google Play Console ($25 one-time)
- In Android Studio: Build → Generate Signed Bundle (AAB)
- Upload to Play Console

## Native APIs you can add later

Install as needed; each is a `bun add` + `bunx cap sync`:

- `@capacitor/push-notifications` — real push (needs APNs / FCM setup)
- `@capacitor/camera` — native camera for inspection photos
- `@capacitor/geolocation` — job-site location
- `@capacitor/filesystem` — offline document cache
- `@capacitor/share` — native share sheet for shared reports
- `@capacitor/app` — deep links (permivio://project/123)

## Notes

- The wrapper is a thin shell — all UI, auth, and Supabase calls run
  against the live web app, so users always get the latest version.
- Supabase OAuth (Google) works inside the WebView; no extra config
  needed as long as the redirect URL matches `server.url`.
- For fully offline mode, switch to a static export and set `webDir`
  to the build output instead of `server.url` — bigger project, ask
  Lovable when you're ready.
