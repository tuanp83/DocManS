# Triển khai và vận hành DocManS trên máy chủ

Tài liệu dành cho cán bộ CNTT triển khai và vận hành DocManS tại Học viện. Gồm hai phần: **đánh giá mức sẵn sàng**
(việc gì phải xong trước khi mở cho người dùng) và **quy trình từng bước** từ chuẩn bị máy chủ tới vận hành hằng
ngày, cập nhật phiên bản, sao lưu và xử lý sự cố.

Đối chiếu mã nguồn tại nhánh `DocMan3` ngày 17/10/2026 (đã chạy thử toàn bộ stack production và diễn tập khôi phục). Mọi lệnh chạy trong thư mục cài đặt (mặc định `/opt/docmans`).

---

## Phần A. Đánh giá mức sẵn sàng

### A1. Đã sẵn sàng

| Hạng mục | Hiện trạng |
|---|---|
| Đóng gói | Một image cho 3 vai trò (migrate, api, web), Node 24, chạy bằng người dùng không phải root. |
| Bí mật | Mọi mật khẩu bắt buộc khai trong `.env.production`; thiếu là `docker compose` dừng ngay, không có mật khẩu mặc định. |
| Mạng | Chỉ nginx mở cổng 80/443; PostgreSQL, MinIO, API, web nằm trong mạng nội bộ của Docker. |
| TLS | HTTPS bắt buộc (80 chuyển 443), TLS 1.2/1.3, HSTS; hỗ trợ chứng chỉ CA nội bộ hoặc Let's Encrypt (tự gia hạn). |
| Bảo vệ | Giới hạn tần suất đăng nhập và API ở nginx; khoá theo số lần sai ở API; chặn nhúng trang (clickjacking). |
| Khởi tạo | Lần đầu chỉ tạo **một** tài khoản quản trị (bắt buộc đổi mật khẩu), không tạo tài khoản mẫu. |
| Cập nhật | Migration chạy tự động trước khi API khởi động; seed các lần sau **không ghi đè** dữ liệu quản trị đã chỉnh. |
| Ổn định | Healthcheck mọi service, khởi động theo thứ tự phụ thuộc, giới hạn RAM/CPU, xoay vòng log (≈100 MB/service). |
| Sao lưu | `scripts/backup.sh` (PostgreSQL + tệp MinIO, checksum, giữ 30 ngày) và `scripts/restore.sh`. |
| Nhật ký | Nhật ký kiểm toán cho đăng nhập, mật khẩu, tài khoản, tệp, tờ trình, phê duyệt; xem ở **Quản trị → Nhật ký hệ thống**. |

### A2. Phải xong trước khi mở cho người dùng

| # | Việc | Cách làm |
|---|---|---|
| 1 | **Kiểm tra phạm vi đơn vị** của lãnh đạo. Ban giám đốc (Giám đốc/Phó Giám đốc, Phó GĐ phụ trách Khoa học, Phó GĐ theo dõi), Trưởng phòng KHQS và Trưởng ban QLKH **tự động có phạm vi toàn Học viện** (cấp khi tạo tài khoản, đổi vai trò, thêm hoặc kích hoạt đơn vị; migration cấp bù cho tài khoản đã có). Phó phòng và chuyên viên QLKH chỉ **xem** hồ sơ nhà khoa học toàn Học viện; hồ sơ, đề tài của họ vẫn theo đơn vị được gán. | Sau triển khai chạy `scripts/unit-scopes.sh list <tài khoản>` kiểm tra một tài khoản mỗi vai trò. Cần phạm vi nhiều đơn vị cho vai trò khác (vd. chuyên viên phụ trách nhiều khoa): `scripts/unit-scopes.sh grant` (bước C5). |
| 2 | Có **máy chủ SMTP** gửi được thư (kích hoạt tài khoản nhà khoa học, đặt lại mật khẩu, thông báo). | Khai `SMTP_*` (bước B4), thử ở bước C6. |
| 3 | Có **image MinIO** đã kiểm thử. MinIO đã ngừng phát hành image công khai; file image không nằm trong git. | Chép `minio-RELEASE.2025-09-07T16-13-09Z-amd64.tar.gz` lên máy chủ và nạp (bước B3). |
| 4 | Có **chứng chỉ TLS** cho tên miền. | CA nội bộ chép vào `nginx/ssl/` hoặc Let's Encrypt (bước B5). |
| 5 | **Sao lưu ra ngoài máy chủ** và **diễn tập khôi phục** một lần. | Bước E. |
| 6 | **Nhập dữ liệu thật**: đơn vị, tài khoản lãnh đạo và cán bộ QLKH, hồ sơ nhà khoa học, đợt tiếp nhận. | Bước C. |
| 7 | **Chạy thử nghiệm thu** một luồng đầy đủ bằng tài khoản thật của từng vai trò. | Bước C7. |

