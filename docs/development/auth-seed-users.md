# Development Auth Accounts

Story 1.2 uses Prisma-seeded internal accounts for local development until Story 1.3 introduces user, role, and organization management screens.

These credentials are for local development only. All seeded accounts share the password `1234`.

| Username | Password | Role | Unit |
| --- | --- | --- | --- |
| `admin` | `1234` | Quản trị hệ thống | Khoa Toán - Tin học |
| `admin2` | `1234` | Quản trị hệ thống | Khoa Toán - Tin học |
| `tvtien` | `1234` | Giám đốc Học viện (`LEADERSHIP_APPROVAL_AUTHORITY`) | Ban Giám Đốc |
| `pgiamdoc` | `1234` | Phó Giám đốc phụ trách Khoa học (`SCIENCE_DEPUTY_DIRECTOR`) | Ban Giám Đốc |
| `ttlan` | `1234` | Phó Giám đốc — chỉ theo dõi (`RESEARCH_OVERSIGHT_AUTHORITY`) | Ban Giám Đốc |
| `nmphuong` | `1234` | Trưởng phòng KHQS (`RESEARCH_MANAGEMENT_HEAD`) | Trưởng Phòng KHQS |
| `pphong` | `1234` | Phó phòng KHQS (`RESEARCH_MANAGEMENT_DEPUTY_HEAD`) | Phó phòng KHQS |
| `dmtrung` | `1234` | Trưởng ban QLKH (`RESEARCH_BOARD_HEAD`) | Trưởng Ban QLKH, Phòng KHQS |
| `hdtien1` | `1234` | Chuyên viên QLKH | Chuyên viên QLKH, Phòng KHQS |
| `patuan` | `1234` | Chủ nhiệm đề tài | Khoa Toán - Tin học |
| `hdtien2` | `1234` | Chuyên viên QLKH | Chuyên viên QLKH, Phòng KHQS |

The seed file stores precomputed `scrypt` password hashes only. Plaintext credentials are documented here for local development and are not returned through auth endpoints.

## Organization scopes

The `Unit` column above is each account's home unit. Backend authorization checks the account's
**organization scopes**, which are not always just that one unit.

The leadership and scientific-management accounts (`tvtien`, `pgiamdoc`, `ttlan`, `nmphuong`, `pphong`,
`dmtrung`, `hdtien1`, `hdtien2`) are scoped to the entire Academy (every organization unit) so they operate
intake, supplement, reviewer-assignment, project tracking, monitoring and consolidation flows across all units.
Each keeps its home unit as the primary scope (`org-bgq` for the Board of Directors, `org-khqs` for Phòng KHQS).

| Username | Organization scopes |
| --- | --- |
| `admin`, `admin2` | Toàn Học viện, primary `org-khti` |
| `tvtien`, `pgiamdoc`, `ttlan` | Toàn Học viện, primary `org-bgq` |
| `nmphuong`, `pphong`, `dmtrung`, `hdtien1`, `hdtien2` | Toàn Học viện, primary `org-khqs` |
| `patuan` | `org-khti` |

Leadership (`tvtien`) does not need a matching organization scope to read or decide a proposal:
approval authority is evaluated from the `leadership` role plus the proposal's workflow state, and
reviewers read only the proposals they were explicitly assigned to.

Local database setup:

```bash
docker compose up -d postgres
npm run db:setup
```

`docker compose up api` runs the same setup path before starting the NestJS API, so a fresh local database receives the Epic 1 auth/session/audit migration and seed users automatically.

Troubleshooting:

- If the browser reports `Failed to fetch` while calling `http://localhost:4000/api/v1/auth/me`, confirm the API container is running with `docker compose ps` and start it with `docker compose up -d api`.
- A healthy unauthenticated API should return `200` from `http://localhost:4000/api/v1/health` and `401` from `http://localhost:4000/api/v1/auth/me`.
