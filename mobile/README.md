# Cael iOS

A native iOS app (Capacitor 8) that wraps the live site at
`https://cael.bertomill.com` in a WKWebView, the iPhone counterpart of `desktop/`.

Because it loads the deployed site, every Vercel deploy updates the app on its next
launch. Rebuild only to change the shell itself: icon, target URL, permissions or
native plugins.

## Prerequisites (one-time)

- Full **Xcode** from the Mac App Store (the Command Line Tools are not enough).
  Open it once, accept the license, install the iOS platform, and sign in under
  Xcode → Settings → Accounts with the Apple Developer account.
- On the iPhone: Settings → Privacy & Security → **Developer Mode** on (it asks
  after the first install attempt).

## Install on the phone

```bash
cd mobile
npm install
npx cap sync ios
npx cap open ios        # opens ios/App/App.xcodeproj
```

In Xcode: select the **App** target → Signing & Capabilities → pick your team.
Plug in the iPhone (or pair it over Wi-Fi), select it as the run destination, and
press ▶. A developer-account build stays installed for a year; re-run to refresh.

## Notes

- Config lives in `capacitor.config.ts`. `server.url` is the live site;
  `allowNavigation` keeps sign-in (Clerk, Google) inside the app, and any other
  link opens in Safari.
- `ios.appendUserAgent` makes the web view look like Safari, because Google blocks
  OAuth in embedded web views otherwise. If Google sign-in still fails, use the
  "Use the password instead" link.
- `www/offline.html` is bundled and shown when the site can't be reached.
- Icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  (1024², no alpha), flattened from `desktop/app-icon.png`.
- Camera, photo-library and microphone usage strings are in `ios/App/App/Info.plist`,
  because the web app's image uploads offer "Take Photo".