### A3. Rủi ro đã biết, cần biện pháp vận hành cho tới khi sửa trong mã nguồn

| Rủi ro | Biện pháp tạm thời |
|---|---|
| Quản trị **đặt lại mật khẩu** thì thấy mã một lần trên màn hình. | Chỉ giao mã qua kênh đã được phê duyệt; mỗi lần đặt lại có trong Nhật ký hệ thống, định kỳ rà soát. |
| Văn bản khoa học nháp hoặc hết hiệu lực vẫn mở được nếu biết đường dẫn trực tiếp. | Không tải văn bản mật lên mục Văn bản & Biểu mẫu. |
| Chưa có CSRF token riêng, chưa có Content-Security-Policy đầy đủ. | Chỉ phục vụ trong mạng nội bộ của Học viện; không dùng chung tên miền gốc với hệ thống khác do người ngoài quản lý. |
| Một máy chủ duy nhất (không dự phòng nóng). | Sao lưu hằng ngày ra máy khác; mục tiêu khôi phục: mất tối đa 24 giờ dữ liệu, dựng lại trong 1 ngày làm việc. |
| Chưa có hệ thống giám sát tập trung. | Cron kiểm tra sức khoẻ và gửi cảnh báo (bước D2). |

### A4. Đã gia cố trong đợt rà soát này

- Seed production chỉ **thêm dữ liệu nền còn thiếu**, không ghi đè tên đơn vị, trạng thái đơn vị, danh mục, thời gian phiên đăng nhập và mẫu thông báo mà quản trị đã chỉnh (có kiểm thử trên PostgreSQL thật: `tests/seed-production-db.test.mjs`).
- nginx **ghi đè** `X-Forwarded-For` bằng địa chỉ kết nối thật, nên người dùng trong mạng nội bộ không tự đặt được IP để vượt giới hạn đăng nhập hay làm sai IP trong nhật ký; thêm `X-Frame-Options: DENY`, `frame-ancestors 'none'`, ẩn phiên bản nginx.
- Thêm `scripts/unit-scopes.sh` để xem, cấp, gỡ phạm vi đơn vị (có nhật ký kiểm toán).
- Vai trò lãnh đạo toàn Học viện tự có mọi đơn vị đang hoạt động; Phó phòng và chuyên viên xem được hồ sơ nhà khoa học mọi đơn vị (chỉ đọc, không sửa ngoài phạm vi).
- Đổi đơn vị chính của người dùng trên giao diện nay **gỡ phạm vi đơn vị chính cũ** (trước đây giữ lại, người chuyển công tác vẫn xem được dữ liệu đơn vị cũ).

---

## Phần B. Chuẩn bị máy chủ

### B1. Cấu hình tối thiểu

