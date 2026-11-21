import test from "node:test";
import assert from "node:assert/strict";
import { QODER_SITE_HOST } from "../web/extractor.js";

test("extractor：Qoder Sites 主机识别覆盖 .qoder.zone 与 .qoder.website", () => {
  assert.equal(QODER_SITE_HOST.test("personal-economy-1lf6s0zo1kb.qoder.zone"), true);
  assert.equal(QODER_SITE_HOST.test("example.qoder.website"), true);
  assert.equal(QODER_SITE_HOST.test("localhost"), false);
  assert.equal(QODER_SITE_HOST.test("notqoder.zone"), false);
});
