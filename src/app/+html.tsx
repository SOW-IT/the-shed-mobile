import { ScrollViewStyleReset } from "expo-router/html";

// Customise the static HTML shell that wraps the Expo web app.
// https://docs.expo.dev/router/reference/static-rendering/#root-html
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/*
          On mobile browsers, bounce visitors into the native app via the
          custom scheme, preserving the path so deep links work
          (the-shed-mobile.vercel.app/request/abc -> theshedmobile://request/abc).
          If the app isn't installed, fall back to the store after a short wait.
          Desktop browsers keep using the web app. Append #noapp to bypass.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var ua = navigator.userAgent || "";
                var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && "ontouchend" in document);
                var isAndroid = /Android/.test(ua);
                if (!isIOS && !isAndroid) return;
                if (location.hash === "#noapp") return;

                var path = (location.pathname + location.search).replace(/^\\//, "");
                var appUrl = "theshedmobile://" + path;
                var store = isIOS
                  ? "https://apps.apple.com/app/id6781592871"
                  : "https://play.google.com/store/apps/details?id=au.org.sow.theshed";

                // If the app opens, the tab is hidden — cancel the store fallback.
                var fallback = setTimeout(function () { window.location = store; }, 1500);
                document.addEventListener("visibilitychange", function () {
                  if (document.hidden) clearTimeout(fallback);
                });
                window.addEventListener("pagehide", function () { clearTimeout(fallback); });

                window.location = appUrl;
              })();
            `,
          }}
        />
        <ScrollViewStyleReset />
        <style
          // React Native Web Modal renders with `position:fixed` but no
          // z-index, so the tab bar (which appears later in the stacking
          // context) can paint on top of it. Give every modal dialog a
          // high z-index so sheets and pickers always cover the tab bar.
          // Also pin the document background to the brand palette so the
          // browser chrome matches the app on initial load and in gaps.
          dangerouslySetInnerHTML={{
            __html: `
              div[aria-modal="true"] { z-index: 9999 !important; }
              html, body, #root, #root > div { background-color: #F5F3E3; }
              @media (prefers-color-scheme: dark) {
                html, body, #root, #root > div { background-color: #0F2523; }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