| Thành phần | Yêu cầu |
|---|---|
| CPU / RAM | 4 vCPU, 8 GB RAM (giới hạn các service cộng lại khoảng 6 GB). |
| Ổ đĩa | 100 GB SSD cho hệ thống và dữ liệu; tăng theo dung lượng tệp đính kèm (mỗi tệp tối đa 10 MB). |
| Hệ điều hành | Ubuntu Server 22.04 hoặc 24.04 LTS (x86_64 / amd64, vì image MinIO là bản amd64). |
| Phần mềm | Docker Engine 24 trở lên, Docker Compose v2 (`docker compose`), git, openssl, cron. |
| Mạng | Tên miền nội bộ (vd. `docmans.hvqy.edu.vn`) trỏ về máy chủ; tường lửa chỉ mở 80, 443 và SSH từ mạng quản trị. |
| Thư | Tài khoản SMTP của Học viện để gửi thư. |
| Sao lưu | Một máy hoặc ổ khác để chép bản sao lưu hằng ngày. |

### B2. Cài Docker và lấy mã nguồn

```bash
# Docker Engine + Compose v2 theo hướng dẫn chính thức của Docker cho Ubuntu, sau đó:
sudo usermod -aG docker $USER            # đăng xuất, đăng nhập lại để có quyền docker
sudo mkdir -p /opt/docmans && sudo chown $USER /opt/docmans
git clone https://github.com/tuanp83/DocManS.git /opt/docmans
cd /opt/docmans
git checkout <thẻ phiên bản phát hành>    # vd. v1.0.0; không triển khai thẳng từ nhánh đang phát triển
```

### B3. Nạp image MinIO

```bash
# Chép file từ máy đang có image (./scripts/minio-image.sh export) lên máy chủ, rồi:
./scripts/minio-image.sh load minio-RELEASE.2025-09-07T16-13-09Z-amd64.tar.gz
./scripts/minio-image.sh verify          # phải báo đúng bản đã kiểm thử
```

Nếu Học viện có registry nội bộ: `./scripts/minio-image.sh push <registry>` một lần, rồi khai `MINIO_IMAGE` trong `.env.production`.

### B4. Khai cấu hình `.env.production`

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -base64 32                  # tạo mật khẩu ngẫu nhiên cho từng mục bên dưới
```

| Biến | Giá trị |
|---|---|
| `PUBLIC_URL`, `SERVER_NAME` | Địa chỉ người dùng mở, vd. `https://docmans.hvqy.edu.vn` và `docmans.hvqy.edu.vn`. |
| `APP_VERSION` | Trùng thẻ phiên bản đang triển khai, vd. `1.0.0` (dùng để quay lại bản cũ). |
| `POSTGRES_PASSWORD` | Chuỗi ngẫu nhiên. |
| `MINIO_ROOT_PASSWORD`, `MINIO_APP_SECRET_KEY` | Hai chuỗi ngẫu nhiên **khác nhau**; `MINIO_APP_ACCESS_KEY` khác `MINIO_ROOT_USER`. |
| `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD` | Tài khoản quản trị đầu tiên; mật khẩu ≥ 12 ký tự, có chữ hoa, chữ thường, chữ số. **Xoá dòng mật khẩu sau lần triển khai đầu.** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Thông tin máy chủ thư. |
| `SMTP_REQUIRE_TLS` | Giữ `true` (bắt buộc STARTTLS). Chỉ đặt `false` khi máy chủ chuyển tiếp thư nội bộ không hỗ trợ STARTTLS (log API báo `STARTTLS ... not implemented`). |
| `DEADLINE_REMINDERS_ENABLED`, `HEALTH_SNAPSHOTS_ENABLED` | Giữ `true`: nhắc hạn 07:00 và chụp sức khoẻ đề tài 23:55 Chủ nhật (giờ Việt Nam). |

**Không bao giờ** đặt `NODE_ENV` khác `production` cho bản triển khai: ngoài production, seed tạo 17 tài khoản mẫu mật khẩu `1234`. File `docker-compose.prod.yml` đã cố định `NODE_ENV=production`; chỉ dùng file này trên máy chủ, không dùng `docker-compose.yml` (bản phát triển).

### B5. Chứng chỉ TLS

