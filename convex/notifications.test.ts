/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { consumeNotificationDeepLink, isAllowedDeepLink } from "../shared/deepLinks";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requestUrl } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("emails.send (Resend action)", () => {
  test("no-ops without API credentials", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await t.action(internal.emails.send, {
      to: "x@sow.org.au",
      subject: "Hi",
      body: "Body",
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  test("POSTs to Resend when configured", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@sow.org.au");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.emails.send, {
      to: "x@sow.org.au",
      subject: "Subject",
      body: "Body",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      from: "noreply@sow.org.au",
      to: ["x@sow.org.au"],
      subject: "Subject",
      text: "Body",
    });
  });

  test("throws on a non-ok Resend response so scheduled sends surface as failed", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@sow.org.au");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("bad request"),
      })
    );
    await expect(
      t.action(internal.emails.send, {
        to: "x@sow.org.au",
        subject: "S",
        body: "B",
      })
    ).rejects.toThrow(/Resend error 422/);
  });
});

describe("push.send (Expo push action)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  const seedToken = (t: ReturnType<typeof convexTest>, email: string, token: string) =>
    t.run((ctx) => ctx.db.insert("pushTokens", { email, token }));

  test("no devices registered -> no fetch", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await t.action(internal.push.send, {
      to: "nobody@sow.org.au",
      title: "T",
      body: "B",
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends one message per device and includes the deep-link url", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[1]");
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[2]");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: "ok" }, { status: "ok" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.push.send, {
      to: "a@sow.org.au",
      title: "Title",
      body: "Body",
      url: "/review",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ title: "Title", body: "Body", data: { url: "/review" } });
  });

  test("omits data when no url is given", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[1]");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: "ok" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.push.send, { to: "a@sow.org.au", title: "T", body: "B" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body[0].data).toEqual({});
  });

  test("logs and stops on a non-ok push response", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[1]");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("server error"),
      })
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await t.action(internal.push.send, {
      to: "a@sow.org.au",
      title: "T",
      body: "B",
    });
    expect(result).toBeNull();
    expect(error).toHaveBeenCalledWith("Expo push error", 500, "server error");
  });

  test("prunes tokens reported as DeviceNotRegistered, keeps the rest", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[dead]");
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[live]");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { status: "error", details: { error: "DeviceNotRegistered" } },
              { status: "ok" },
            ],
          }),
      })
    );

    await t.action(internal.push.send, { to: "a@sow.org.au", title: "T", body: "B" });

    const remaining = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(remaining.map((row) => row.token)).toEqual(["ExponentPushToken[live]"]);
  });

  test("missing data array is tolerated (no pruning)", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[1]");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    );
    await t.action(internal.push.send, { to: "a@sow.org.au", title: "T", body: "B" });
    const remaining = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(remaining).toHaveLength(1);
  });

  test("ok tickets schedule a receipt check that prunes DeviceNotRegistered", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await seedToken(t, "a@sow.org.au", "ExponentPushToken[dead]");
      await seedToken(t, "a@sow.org.au", "ExponentPushToken[live]");
      const fetchMock = vi
        .fn()
        // send: both tickets ok, with receipt ids — DeviceNotRegistered mostly
        // only surfaces in the receipt, not the ticket.
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                { status: "ok", id: "r-dead" },
                { status: "ok", id: "r-live" },
              ],
            }),
        })
        // getReceipts: the first device was uninstalled.
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                "r-dead": { status: "error", details: { error: "DeviceNotRegistered" } },
                "r-live": { status: "ok" },
              },
            }),
        });
      vi.stubGlobal("fetch", fetchMock);

      await t.action(internal.push.send, { to: "a@sow.org.au", title: "T", body: "B" });
      // The receipt check runs 15 minutes later as a scheduled action.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain("getReceipts");
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        ids: ["r-dead", "r-live"],
      });
      const remaining = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
      expect(remaining.map((row) => row.token)).toEqual(["ExponentPushToken[live]"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("checkReceipts tolerates a rejected fetch (network error)", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[1]");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // Best-effort: the scheduled action resolves instead of failing.
    await expect(
      t.action(internal.push.checkReceipts, {
        receipts: [{ id: "r1", token: "ExponentPushToken[1]" }],
      })
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith("Expo receipts fetch failed", expect.any(Error));
    const remaining = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(remaining).toHaveLength(1);
  });

  test("checkReceipts tolerates a non-ok response and missing receipts", async () => {
    const t = convexTest(schema, modules);
    await seedToken(t, "a@sow.org.au", "ExponentPushToken[1]");
    // Non-ok: logged, nothing pruned.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("boom"),
      })
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.action(internal.push.checkReceipts, {
      receipts: [{ id: "r1", token: "ExponentPushToken[1]" }],
    });
    expect(error).toHaveBeenCalledWith("Expo receipts error", 500, "boom");

    // A receipt absent from the response (still pending) is left alone.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) })
    );
    await t.action(internal.push.checkReceipts, {
      receipts: [{ id: "r1", token: "ExponentPushToken[1]" }],
    });
    const remaining = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(remaining).toHaveLength(1);
  });
});

