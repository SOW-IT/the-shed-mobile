/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { bytesToBase64, parseReceiptFields } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const asUser = (t: TestConvex<typeof schema>, email = "rachel@sow.org.au") =>
  t.withIdentity({ email, subject: email, issuer: "test" });

/** A stored image to OCR. */
const storeImage = (t: TestConvex<typeof schema>) =>
  t.run((ctx) => ctx.storage.store(new Blob(["fake-bytes"], { type: "image/jpeg" })));

/** A mocked Gemini 200 response whose single text part is `jsonText`. */
const geminiOk = (jsonText: string) => ({
  ok: true,
  json: () =>
    Promise.resolve({ candidates: [{ content: { parts: [{ text: jsonText }] } }] }),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requests.extractReceipt (Gemini OCR action)", () => {
  test("requires a signed-in caller", async () => {
    const t = convexTest(schema, modules);
    const storageId = await storeImage(t);
    await expect(
      t.action(api.requests.extractReceipt, { storageId })
    ).rejects.toThrow(/signed in/);
  });

  test("no-ops (no fetch) when no API key is configured", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns null fields when the file no longer exists", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const storageId = await storeImage(t);
    await t.run((ctx) => ctx.storage.delete(storageId));
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("parses amount/vendor/date out of the model's JSON", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        geminiOk(
          JSON.stringify({ amount: 42.5, vendor: "Bunnings", date: "2026-06-20" })
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: 42.5, vendor: "Bunnings", date: "2026-06-20" });
    // Sends the image inline to the Gemini endpoint with the key in the query.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("key=k");
    expect(JSON.parse(init.body).contents[0].parts[1].inline_data.mime_type).toBe(
      "image/jpeg"
    );
  });

  test("rejects implausible fields (non-number amount, blank vendor, bad date)", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          geminiOk(JSON.stringify({ amount: "lots", vendor: "   ", date: "20/06/2026" }))
        )
    );
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
  });

  test("tolerates a response with no candidates", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
  });

  test("tolerates non-JSON text from the model", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk("not json {")));
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
  });

  test("logs and returns null fields on a non-ok response", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      })
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
    expect(error).toHaveBeenCalledWith("Gemini OCR error", 500, "boom");
  });

  test("tolerates a non-ok response whose body also fails to read", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error("no body")),
      })
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
    expect(error).toHaveBeenCalledWith("Gemini OCR error", 502, "");
  });

  test("logs and returns null fields when the Gemini call throws", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
    expect(error).toHaveBeenCalledWith("Gemini OCR failed", expect.any(Error));
  });

  test("returns null fields when the response body fails to parse", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("bad json")),
      })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const storageId = await storeImage(t);
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
  });

  test("skips OCR (no fetch) for a non-image, non-PDF blob", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["#!/bin/sh"], { type: "text/plain" }))
    );
    const result = await asUser(t).action(api.requests.extractReceipt, { storageId });
    expect(result).toEqual({ amount: null, vendor: null, date: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Direct helper tests — run in the plain test runtime (not inside an action), so
// their coverage is registered consistently across OSes/runtimes.
describe("receipt-field helpers", () => {
  test("bytesToBase64 encodes small and multi-chunk inputs", () => {
    expect(bytesToBase64(new Uint8Array([0x66, 0x61, 0x6b, 0x65]))).toBe("ZmFrZQ==");
    // Larger than one 0x8000 chunk, to exercise the loop's second iteration.
    const big = new Uint8Array(0x8000 + 5).fill(65);
    expect(atob(bytesToBase64(big)).length).toBe(big.length);
  });

  test("parseReceiptFields keeps valid fields (trimming the vendor)", () => {
    expect(
      parseReceiptFields(
        JSON.stringify({ amount: 42.5, vendor: "  Bunnings  ", date: "2026-06-20" })
      )
    ).toEqual({ amount: 42.5, vendor: "Bunnings", date: "2026-06-20" });
  });

  test("parseReceiptFields rejects implausible / unreadable fields", () => {
    expect(
      parseReceiptFields(
        JSON.stringify({ amount: "lots", vendor: "   ", date: "20/06/2026" })
      )
    ).toEqual({ amount: null, vendor: null, date: null });
    expect(
      parseReceiptFields(JSON.stringify({ amount: -3, vendor: 7, date: 0 }))
    ).toEqual({ amount: null, vendor: null, date: null });
  });

  test("parseReceiptFields tolerates non-strings and bad JSON", () => {
    expect(parseReceiptFields(undefined)).toEqual({
      amount: null,
      vendor: null,
      date: null,
    });
    expect(parseReceiptFields("not json {")).toEqual({
      amount: null,
      vendor: null,
      date: null,
    });
  });
});