- **CA nội bộ** (tên miền chỉ dùng trong mạng Học viện): chép `fullchain.pem` và `privkey.pem` vào `nginx/ssl/` (`chmod 600 nginx/ssl/privkey.pem`). nginx tự nhận chứng chỉ mới trong vòng 6 giờ sau khi chép đè.
- **Let's Encrypt** (tên miền truy cập được từ Internet, cổng 80 mở): khai `LETSENCRYPT_EMAIL`, sau bước C1 chạy `./scripts/letsencrypt-init.sh`; gia hạn tự động.

---

## Phần C. Triển khai lần đầu và khởi tạo dữ liệu

### C1. Khởi động

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet   # kiểm tra cấu hình
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f migrate   # chờ "đã tạo tài khoản quản trị"
docker compose -f docker-compose.prod.yml --env-file .env.production ps               # mọi service "healthy", migrate "exited (0)"
```

Đặt bí danh cho gọn (dùng ở các bước sau): `alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'`.

Kiểm tra: `curl -k https://<SERVER_NAME>/api/v1/health/ready` trả `200` (cơ sở dữ liệu và kho tệp đều `up`); trình duyệt mở `https://<SERVER_NAME>/login`.

### C2. Đăng nhập quản trị lần đầu

1. Đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD`, đổi mật khẩu ngay (hệ thống bắt buộc).
2. Xoá giá trị `ADMIN_INITIAL_PASSWORD` trong `.env.production` (seed các lần sau không dùng tới).
3. **Quản trị → Cấu hình hệ thống**: chỉnh thời gian phiên đăng nhập, mẫu thông báo theo quy định của Học viện.

### C3. Đơn vị và danh mục

1. **Quản trị → Đơn vị**: đối chiếu danh sách đơn vị nạp sẵn (84 đơn vị) với cơ cấu thực tế; đổi tên, thêm, ngừng hoạt động đơn vị không còn. Các lần cập nhật phiên bản sau giữ nguyên những chỉnh sửa này.
2. **Quản trị → Danh mục**: rà lĩnh vực nghiên cứu, cấp đề tài, học hàm, học vị.

### C4. Tài khoản

Tạo tài khoản ở **Quản trị → Người dùng** (mỗi tài khoản: vai trò + một đơn vị chính; người dùng phải đổi mật khẩu khi đăng nhập lần đầu).

| Vai trò | Số lượng thường gặp | Đơn vị chính | Phạm vi cần cấp thêm (C5) |
|---|---|---|---|
| Giám đốc | 1 | Ban Giám đốc | tự động toàn Học viện |
| Phó GĐ phụ trách Khoa học | 1 | Ban Giám đốc | tự động toàn Học viện |
| Các Phó GĐ khác (theo dõi) | theo thực tế | Ban Giám đốc | tự động toàn Học viện |
| Trưởng phòng KHQS | 1 | Phòng KHQS | tự động toàn Học viện |
| Phó phòng KHQS | theo thực tế | Phòng KHQS | không (chỉ xem hồ sơ nhà khoa học toàn Học viện; đề tài theo phạm vi được gán) |
| Trưởng ban QLKH | 1 | Phòng KHQS | tự động toàn Học viện |
| Chuyên viên QLKH | theo thực tế | Phòng KHQS | các đơn vị chuyên viên được giao (xem hồ sơ nhà khoa học toàn Học viện) |
| Quản trị hệ thống | 1–2 | đơn vị công tác | không |

Nhà nghiên cứu (nội bộ, bên ngoài) **không tạo ở đây**: chuyên viên QLKH tạo **Hồ sơ nhà khoa học**, hệ thống tự tạo tài khoản và gửi thư kích hoạt (cần SMTP). Lãnh đạo và cán bộ QLKH cũng có lý lịch khoa học: tự kê khai ở menu **Lý lịch khoa học**; tên hiển thị tự thêm quân hàm, học hàm, học vị theo lý lịch.

### C5. Cấp phạm vi nhiều đơn vị

Chỉ cần cho vai trò **không** tự động toàn Học viện (chuyên viên QLKH, Phó phòng phụ trách nhiều đơn vị).

```bash
./scripts/unit-scopes.sh grant <tài khoản> all          # toàn Học viện
./scripts/unit-scopes.sh grant <tài khoản> KHQS K1 K2   # chỉ một số đơn vị
./scripts/unit-scopes.sh list  <tài khoản>              # kiểm tra
./scripts/unit-scopes.sh revoke <tài khoản> K2          # gỡ (không gỡ được đơn vị chính)
```

Có hiệu lực ngay, không cần người dùng đăng nhập lại. Mỗi lần chạy ghi một dòng vào Nhật ký hệ thống (`grant-unit-scopes` / `revoke-unit-scopes`).

### C6. Kiểm tra thư

Tạo một hồ sơ nhà khoa học thử có cấp tài khoản, với email của cán bộ CNTT. Thư kích hoạt phải tới trong vài phút. Nếu không: `dc logs api | grep -iE "thư kích hoạt|mail"` (lỗi gửi được ghi kèm nguyên nhân), kiểm tra `SMTP_*` và `SMTP_REQUIRE_TLS`, tường lửa ra cổng 587/465. Sau khi xong, ngừng hoạt động hồ sơ thử (hệ thống không xoá hẳn hồ sơ).

### C7. Chạy thử nghiệm thu trước khi mở

Dùng tài khoản thật của từng vai trò, đi một luồng đầy đủ trên một hồ sơ thử:

1. Chuyên viên tạo đợt tiếp nhận; nhà nghiên cứu tạo và nộp đề xuất (kèm tệp).
2. Trưởng ban kiểm tra đầy đủ; giao chuyên viên phụ trách; phân công phản biện, lập hội đồng; tờ trình đi Trưởng phòng → Ban giám đốc ký.
3. Phản biện chấm phiếu; tổng hợp, chốt, trình; Giám đốc phê duyệt; tải văn bản Word và kiểm tra **tên người ký đúng**.
4. Lập đề tài; Trưởng phòng hoặc Trưởng ban giao chuyên viên phụ trách; cập nhật kinh phí, tải chứng từ.
5. Kiểm tra Dashboard của từng vai trò, Nhật ký hệ thống của Quản trị.

Xoá hoặc đánh dấu dữ liệu thử theo quy định trước khi mở chính thức.

---

## Phần D. Vận hành hằng ngày

### D1. Lịch tự động (cron của người dùng triển khai)

```cron
# Sao lưu 01:30 hằng ngày, sau đó chép ra máy khác
30 1 * * * cd /opt/docmans && ./scripts/backup.sh >> /var/log/docmans-backup.log 2>&1 && rsync -a --delete backups/ backup-host:/srv/docmans-backups/
# Cảnh báo chứng chỉ sắp hết hạn (< 21 ngày)
0 8 * * * cd /opt/docmans && ./scripts/check-cert-expiry.sh >> /var/log/docmans-cert.log 2>&1
# Kiểm tra sức khoẻ 5 phút một lần (/health/ready kiểm tra cả cơ sở dữ liệu lẫn kho tệp MinIO;
# /health chỉ kiểm tra cơ sở dữ liệu nên KHÔNG phát hiện được kho tệp sập)
*/5 * * * * curl -fsS --max-time 10 https://<SERVER_NAME>/api/v1/health/ready > /dev/null || echo "DocManS không phản hồi $(date)" | mail -s "DocManS cảnh báo" it@hvqy.edu.vn
```

### D2. Theo dõi

| Việc | Lệnh / nơi xem | Tần suất |
|---|---|---|
| Trạng thái service | `dc ps` (mọi service `healthy`) | hằng ngày |
| Lỗi API | `dc logs --since 24h api \| grep -E '"level":"error"\|ERROR'` (log request dạng JSON; tác vụ định kỳ và gửi thư ghi dạng chữ có `ERROR`) | hằng ngày |
| Dung lượng đĩa | `df -h /var/lib/docker /opt/docmans` (cảnh báo khi > 80%) | hằng tuần |
| Sao lưu | `tail /var/log/docmans-backup.log`, có thư mục mới trong `backups/` và trên máy sao lưu | hằng ngày |
| Hoạt động bất thường | Quản trị → Nhật ký hệ thống: lọc "Thất bại", đăng nhập sai nhiều, đặt lại mật khẩu | hằng tuần |
| Phạm vi tài khoản | `./scripts/unit-scopes.sh list <tài khoản>` với người vừa đổi đơn vị, nghỉ, chuyển công tác | khi có thay đổi nhân sự |

Mỗi request API có mã `X-Request-Id` (trình duyệt nhận trong header phản hồi). Cùng mã đó có trong log nginx (`request_id=...`) và log lỗi của API: `dc logs nginx | grep <mã>`, `dc logs api | grep <mã>`.

### D3. Thay đổi nhân sự

- **Chuyển đơn vị**: đổi đơn vị chính trên giao diện; hệ thống tự gỡ phạm vi của đơn vị chính cũ. Các đơn vị phụ đã cấp bằng `unit-scopes.sh` được giữ, nếu không còn phụ trách thì `unit-scopes.sh revoke`.
- **Nghỉ, chuyển công tác**: khoá tài khoản (Quản trị → Người dùng → trạng thái); trước đó Trưởng phòng hoặc Trưởng ban giao lại hồ sơ, đề tài đang phụ trách cho chuyên viên khác.
- **Đổi vai trò** (vd. bổ nhiệm Trưởng ban): đổi vai trò trên giao diện, có hiệu lực ở thao tác kế tiếp; kiểm tra lại phạm vi.

---

## Phần E. Sao lưu và khôi phục

- `./scripts/backup.sh` lưu `backups/<YYYYMMDD_HHMMSS>/` gồm `postgres.dump`, `minio-data.tar.gz`, `SHA256SUMS`; tự xoá bản cũ hơn 30 ngày (`RETENTION_DAYS`).
- Bản sao lưu **phải** được chép ra máy hoặc ổ khác: sao lưu nằm cùng máy không cứu được khi hỏng ổ hay mất máy.
- Khôi phục: `./scripts/restore.sh backups/<thư mục>`. Script kiểm tra checksum, hỏi xác nhận, **tự sao lưu dữ liệu hiện tại** (thư mục mới trong `backups/`, để quay lại nếu chọn nhầm bản), xoá và dựng lại toàn bộ schema từ bản sao lưu trong một giao dịch (an toàn cả khi quay về phiên bản cũ hơn), giải nén tệp MinIO ra thư mục tạm rồi mới thay, sau đó khởi động lại. Mất khoảng 1 phút với dữ liệu nhỏ. Khôi phục trên máy mới hoặc khi dữ liệu hiện tại đã hỏng: `SKIP_SAFETY_BACKUP=1 ./scripts/restore.sh ...`. Sau khi khôi phục: đăng nhập, mở một hồ sơ, tải một tệp.
- **Diễn tập khôi phục** trên một máy thử trước khi mở chính thức và 6 tháng một lần.

---

## Phần F. Cập nhật phiên bản

Migration cơ sở dữ liệu **chỉ đi một chiều**: quay lại bản cũ nghĩa là khôi phục bản sao lưu chụp ngay trước khi cập nhật.

```bash
cd /opt/docmans
./scripts/backup.sh                                     # 1. sao lưu ngay trước khi cập nhật
docker tag docmans-app:$(grep ^APP_VERSION .env.production | cut -d= -f2) docmans-app:rollback   # 2. giữ image cũ
git fetch --tags && git checkout <thẻ phiên bản mới>    # 3. lấy mã nguồn mới
sed -i 's/^APP_VERSION=.*/APP_VERSION=<phiên bản mới>/' .env.production
dc build                                                 # 4. build trước để rút ngắn thời gian gián đoạn
dc up -d                                                 # 5. migrate chạy trước, rồi api, web, nginx
dc logs --tail 50 migrate && dc ps                       # 6. migrate "exited (0)", các service healthy
dc restart nginx                                         # 7. nạp cấu hình nginx mới (template chỉ được đọc khi nginx khởi động)
```

Gián đoạn thường dưới 1 phút. Nên cập nhật ngoài giờ làm việc và báo trước cho người dùng.

**Quay lại khi cập nhật lỗi**: `git checkout <thẻ cũ>`, đặt lại `APP_VERSION` cũ, `./scripts/restore.sh backups/<bản chụp ở bước 1>` (khôi phục cả dữ liệu lẫn khởi động lại bằng image cũ).

---

## Phần G. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `migrate` thoát mã khác 0, API không khởi động | Migration lỗi, hoặc thiếu/sai `ADMIN_INITIAL_PASSWORD` ở lần đầu | `dc logs migrate`; sửa `.env.production`, `dc up -d`. Migration lỗi giữa chừng: khôi phục bản sao lưu trước cập nhật. |
| `minio` không lên, báo không tìm thấy image | Chưa nạp image MinIO | Bước B3. |
| Trang báo lỗi chứng chỉ | Chứng chỉ hết hạn hoặc sai tên miền | `./scripts/check-cert-expiry.sh`; thay chứng chỉ ở `nginx/ssl/`, `dc exec nginx nginx -s reload`. |
| Người dùng không nhận được thư kích hoạt | SMTP sai, bị chặn, hoặc máy chủ thư không hỗ trợ STARTTLS | `dc logs api \| grep -iE "thư kích hoạt\|mail"`; kiểm tra `SMTP_*`; lỗi `STARTTLS ... not implemented` thì đặt `SMTP_REQUIRE_TLS=false`, `dc up -d api`. Chuyên viên có thể **gửi lại thư kích hoạt** trên hồ sơ nhà khoa học. |
| Lãnh đạo, chuyên viên báo "không thấy hồ sơ của khoa X" | Thiếu phạm vi đơn vị | `./scripts/unit-scopes.sh list <tài khoản>`, cấp thêm (C5). |
| Người dùng bị báo "thao tác quá nhanh" (429) | Vượt giới hạn tần suất (nhiều người chung một IP) | Tạm thời bình thường; nếu kéo dài, nâng `rate`/`burst` trong `nginx/prod/templates/default.conf.template`, `dc up -d nginx`. |
| Tải tệp báo "Kho tệp tạm thời không truy cập được" (503) | Container `minio` dừng hoặc lỗi; tệp vẫn còn | `dc ps minio`, `dc logs --tail 50 minio`; `dc up -d minio`. `/api/v1/health/ready` trở lại `200` là xong. |
| Đăng nhập sai nhiều lần bị khoá tạm | Chống dò mật khẩu (5 lần sai / 15 phút) | Chờ 15 phút, hoặc quản trị đặt lại mật khẩu. |
| Đầy ổ đĩa | Tệp đính kèm, bản sao lưu, image cũ | `docker system df`; `docker image prune` (giữ image `rollback`); giảm `RETENTION_DAYS` nếu đã có bản sao ngoài máy. |
| Hệ thống chậm | Thiếu RAM, nhiều kết nối CSDL | `docker stats`; tăng RAM máy chủ hoặc `DB_POOL_MAX` (tổng < 100). |

---

## Phần H. Nguyên tắc an toàn

- `.env.production` và `nginx/ssl/privkey.pem` chỉ chủ sở hữu đọc được (`chmod 600`), không đưa vào git hay gửi qua thư.
- Không mở trực tiếp cổng PostgreSQL (5432), MinIO (9000/9001), API (4000), web (3000) ra mạng.
- Không chạy `docker-compose.yml` (bản phát triển) hay `npm run db:setup` trên máy chủ thật: hai cách này tạo tài khoản mẫu mật khẩu `1234`.
- Cẩm nang hướng dẫn trong `apps/web/public/` có ghi mật khẩu của **môi trường thử nghiệm**; mật khẩu đó không tồn tại trên máy chủ thật nhưng nên bỏ khỏi bản phát hành để tránh hiểu nhầm.
- Rà soát Nhật ký hệ thống hằng tuần; mọi thao tác ngoài giao diện (như `unit-scopes.sh`) đều phải ghi được dấu vết.
