export type LinkFailure = { title: string; message: string };

const HTTP_URL = /^https?:\/\//i;

export const googleMapsUrl = (address: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export const mapsLink = (
  address: string,
  os: string
): { url: string; fallbackUrl: string; failure: LinkFailure } => ({
  url:
    os === "ios"
      ? `https://maps.apple.com/?q=${encodeURIComponent(address)}`
      : googleMapsUrl(address),
  fallbackUrl: googleMapsUrl(address),
  failure: { title: "Couldn't open Maps", message: `The address is ${address}.` },
});

export const browserFallbackFor = (url: string, fallbackUrl?: string): string | null => {
  const candidate = fallbackUrl ?? url;
  return HTTP_URL.test(candidate) ? candidate : null;
};

const safeDecode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const siteName = (url: string): string => {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.replace(/\/+$/, "");
    return `${hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
};

export const linkFailureText = (url: string): LinkFailure => {
  if (/^mailto:/i.test(url)) {
    const address = safeDecode(url.slice("mailto:".length).split("?")[0] ?? "");
    return {
      title: "Couldn't open your email app",
      message: address ? `You can email ${address} from another app.` : "Try again from another app.",
    };
  }
  if (/^tel:/i.test(url)) {
    return {
      title: "Couldn't start a call",
      message: `You can call ${url.slice("tel:".length)} from your phone app.`,
    };
  }
  return {
    title: "Couldn't open this link",
    message: HTTP_URL.test(url)
      ? `Try again, or open ${siteName(url)} in your browser.`
      : "Try again, or open it on another device.",
  };
};
