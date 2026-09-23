import { test } from "node:test";
import assert from "node:assert/strict";

test("Shopee: API không hỗ trợ shopType thì tự bỏ trường và gọi lại", async () => {
  process.env.SHOPEE_APP_ID = "1";
  process.env.SHOPEE_SECRET = "s";
  process.env.SHOPEE_KEYWORDS = "tai nghe";
  const bodies: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: { body: string }) => {
    bodies.push(init.body);
    const hasShop = init.body.includes("shopType");
    return new Response(
      JSON.stringify(
        hasShop
          ? { errors: [{ message: 'Cannot query field "shopType" on type "ProductOfferV2"' }] }
          : { data: { productOfferV2: { nodes: [{ itemId: 5, productName: "Tai nghe", priceMin: "100000", offerLink: "https://s.shopee.vn/a" }], pageInfo: { hasNextPage: false } } } },
      ),
    );
  }) as unknown as typeof fetch;
  try {
    const { shopeeAdapter } = await import("./shopee");
    const items = await shopeeAdapter.fetchProducts!();
    assert.equal(items.length, 1);
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].includes("shopType") && !bodies[1].includes("shopType"));
    await shopeeAdapter.fetchProducts!(); // lần sau không thử lại trường lỗi
    assert.equal(bodies.length, 3);
  } finally {
    globalThis.fetch = orig;
  }
});
