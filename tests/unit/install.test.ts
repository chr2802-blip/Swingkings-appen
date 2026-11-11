import { describe, expect, it } from "vitest";
import { guideFor } from "@/lib/install";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS]",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

describe("guideFor", () => {
  it("knows the iPhone's browsers apart", () => {
    expect(guideFor(UA.iphoneSafari)).toBe("ios-safari");
    expect(guideFor(UA.iphoneChrome)).toBe("ios-chrome");
    expect(guideFor(UA.iphoneFirefox)).toBe("ios-other");
  });

  it("sends people in Facebook and Instagram out to a real browser", () => {
    expect(guideFor(UA.iphoneFacebook)).toBe("in-app");
    expect(guideFor(UA.iphoneInstagram)).toBe("in-app");
    expect(guideFor(UA.androidWebView)).toBe("in-app");
  });

  it("takes an iPad asking for the desktop site for an iPad once it is touched", () => {
    expect(guideFor(UA.ipadDesktopMode)).toBe("desktop");
    expect(guideFor(UA.ipadDesktopMode, 5)).toBe("ios-safari");
  });

  it("knows Android's browsers apart", () => {
    expect(guideFor(UA.androidChrome)).toBe("android-chrome");
    expect(guideFor(UA.androidSamsung)).toBe("android-samsung");
    expect(guideFor(UA.androidFirefox)).toBe("android-firefox");
  });

  it("leaves a computer alone", () => {
    expect(guideFor(UA.macChrome)).toBe("desktop");
    expect(guideFor("")).toBe("desktop");
  });
});
