import { DOMParser, parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { htmlToText, isEnglishPage, quoteLink, termsLinks } from "../src/page/detect";

beforeAll(() => {
  (globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser;
});

describe("htmlToText", () => {
  it("drops scripts, navigation and hidden elements", () => {
    const text = htmlToText(`<html><body><nav>Home Pricing</nav><script>track()</script>
      <main><h1>Terms</h1><p>Your plan renews monthly.</p><p aria-hidden="true">hidden</p></main></body></html>`);
    expect(text).toContain("Your plan renews monthly.");
    expect(text).not.toMatch(/track|Home Pricing|hidden/);
  });
});

describe("termsLinks", () => {
  it("finds terms links, drops duplicates and fragments", () => {
    const { document } = parseHTML(`<html><body>
      <a href="/legal/terms#billing">Subscription Terms</a>
      <a href="/legal/terms">Terms of Service</a>
      <a href="/blog">Blog</a>
      <a href="mailto:x@y.z">Terms by email</a></body></html>`);
    Object.defineProperty(document, "baseURI", { value: "https://example.com/signup" });
    expect(termsLinks(document as unknown as Document)).toEqual(["https://example.com/legal/terms"]);
  });
});

describe("quoteLink", () => {
  it("builds a text fragment from the first and last words", () => {
    const link = quoteLink("https://example.com/terms#top", "If you cancel during the minimum term an early termination fee of $300 applies.");
    expect(link.startsWith("https://example.com/terms#:~:text=")).toBe(true);
    expect(decodeURIComponent(link.split("=")[1]!)).toBe("If you cancel during the,fee of $300 applies.");
  });
});

describe("isEnglishPage", () => {
  it("skips pages that declare another language", () => {
    expect(isEnglishPage(parseHTML(`<html lang="de"><body></body></html>`).document as unknown as Document)).toBe(false);
    expect(isEnglishPage(parseHTML(`<html lang="en-GB"><body></body></html>`).document as unknown as Document)).toBe(true);
  });
});
