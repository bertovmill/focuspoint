import type { CapacitorConfig } from "@capacitor/cli";

// The iOS app is a thin shell around the live site: every Vercel deploy shows up
// in the app on next launch, no rebuild. Rebuild only to change the shell itself
// (icon, target URL, native plugins).
const config: CapacitorConfig = {
  appId: "com.bertomill.cael",
  appName: "Cael",
  // Bundled offline fallback — only shown if the live site can't be reached.
  webDir: "www",
  server: {
    url: "https://cael.bertomill.com",
    errorPath: "offline.html",
    // Hosts that stay inside the app; anything else opens in Safari.
    allowNavigation: ["cael.bertomill.com", "clerk.bertomill.com", "accounts.google.com"],
  },
  ios: {
    // Google refuses OAuth in embedded web views unless the UA looks like Safari.
    appendUserAgent: "Version/18.0 Safari/604.1",
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 0 },
  },
};

export default config;
