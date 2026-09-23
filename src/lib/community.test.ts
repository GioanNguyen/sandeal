import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SOURCES = "mock";

let c: typeof import("./community");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  c = await import("./community");
  schema = await import("@/db/schema");
});

test("chia sẻ deal, bình chọn, bảng xếp hạng", async () => {
  const [a] = await dbm.db.insert(schema.users).values({ email: "an.nguyen@test.vn", name: "An" }).returning();
  const [b] = await dbm.db.insert(schema.users).values({ email: "binh@test.vn" }).returning();
  const r = await c.shareDeal(a.id, "https://shopee.vn/x-i.1.100", "rẻ quá");
  assert.ok(r.ok && !r.existed);
  const dup = await c.shareDeal(b.id, "shopee.vn/product/1/100", "");
  assert.ok(dup.ok && dup.existed, "cùng sản phẩm không đăng 2 lần");
  assert.equal((await c.shareDeal(b.id, "https://tiki.vn/x", "")).ok, false);

  const pid = r.ok ? r.productId : 0;
  assert.deepEqual(await c.voteSummary(pid, a.id), { up: 1, down: 0, mine: 1 }); // người đăng tự +1
  assert.deepEqual(await c.castVote(b.id, pid, 1), { up: 2, down: 0, mine: 1 });
  assert.deepEqual(await c.castVote(b.id, pid, -1), { up: 1, down: 1, mine: -1 }); // đổi ý
  assert.deepEqual(await c.castVote(b.id, pid, -1), { up: 1, down: 0, mine: 0 }); // bấm lại để bỏ

  await c.castVote(b.id, pid, 1);
  const list = await c.listPosts({ sort: "hot", viewerId: b.id });
  assert.equal(list.length, 1);
  assert.equal(list[0].author, "An");
  assert.equal(list[0].mine, 1);
  const board = await c.leaderboard();
  assert.deepEqual(board[0], { id: a.id, name: "An", deals: 1, votes: 1, points: 11 }); // tự vote không tính
  assert.equal(c.displayName({ name: null, email: "binh@test.vn" }), "bin***");

  const { dealsByIds } = await import("./queries");
  const [row] = await dealsByIds([pid]);
  assert.equal(row.communityNote, "rẻ quá");
  assert.equal(row.communityUp, 2);
});
