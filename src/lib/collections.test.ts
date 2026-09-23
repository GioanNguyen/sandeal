import { test } from "node:test";
import assert from "node:assert/strict";
import { activeCollections, COLLECTIONS, isInSeason } from "./collections";

test("bộ sưu tập theo mùa", () => {
  const c2010 = COLLECTIONS.find((c) => c.slug === "qua-tang-20-10")!;
  assert.equal(isInSeason(c2010, new Date("2026-09-23T03:00:00Z")), true);
  assert.equal(isInSeason(c2010, new Date("2026-10-21T03:00:00Z")), false);
  const slugs = activeCollections(new Date("2026-09-23T03:00:00Z")).map((c) => c.slug);
  assert.equal(slugs[0], "qua-tang-20-10"); // bộ theo mùa lên đầu
  assert.ok(!slugs.includes("chuan-bi-11-11"));
  assert.ok(activeCollections(new Date("2026-11-01T03:00:00Z")).some((c) => c.slug === "chuan-bi-11-11"));
});
