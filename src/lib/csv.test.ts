import { describe, expect, test } from "vitest";
import { buildCsv, csvLine, escapeField } from "./csv";

describe("escapeField", () => {
  test("quotes fields containing commas, quotes or newlines", () => {
    expect(escapeField("a,b")).toBe('"a,b"');
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeField("line1\nline2")).toBe('"line1\nline2"');
  });

  test("neutralises spreadsheet formula prefixes", () => {
    expect(escapeField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeField("+1")).toBe("'+1");
    expect(escapeField("\t@cmd")).toBe("'\t@cmd");
    expect(escapeField("plain")).toBe("plain");
  });
});

describe("buildCsv", () => {
  test("joins header and rows with CRLF", () => {
    expect(buildCsv(["a", "b"], [["1", "x,y"]])).toBe('a,b\r\n1,"x,y"');
    expect(csvLine(["", "z"])).toBe(",z");
  });
});
