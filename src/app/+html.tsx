import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import { appLinkFor, WEB_ONLY_MARKER } from "../../shared/appLinks";

const APP_LINK = appLinkFor(process.env.EXPO_PUBLIC_APP_VARIANT);

export default function Root({ children }: { children: React.ReactNode }) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
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
                if (location.hash === ${JSON.stringify(WEB_ONLY_MARKER)}) return;
                try {
                  if (sessionStorage.getItem("shedAppBounce")) return;
                  sessionStorage.setItem("shedAppBounce", "1");
                } catch (e) {}
                if (location.pathname === "/checkin" || location.pathname.indexOf("/checkin/") === 0) return;
                var handback = /[?&]code=/.test(location.search);
                if (handback) window.__shedCodeToApp = true;

                function bounce() {
                  var path = (location.pathname + location.search).replace(/^\\//, "");
                  var appUrl = APP.scheme + "://" + path;
                  var store = isIOS ? APP.iosStore : APP.androidStore;

                  var fallback = setTimeout(function () {
                    if (handback) {
                      window.__shedCodeToApp = false;
                      window.dispatchEvent(new Event("shed-code-fallback"));
                      return;
                    }
                    if (document.hidden || (document.hasFocus && !document.hasFocus())) return;
                    if (store) window.location = store;
                  }, handback ? 2500 : 2000);
                  var cancel = function () { clearTimeout(fallback); };
                  if (handback) {
                    var taken = function () {
                      if (!window.__shedCodeToApp) return;
                      cancel();
                      window.__shedCodeToApp = false;
                      window.dispatchEvent(new Event("shed-code-taken"));
                    };
                    document.addEventListener("visibilitychange", function () {
                      if (document.hidden) taken();
                    });
                    window.addEventListener("pagehide", taken);
                  } else {
                    document.addEventListener("visibilitychange", function () {
                      if (document.hidden) cancel();
                    });
                    window.addEventListener("pagehide", cancel);
                    window.addEventListener("blur", cancel);
                    window.addEventListener("pointerdown", cancel, { once: true });
                    window.addEventListener("touchstart", cancel, { once: true });
                    window.addEventListener("keydown", cancel, { once: true });
                  }

                  window.location = appUrl;
                }

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
                html, body, #root, #root > div { background-color: #0B1D1B; }
              }
              input:focus, textarea:focus { outline: none; }
            `,
          }}
        />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
