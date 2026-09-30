import { ScrollViewStyleReset } from "expo-router/html";
import { appLinkFor } from "../../shared/appLinks";

// Rendered at build time: the dev web build sets EXPO_PUBLIC_APP_VARIANT=staging
// so phones are handed to The SHED Staging rather than the production app.
const APP_LINK = appLinkFor(process.env.EXPO_PUBLIC_APP_VARIANT);

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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var APP = ${JSON.stringify(APP_LINK)};
                var ua = navigator.userAgent || "";
                var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && "ontouchend" in document);
                var isAndroid = /Android/.test(ua);
                if (!isIOS && !isAndroid) return;
                if (location.hash === "#noapp") return;
                try {
                  if (sessionStorage.getItem("shedAppBounce")) return;
                  sessionStorage.setItem("shedAppBounce", "1");
                } catch (e) {}
                // A Google sign-in code arriving on a fresh page is usually the
                // app's sign-in sheet landing here: it goes to this deployment's
                // app, and the page holds off using it (a code works once).
                var handback = /[?&]code=/.test(location.search);
                if (handback) window.__shedCodeToApp = true;

                function bounce() {
                  var path = (location.pathname + location.search).replace(/^\\//, "");
                  var appUrl = APP.scheme + "://" + path;
                  var store = isIOS ? APP.iosStore : APP.androidStore;

                  var fallback = setTimeout(function () {
                    if (handback) {
                      // No app took it: let the web page sign in with it.
                      window.__shedCodeToApp = false;
                      window.dispatchEvent(new Event("shed-code-fallback"));
                      return;
                    }
                    if (document.hidden || (document.hasFocus && !document.hasFocus())) return;
                    if (store) window.location = store;
                  }, handback ? 2500 : 2000);
                  var cancel = function () { clearTimeout(fallback); };
                  document.addEventListener("visibilitychange", function () {
                    if (document.hidden) cancel();
                  });
                  window.addEventListener("pagehide", cancel);
                  if (!handback) {
                    window.addEventListener("blur", cancel);
                    window.addEventListener("pointerdown", cancel, { once: true });
                    window.addEventListener("touchstart", cancel, { once: true });
                    window.addEventListener("keydown", cancel, { once: true });
                  }

                  window.location = appUrl;
                }

                // After load: leaving mid-load would abort the page, leaving
                // nothing to sign in with if no app takes the code.
                if (document.readyState === "complete") bounce();
                else window.addEventListener("load", bounce);
              })();
            `,
          }}
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              div[aria-modal="true"] { z-index: 9999 !important; }
              html, body, #root, #root > div { background-color: #F5F3E3; }
              @media (prefers-color-scheme: dark) {
                html, body, #root, #root > div { background-color: #0F2523; }
              }
              input:focus, textarea:focus { outline: none; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
