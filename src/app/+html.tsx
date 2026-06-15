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
        <ScrollViewStyleReset />
        {/* Runs synchronously before first paint: sets background via inline style
            (highest specificity) so no white flash regardless of CSS load order. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches;var bg=d?'#0F2523':'#F5F3E3';document.documentElement.style.background=bg;document.body.style.background=bg;})();`,
          }}
        />
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
