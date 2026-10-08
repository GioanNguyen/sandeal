/** Search Console: khi Google báo "Invalid JWT Signature", web nói rõ khoá sai ở đâu */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnoseKey, gscConfig, gscRows } from "./gsc";

// Khoá & chứng chỉ tự tạo chỉ để kiểm thử (không phải khoá thật)
const KEY_A = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3Ef7k+Xtq+jUb\nuxhSKcpbi3ggxQkR5+KtWSDCfJgNpRR27IJCDc1af3mAfKC4BRsmBwzI5horKmx0\nx6L8UOXqaMj2c2Afq7tPSU3vzQotiRK4iQZK5tNwP3NRHu6fsspmpTCK1nPhLMwD\nTyH9hNhAL8N6LpKLqkL3n6N9IY2p4xdgnLdRjlF0nq9DWsRFqO9gQwyo8OeQbKvH\naowewWOVOreH5NlbhkTlYqwp/NmdoaZfkL8MYLIcw5QgwkAFdWduH3kg2YJMc6MX\nl+VvAsjdq3ZeiPvKQhA7Pip/qf7qdre+O7qPKwTat8H5PIZXZwHjwJuAg1x9rUGd\ndAbQSdtTAgMBAAECggEAHlW1imSKnlXacf9lDsxM8zFflPKBR73IUlgX9RInMe+e\nPfx/swlNc0b3L6K3EPcLohf99tYmFOwBL7Ka37tZ9acqUagZj/XpYkBv0SIFIzl4\n6CoQaF3qQEnLRnBdMwoxvqN1sTPK3M+K+KtmovcdzDj956OK9eifEyAZO5VRP4qR\nIavipyOzJmsOAzmNDhmeA2+b3HAi9250kuC+gJBsTFsLz5lrhlWu4OiKBF70fLfC\n7Zfn+zie09MO+6xyRk9u44UY40SLYsf5F/m+gEuR9RzEoSHUx8wDObSSUp6vEMN2\nzoeU8yz5AS8KA32Rn42whUQ3fYDvHDiyV2o/fD3rVQKBgQDsbIqzCQ9rGJCuy/jS\nzmsB9ZvCSJVrpBV1DfZGK+M5G49R9vbEIbb7e0d7vQVRd09QfzRVeqQ+Tj912qZ5\n7RasmBcblRlQJY539kk7wR0vWmN6p3GFEps9rkrLCZaqfVm6KfY/YYRcCSGuwpGn\nZ3Vgj//ReSAfm1hUPQWic1mLVwKBgQDGOoU24kJtF9C/MhLz19rtKvdFAB4Efx/9\n8GKwovdSi1F1aoXWJeWPG7yo7OcarjgJEIOyR54cmLwubaG1sYxCC3yWKWD3PrtN\n5xh0kQdvFmBmaacN0pbx6RH4l6H4fVHOWWL49lM3M3Cuq6OMagmCO/wtaTJ/CldR\nigx3/Q3uZQKBgQDAQBMZOwjaoYMlYJ/ZbBj/4uThu3wlp6v7H3tf3FhNG+gTUquf\nGXteTAT4zeABOu+4GXhI+g2MzLw17bLp+q0xdAt2VmvbDG8phZBPkt1UoD+8gWSC\nPXsXUR9os0ddI8lO5MhlCbtDy/kjzvv6ENsVxoLTp5dDnGLbPTPTwdDSyQKBgHW3\ntPqF3Rq6BN42F2k1a65iUJtqWWkkMVR1V7Y74RHk6EgJLVeiA7Q7rYrHvOpsQZyo\ncP0DaNLkpQQRWPH0cS2bcq4d/pZ1a3f03+IBal++8xp+bZVY1Qjt9x0gtzBBA769\n+HeOmJZ0dttT1HkDU4hCpRw2l6U39+jVSVhML+S9AoGBALtRzIWVFdHpXK1Jw4vJ\nbwUvYJPVHI7Gqi4JCFwAgOjnj3k5kd3zzXjslXcrqcSECNKSRoHJ6FbscX2KOaOE\nHGxCvTaoW2nLZzv5F6YRGUrkgbxXphrV2KyJ8hg0q5pTX9BqfaIt2O8/Dulqw53Z\naU0Mch6oYEPYgJn4WQsMhWPi\n-----END PRIVATE KEY-----\n";
const CERT_A = "-----BEGIN CERTIFICATE-----\nMIIDAzCCAeugAwIBAgIUexFLRAU7t872uVxmYl7tSZUGusowDQYJKoZIhvcNAQEL\nBQAwETEPMA0GA1UEAwwGdGVzdC1hMB4XDTI2MTAwODAzNTIzMVoXDTM2MTAwNTAz\nNTIzMVowETEPMA0GA1UEAwwGdGVzdC1hMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\nMIIBCgKCAQEAtxH+5Pl7avo1G7sYUinKW4t4IMUJEefirVkgwnyYDaUUduyCQg3N\nWn95gHyguAUbJgcMyOYaKypsdMei/FDl6mjI9nNgH6u7T0lN780KLYkSuIkGSubT\ncD9zUR7un7LKZqUwitZz4SzMA08h/YTYQC/Dei6Si6pC95+jfSGNqeMXYJy3UY5R\ndJ6vQ1rERajvYEMMqPDnkGyrx2qMHsFjlTq3h+TZW4ZE5WKsKfzZnaGmX5C/DGCy\nHMOUIMJABXVnbh95INmCTHOjF5flbwLI3at2Xoj7ykIQOz4qf6n+6na3vju6jysE\n2rfB+TyGV2cB48CbgINcfa1BnXQG0EnbUwIDAQABo1MwUTAdBgNVHQ4EFgQUb+3q\nzjrbvcxXDMAdjxlyuiXNegUwHwYDVR0jBBgwFoAUb+3qzjrbvcxXDMAdjxlyuiXN\negUwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEACGBv0wD1GTTX\nPn76FFhL4FzDbTg6L43hE5jKQkur0NFFARP2pmTBlP0IJGaqYBe6UuQvHvjqbl5M\nRiS0lcfjKlb4CtoFbu0ZAi/Fz3mQqUYkkByBcfZihfyEKqu0Pl+yCXc+YmIMLK+t\nAoPxfyR/Vp7vJkUZRW4qSPNy1whqhT687wSkm9A9qtD0xaBRpavpYI5y9aX8p2QJ\ngU8SuHXGJ8hWkildUu342OZlKVz6k4ppSqKYFAMKhIV1nvq60BKIIbcd705q+l4S\nDuMLUdQ2uIwM4NO7qgqFrEI9XRoxYn3WJEZ/zrVUpSX8PONrk869ITCSe0cVq3hM\nvytgc+cIBg==\n-----END CERTIFICATE-----\n";
const CERT_B = "-----BEGIN CERTIFICATE-----\nMIIDAzCCAeugAwIBAgIUaezZeEMNeUWbJUaQ6hlv2KylHuQwDQYJKoZIhvcNAQEL\nBQAwETEPMA0GA1UEAwwGdGVzdC1iMB4XDTI2MTAwODAzNTIzMVoXDTM2MTAwNTAz\nNTIzMVowETEPMA0GA1UEAwwGdGVzdC1iMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\nMIIBCgKCAQEApQe0y918Lz4xeI18C//r6Cu1CyAHI9I0EU+xpZEakTUfPdUk81+B\nCc1Et8Wnox+fVlZg8gRHdIlbRlyy07qTJG3OMpfB81ivfR7oJhoPhT316LTQHkKD\ngSWchDhfa51w7b/V6AUUzhAEsN4FetVPn7NaT4NdkjjFzANgaP+ksO6Nzs0JaztZ\nj4lYxICvuqx0BuO68arudx0E8kZ+HwExivpEP+PR5o7HJdd52A4kEFDQjai6hu4a\n2byAIRWXnSKg5+w0MM/TljTsTPjn7N+QrU6MrLtfORVAn2xNYA13/phPDIkuKDSH\nYhP+OaaGcvw4zPaBThcQollAAKqotU6DBwIDAQABo1MwUTAdBgNVHQ4EFgQUyqna\nl13XDC5KcPky/r9snNl6mDowHwYDVR0jBBgwFoAUyqnal13XDC5KcPky/r9snNl6\nmDowDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAarE0r3xbePYb\n9bTjt09EE0DdututieBpR+zcZ98l5pjAoq7rVIJeqivOXia5dP24T7ja/O8lqEtO\nnBtcpz4So1Gaaa/zy2JHFrJ6FzLC5rpcM/IiS0Zk4FsWkZamaSfBamw05D6IXqey\n7VAxS6ewMlEggztH3g7rcXzPpcb51V0/4mbZGcCSzSecZk+vidqKOYlOdWq3gmN4\npGygy2L+M0VGEkj8mk9RglibNX0JYrOIVys1gPDMvxWPQX98uxZuiZ7xmgD7yzUk\neDuFi77CkTB27QRZOLA5ILBQnmBJHLdKzDGwl+aoOT3YBVUm8Bq1KUuGNKJkPwlX\n4bZwEmG1iw==\n-----END CERTIFICATE-----\n";
const EMAIL = "san-deal@du-an.iam.gserviceaccount.com";
const cfg = { site: "sc-domain:sandealgiare.com", email: EMAIL, key: KEY_A };

