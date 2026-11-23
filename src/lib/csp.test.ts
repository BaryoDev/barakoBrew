import { describe, expect, it } from "vitest";
import { buildConsolePolicy, generateNonce, originOf } from "./csp";

const origins = ["http://api.example.test:5005", "https://press.example.test", "https://azuresearch-usnc.nuget.org"];

function directive(policy: string, name: string): string {
  const found = policy.split("; ").filter((part) => part.startsWith(`${name} `) || part === name);
  expect(found).toHaveLength(1);
  return found[0];
}

describe("buildConsolePolicy", () => {
  const prod = buildConsolePolicy({ nonce: "abc123==", connectOrigins: origins, isDev: false });

  it("allows only nonced scripts in production", () => {
    const scriptSrc = directive(prod, "script-src");
    expect(scriptSrc).toContain("'nonce-abc123=='");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval only in development", () => {
    const dev = buildConsolePolicy({ nonce: "n", connectOrigins: origins, isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).toContain(" ws: wss:");
    expect(prod).not.toContain("ws:");
  });

  it("lists every connect origin", () => {
    const connectSrc = directive(prod, "connect-src");
    for (const origin of origins) expect(connectSrc).toContain(origin);
    expect(connectSrc).toContain("'self'");
  });

  it("lists a repeated origin once", () => {
    const policy = buildConsolePolicy({ nonce: "n", connectOrigins: ["http://a.test", "http://a.test"], isDev: false });
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' http://a.test");
  });

  it("keeps every other directive once", () => {
    for (const name of [
      "default-src",
      "style-src",
      "img-src",
      "font-src",
      "connect-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
    ]) {
      directive(prod, name);
    }
    expect(directive(prod, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });
});

describe("generateNonce", () => {
  it("is 16 random bytes in base64 and differs per call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("originOf", () => {
  it("reduces to an origin and refuses non http(s)", () => {
    expect(originOf(" http://api.example.test:5005/x?y=1 ")).toBe("http://api.example.test:5005");
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});
