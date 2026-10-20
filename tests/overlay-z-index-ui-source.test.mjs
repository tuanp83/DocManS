import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lớp hiển thị: bảng trượt (drill-down Dashboard) và hộp thoại dùng chung phải nằm trên thanh menu và khung thông báo.
// Trước đây giao diện chủ đề nâng thanh menu lên 100 trong khi lớp phủ ở 60, nên thanh menu che đầu bảng chi tiết.

const STYLES = ["apps/web/src/app/globals.css", "apps/web/src/themes/hvqy1.css"];
const css = STYLES.map((path) => readFileSync(path, "utf8")).join("\n");

const scale = Object.fromEntries([...readFileSync(STYLES[0], "utf8").matchAll(/--(z-[a-z]+):\s*(\d+);/g)].map(([, name, value]) => [name, Number(value)]));

/** Mọi giá trị z-index của một bộ chọn trong các tệp CSS, đã thay biến bằng số trong thang. */
function zIndexes(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g"))]
    .map(([, body]) => /z-index:\s*([^;]+);/.exec(body)?.[1].trim())
    .filter(Boolean)
    .map((value) => {
      const variable = /^var\(--(z-[a-z]+)\)$/.exec(value);
      assert.ok(variable, `${selector} phải dùng biến trong thang lớp hiển thị, không đặt số riêng (đang là ${value})`);
      assert.ok(variable[1] in scale, `${selector} dùng biến chưa khai báo: --${variable[1]}`);
      return scale[variable[1]];
    });
}

test("thang lớp hiển thị: tooltip < thanh menu < khung thông báo < lớp phủ < hộp xác nhận", () => {
  assert.ok(scale["z-tooltip"] < scale["z-topbar"]);
  assert.ok(scale["z-topbar"] < scale["z-popover"]);
  assert.ok(scale["z-popover"] < scale["z-overlay"]);
  assert.ok(scale["z-overlay"] < scale["z-confirm"]);
});

test("bảng chi tiết Dashboard và hộp thoại dùng chung nằm trên thanh menu và khung thông báo ở mọi tệp giao diện", () => {
  const above = Math.max(...zIndexes(".topbar"), ...zIndexes(".notification-popover"), ...zIndexes(".topbar-row-main .user-menu-panel"));
  for (const overlay of [".drill-backdrop", ".modal-backdrop"]) {
    const values = zIndexes(overlay);
    assert.ok(values.length > 0, `${overlay} phải khai báo z-index`);
    for (const value of values) assert.ok(value > above, `${overlay} (${value}) phải cao hơn thanh menu và khung thông báo (${above})`);
  }
  assert.ok(Math.min(...zIndexes(".modal-backdrop:has(.confirm-message)")) > Math.max(...zIndexes(".modal-backdrop")), "hộp xác nhận nằm trên các hộp thoại khác");
});
