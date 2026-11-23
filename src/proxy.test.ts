import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("overwrites a client-sent nonce and policy, and answers with the same nonce", () => {
    const request = new NextRequest("http://console.test/login", {
      headers: { "x-nonce": "attacker", "content-security-policy": "script-src *" },
    });
    const response = proxy(request);

    const forwarded = (name: string) => response.headers.get(`x-middleware-request-${name}`);
    const nonce = forwarded("x-nonce");
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe("attacker");
    expect(forwarded("content-security-policy")).not.toContain("script-src *");
    expect(forwarded("content-security-policy")).toContain(`'nonce-${nonce}'`);

    const sent = response.headers.get("content-security-policy");
    expect(sent).toBe(forwarded("content-security-policy"));
    expect(sent).toContain(`'nonce-${nonce}'`);
  });

  it("makes a new nonce for each request", () => {
    const get = () => proxy(new NextRequest("http://console.test/login")).headers.get("x-middleware-request-x-nonce");
    expect(get()).not.toBe(get());
  });
});

describe("proxy matcher", () => {
  const matches = (url: string, headers?: Record<string, string>) => unstable_doesMiddlewareMatch({ config, url, headers });

  it("matches pages, dotted module ids, public files and prefetches", () => {
    expect(matches("/login")).toBe(true);
    expect(matches("/")).toBe(true);
    expect(matches("/modules/A.B")).toBe(true);
    expect(matches("/env-config.js")).toBe(true);
    expect(matches("/login", { purpose: "prefetch" })).toBe(true);
    expect(matches("/login", { "next-router-prefetch": "1" })).toBe(true);
  });

  it("skips Next's static and image routes", () => {
    expect(matches("/_next/static/x.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
  });
});