const fake = (certs: Record<string, string> | null) =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }), { status: 400 });
    if (u.includes("/metadata/x509/")) return certs ? new Response(JSON.stringify(certs), { status: 200 }) : new Response("{}", { status: 404 });
    return new Response("{}", { status: 500 });
  }) as typeof fetch;

test("đọc khoá trong .env: \\n thành xuống dòng", () => {
  const c = gscConfig({ GSC_SITE: "sc-domain:x.com", GSC_CLIENT_EMAIL: EMAIL, GSC_PRIVATE_KEY: KEY_A.replace(/\n/g, "\\n") });
  assert.equal(c?.key, KEY_A.trim());
});

test("khoá không thuộc tài khoản / đã bị xoá: nói rõ; khoá khớp: không đổ lỗi cho khoá", async () => {
  assert.match((await diagnoseKey(cfg, fake({ k1: CERT_B })))!, /không thuộc .* hoặc đã bị xoá/);
  assert.equal(await diagnoseKey(cfg, fake({ k1: CERT_B, k2: CERT_A })), null);
  assert.match((await diagnoseKey(cfg, fake(null)))!, /không có tài khoản dịch vụ/);
  assert.match((await diagnoseKey(cfg, fake({})))!, /không còn khoá nào/);
  assert.match((await diagnoseKey({ ...cfg, key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }, fake({})))!, /không đọc được/);
});

test("lỗi đăng nhập kèm lời giải thích", async () => {
  const env = { GSC_SITE: process.env.GSC_SITE, GSC_CLIENT_EMAIL: process.env.GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY: process.env.GSC_PRIVATE_KEY };
  Object.assign(process.env, { GSC_SITE: cfg.site, GSC_CLIENT_EMAIL: EMAIL, GSC_PRIVATE_KEY: KEY_A });
  try {
    await assert.rejects(gscRows(28, { fetchImpl: fake({ k1: CERT_B }), fresh: true }), /Invalid JWT Signature.*không thuộc/);
  } finally {
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
