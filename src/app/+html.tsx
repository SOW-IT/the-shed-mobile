import { ScrollViewStyleReset } from "expo-router/html";

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
                var ua = navigator.userAgent || "";
                var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && "ontouchend" in document);
                var isAndroid = /Android/.test(ua);
                if (!isIOS && !isAndroid) return;
                if (location.hash === "#noapp") return;
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

                  var fallback = setTimeout(function () {
                    if (document.hidden || (document.hasFocus && !document.hasFocus())) return;
                    window.location = store;
                  }, 2000);
                  var cancel = function () { clearTimeout(fallback); };
                  document.addEventListener("visibilitychange", function () {
                    if (document.hidden) cancel();
                  });
                  window.addEventListener("pagehide", cancel);
                  window.addEventListener("blur", cancel);
                  window.addEventListener("pointerdown", cancel, { once: true });
                  window.addEventListener("touchstart", cancel, { once: true });
                  window.addEventListener("keydown", cancel, { once: true });

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
