import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function moduleFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? moduleFiles(path) : path.endsWith(".module.ts") ? [path] : [];
  });
}

test("only PrismaModule provides PrismaService, so the API keeps a single connection pool", () => {
  const offenders = moduleFiles("apps/api/src")
    .filter((path) => !path.endsWith("infrastructure/prisma/prisma.module.ts"))
    .filter((path) => {
      // Được phép: import, chú thích kiểu (prisma: PrismaService) và inject của useFactory. Còn lại là khai báo provider.
      const declared = readFileSync(path, "utf8")
        .replace(/^import .*$/gm, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/inject:\s*\[[^\]]*\]/g, "")
        .replace(/:\s*PrismaService\b/g, "");
      return /\bPrismaService\b/.test(declared);
    });
  assert.deepEqual(offenders, []);
  assert.match(readFileSync("apps/api/src/infrastructure/prisma/prisma.module.ts", "utf8"), /@Global\(\)/);
  assert.match(readFileSync("apps/api/src/app.module.ts", "utf8"), /imports:\s*\[\s*PrismaModule/);
});