describe("notification deep-links are followable by the push-tap handler", () => {
  // Regression guard: the push-tap handler (src/hooks/usePushRegistration.ts)
  // only navigates to URLs that pass isAllowedDeepLink. Request notifications
  // land on the `/?tab=...` home deep-link, so the allow-list must accept it —
  // otherwise tapping a request push silently routes nowhere.
  const fakeRequest = {
    _id: "req123" as Id<"requests">,
    requesterEmail: "requester@sow.org.au",
  };

  test("requestUrl shapes (Mine, Review) are allowed", () => {
    expect(isAllowedDeepLink(requestUrl(fakeRequest.requesterEmail, fakeRequest))).toBe(true);
    expect(isAllowedDeepLink(requestUrl("approver@sow.org.au", fakeRequest))).toBe(true);
    // Comment notifications' focus+thread deep link must also be followable.
    expect(
      isAllowedDeepLink(requestUrl("approver@sow.org.au", fakeRequest, { thread: true }))
    ).toBe(true);
  });

  test("static review and attendance-event URLs are allowed", () => {
    expect(isAllowedDeepLink("/?tab=review")).toBe(true);
    expect(isAllowedDeepLink("/attendance/event/evt123")).toBe(true);
  });

  test("rejects payloads outside the known route families", () => {
    expect(isAllowedDeepLink("/reviewevil")).toBe(false);
    expect(isAllowedDeepLink("https://evil.example.com")).toBe(false);
    expect(isAllowedDeepLink("/admin")).toBe(false);
  });
});

describe("consumeNotificationDeepLink (push-tap once)", () => {
  // Regression: remounting the push handler used to re-read the sticky last
  // notification response and router.push the same URL forever (SowSpinner loop).
  const response = (id: string, url: unknown) => ({
    notification: {
      request: {
        identifier: id,
        content: { data: { url } },
      },
    },
  });

  test("returns an allow-listed url once per notification id", () => {
    const handled = new Set<string>();
    expect(consumeNotificationDeepLink(response("n1", "/?tab=review"), handled)).toBe(
      "/?tab=review"
    );
    expect(consumeNotificationDeepLink(response("n1", "/?tab=review"), handled)).toBe(null);
    expect(consumeNotificationDeepLink(response("n2", "/?tab=mine"), handled)).toBe(
      "/?tab=mine"
    );
  });

  test("marks the id handled even when the url is missing or disallowed", () => {
    const handled = new Set<string>();
    expect(consumeNotificationDeepLink(response("bad", "/admin"), handled)).toBe(null);
    expect(handled.has("bad")).toBe(true);
    expect(consumeNotificationDeepLink(response("bad", "/?tab=review"), handled)).toBe(null);
  });

  test("ignores null responses", () => {
    expect(consumeNotificationDeepLink(null, new Set())).toBe(null);
  });
});
