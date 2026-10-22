# iPhone draws the church map with Apple Maps

The Churches map (2.5.5) drew Google Maps on iPhone once
`GOOGLE_MAPS_IOS_API_KEY` was set in EAS, and production set it. The Google
Maps SDK for iOS is one precompiled 14 MB object that links in whole, plus a
2.3 MB resource bundle: about two thirds of the app's own binary in 2.9.29.
Apple encrypts app code before it compresses the download, so that code
downloads at nearly its full size. The App Store listed 2.9.29 at 38 MB on
iPhone against 18 MB on Google Play, where the map renderer is part of
Google Play Services and the app carries only a thin client.

From 2.10.0:

- **`app.config.js` no longer passes an iOS key** to the react-native-maps
  plugin or reports one in `extra.googleMaps`, so the iOS build leaves out
  the `GoogleMaps` and `Google-Maps-iOS-Utils` pods. A
  `GOOGLE_MAPS_IOS_API_KEY` left in an EAS environment changes nothing.
- **`ChurchMap.native.tsx` always draws Apple Maps on iPhone**, in the
  `mutedStandard` style it already used without a key. Android and the web
  keep Google Maps.

Measured on local release builds of 2.10.0 with and without the SDK, on
2026-10-22:

| | With Google Maps | Apple Maps |
| --- | --- | --- |
| App binary | 19.3 MB | 9.3 MB |
| Installed | 59.7 MB | 46.8 MB |
| Download (estimated) | 35.9 MB | 25.9 MB |

The download is estimated by filling each binary's encrypted range with
random bytes and zipping the app. The same method gives 35.9 MB for the
2.9.29 App Store build, which the store lists at 38 MB, so expect the store
to show about 27 MB.

## Considered options

**Keep Google Maps on iPhone.** The map looks the same on every platform,
for about 10 MB more on every iPhone download, for one map on one page.

**Download the SDK later.** iOS can't add native code after install;
on-demand resources cover assets, not frameworks.

**Hide the map on iPhone.** The list works without it, but the map is the
quickest way to see where people go, and Apple Maps costs nothing and needs
no key.

## Consequences

- The iPhone map is Apple's muted map while Android and the web show
  Google's. The pins, labels, selection and zoom-to-fit are the same code.
- Builds up to 2.9.29 still draw Google Maps with the production iOS key, so
  keep that key in Google Cloud until the minimum app version passes them.
  The `GOOGLE_MAPS_IOS_API_KEY` entry in EAS can go any time.
- It is a native change, so it reaches phones with the 2.10.0 store build,
  not over the air (2.10.0 needs a store build anyway).
- To bring Google Maps back on iPhone, pass the iOS key again in
  `app.config.js` and report it in `extra.googleMaps`; the component still
  takes `PROVIDER_GOOGLE` for Android.
