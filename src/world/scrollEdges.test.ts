import { expect, test } from "vitest";
import { scrollEdges } from "./scrollEdges";

test("no shade when everything fits or nothing is laid out yet", () => {
  expect(scrollEdges({ offset: 0, content: 80, viewport: 95 }, 6)).toEqual({ above: false, below: false });
  expect(scrollEdges({ offset: 0, content: 99, viewport: 95 }, 6)).toEqual({ above: false, below: false });
  expect(scrollEdges({ offset: 0, content: 300, viewport: 0 }, 6)).toEqual({ above: false, below: false });
});

test("a shade over the top at the newest lines, over the bottom at the oldest, both in between", () => {
  expect(scrollEdges({ offset: 205, content: 300, viewport: 95 }, 6)).toEqual({ above: true, below: false });
  expect(scrollEdges({ offset: 0, content: 300, viewport: 95 }, 6)).toEqual({ above: false, below: true });
  expect(scrollEdges({ offset: 100, content: 300, viewport: 95 }, 6)).toEqual({ above: true, below: true });
});

test("a few pixels from either end counts as the end", () => {
  expect(scrollEdges({ offset: 4, content: 300, viewport: 95 }, 6)).toEqual({ above: false, below: true });
  expect(scrollEdges({ offset: 201, content: 300, viewport: 95 }, 6)).toEqual({ above: true, below: false });
});
