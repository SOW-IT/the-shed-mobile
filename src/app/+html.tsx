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

          Crucially, the bounce is deferred until AFTER the page finishes
          loading: setting window.location during the initial load aborts the
          JS bundle, so a visitor who taps "Cancel" on the native "Open in app?"
          prompt would otherwise be stranded on a blank, non-interactive shell.
          Deferring means the working web app is already hydrated underneath, so
          Cancel just stays on the page. We also only try once per tab session
          and cancel the store fallback as soon as the visitor touches the page.

          The production scheme/package are hardcoded on purpose: the web export
          is production-only (scripts/deploy-web.mjs builds against prod Convex
          and deploys --prod; APP_VARIANT is never "staging" here). If a staging
          web deployment is ever added, make these values APP_VARIANT-aware.
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
                // Try the bounce at most once per tab session, so cancelling and
                // then using the web app doesn't keep re-triggering it.
                try {
                  if (sessionStorage.getItem("shedAppBounce")) return;
                  sessionStorage.setItem("shedAppBounce", "1");
                } catch (e) {}

                function bounce() {
                  var path = (location.pathname + location.search).replace(/^\\//, "");
                  var appUrl = "theshedmobile://" + path;
                  var store = isIOS
                    ? "https://apps.apple.com/app/id6781592871"
                    : "https://play.google.com/store/apps/details?id=au.org.sow.theshed";

                  var fallback = setTimeout(function () { window.location = store; }, 1500);
                  var cancel = function () { clearTimeout(fallback); };
                  // App opened -> tab hidden; or the visitor cancelled the prompt
                  // and is interacting with the web app -> keep them here.
                  document.addEventListener("visibilitychange", function () {
                    if (document.hidden) cancel();
                  });
                  window.addEventListener("pagehide", cancel);
                  window.addEventListener("pointerdown", cancel, { once: true });
                  window.addEventListener("touchstart", cancel, { once: true });
                  window.addEventListener("keydown", cancel, { once: true });

                  window.location = appUrl;
                }

                // Defer until the web app has fully loaded so Cancel lands on a
                // working page, not a half-loaded white screen.
                if (document.readyState === "complete") bounce();
                else window.addEventListener("load", bounce);
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
