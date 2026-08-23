/** High-impact ad and tracker hosts. Suffix-matched (e.g. ads.foo.doubleclick.net). */
export const BLOCKED_HOST_SUFFIXES: readonly string[] = [
  "2mdn.net",
  "adservice.google.com",
  "adservice.google.com.sg",
  "adform.net",
  "adgrx.com",
  "adition.com",
  "adsafeprotected.com",
  "adsymptotic.com",
  "advertising.com",
  "amazon-adsystem.com",
  "adsystem.amazon.com",
  "app-measurement.com",
  "bidswitch.net",
  "casalemedia.com",
  "contextweb.com",
  "criteo.com",
  "criteo.net",
  "crwdcntrl.net",
  "doubleclick.net",
  "everesttech.net",
  "exelator.com",
  "facebook.net",
  "googleadservices.com",
  "google-analytics.com",
  "googlesyndication.com",
  "googletagservices.com",
  "hotjar.com",
  "hotjar.io",
  "imrworldwide.com",
  "indexww.com",
  "krxd.net",
  "lijit.com",
  "media.net",
  "moatads.com",
  "mookie1.com",
  "nr-data.net",
  "openx.net",
  "outbrain.com",
  "pagead2.googlesyndication.com",
  "pubmatic.com",
  "quantserve.com",
  "rlcdn.com",
  "rubiconproject.com",
  "scorecardresearch.com",
  "serving-sys.com",
  "sharethrough.com",
  "smartadserver.com",
  "spotxchange.com",
  "taboola.com",
  "tapad.com",
  "teads.tv",
  "ads.twitter.com",
  "static.ads-twitter.com",
  "ads-twitter.com",
  "3lift.com",
  "adsrvr.org",
  "adnxs.com",
  "adobedtm.com",
  "agkn.com",
  "analytics.tiktok.com",
  "bluekai.com",
  "bounceexchange.com",
  "branch.io",
  "chartbeat.com",
  "clarity.ms",
  "clicktale.net",
  "ct.pinterest.com",
  "demdex.net",
  "dotomi.com",
  "eyeota.net",
  "flashtalking.com",
  "fullstory.com",
  "inspectlet.com",
  "mixpanel.com",
  "mouseflow.com",
  "omtrdc.net",
  "optimizely.com",
  "permutive.com",
  "px.ads.linkedin.com",
  "quantcount.com",
  "segment.io",
  "statcounter.com",
  "stickyadstv.com",
  "tr.snapchat.com",
  "tremorhub.com",
  "turn.com",
  "yieldmo.com",
  "zemanta.com",
];

const EASYLIST_SOURCES = [
  "https://easylist.to/easylist/easylist.txt",
  "https://easylist.to/easylist/easyprivacy.txt",
];

export function hostIsBlocked(hostname: string, suffixes: Iterable<string>): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  for (const suffix of suffixes) {
    if (!suffix || suffix.includes("/")) continue;
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

export function parseEasyListHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    const match = /^\|\|([a-z0-9.-]+)\^/i.exec(line);
    if (match) hosts.push(match[1].toLowerCase());
  }
  return hosts;
}

export { EASYLIST_SOURCES };
