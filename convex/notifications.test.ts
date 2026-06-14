/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
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

  test("logs but swallows a non-ok Resend response", async () => {
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
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await t.action(internal.emails.send, {
      to: "x@sow.org.au",
      subject: "S",
      body: "B",
    });
    expect(result).toBeNull();
    expect(error).toHaveBeenCalledWith("Resend error", 422, "bad request");
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
});
