import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the API runtime. Set it explicitly before starting apps/api.");
  }

  return databaseUrl;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: getDatabaseUrl(),
        // pg mặc định 10 kết nối. Khi quá tải, yêu cầu xếp hàng chờ kết nối tối đa 10s rồi báo lỗi,
        // thay vì chờ vô hạn.
        max: readPositiveInt(process.env.DB_POOL_MAX, 15),
        connectionTimeoutMillis: 10_000,
        // Chặn truy vấn treo và giao dịch bị bỏ dở giữ kết nối/khoá vô thời hạn (chỉ áp dụng cho API,
        // không ảnh hưởng migrate hay pg_dump).
        statement_timeout: 30_000,
        idle_in_transaction_session_timeout: 60_000
      }),
      // Giao dịch tương tác chờ lấy kết nối tối đa 10s (mặc định 2s), nên đợt cao điểm ngắn chỉ tăng độ trễ.
      transactionOptions: { maxWait: 10_000 }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
