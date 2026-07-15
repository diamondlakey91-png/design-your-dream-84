import type { CapacitorConfig } from "@capacitor/cli";

// Permivio mobile wrapper.
// Because the web app is server-rendered (TanStack Start on Cloudflare),
// we point the native shells at the deployed URL instead of a bundled
// static webDir. Update `server.url` to your production domain when live.
const config: CapacitorConfig = {
  appId: "app.permivio.mobile",
  appName: "Permivio",
  // webDir is required by the CLI but unused when `server.url` is set.
  webDir: "dist",
  server: {
    url: "https://permivio.lovable.app",
    cleartext: false,
    androidScheme: "https",
    // Allow the WebView to navigate to auth broker + Supabase auth domains
    // so Google sign-in redirects don't get blocked by the native shell.
    allowNavigation: [
      "permivio.lovable.app",
      "*.lovable.app",
      "*.lovable.dev",
      "oauth.lovable.app",
      "*.supabase.co",
      "accounts.google.com",
      "*.google.com",
      "*.googleusercontent.com",
      "appleid.apple.com",
    ],
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#050914",
  },
  android: {
    backgroundColor: "#050914",
  },
};

export default config;
