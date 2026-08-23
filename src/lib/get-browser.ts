import { MiniBrowser } from "@/lib/mini-browser";

const globalForMini = globalThis as unknown as {
  __miniBrowser?: MiniBrowser;
};

export function getMiniBrowser(): MiniBrowser {
  if (!globalForMini.__miniBrowser) {
    globalForMini.__miniBrowser = new MiniBrowser();
  }
  return globalForMini.__miniBrowser;
}
