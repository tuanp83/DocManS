import type { WorkflowStatus } from "@rtms/contracts";
import type { UserRole } from "@/fixtures/shell-context";

export type Proposal = {
  id: string;
  code: string;
  title: string;
  unit: string;
  owner: string;
  intakePeriod: string;
  status: WorkflowStatus;
  submittedAt: string;
  dueDate: string;
};

export type Task = {
  id: string;
  title: string;
  linkedRecord: string;
  assignee: string;
  priority: "high" | "medium" | "low";
  status: WorkflowStatus;
  dueDate: string;
};

export type DashboardKpi = {
  label: string;
  value: string;
  meta: string;
  tone?: "default" | "warning" | "danger" | "info";
};

export type DashboardTableRow = {
  code: string;
  title: string;
  meta: string;
  unit: string;
  status: WorkflowStatus;
  dueDate: string;
  href: string;
};

export type DashboardListItem = {
  title: string;
  meta: string;
};

export type DashboardBar = {
  label: string;
  height: string;
};

export type DashboardPanel =
  | {
      variant: "table";
      title: string;
      subtitle: string;
      actionLabel?: string;
      actionHref?: string;
      rows: DashboardTableRow[];
    }
  | {
      variant: "list";
      title: string;
      subtitle: string;
      actionLabel?: string;
      actionHref?: string;
      items: DashboardListItem[];
    }
  | {
      variant: "chart";
      title: string;
      subtitle: string;
      bars: DashboardBar[];
    };

export type DashboardSnapshot = {
  eyebrow: string;
  title: string;
  description: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  kpis: DashboardKpi[];
  panels: [DashboardPanel, DashboardPanel, DashboardPanel, DashboardPanel];
};

export const proposals: Proposal[] = [
  {
    id: "prop-seed-001",
    code: "HVQY-2026-NC01",
    title: "Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não",
    unit: "Khoa Toán - Tin học",
    owner: "TS. Phạm Anh Tuấn",
    intakePeriod: "Đợt 1/2026",
    status: "in-review",
    submittedAt: "22/04/2026",
    dueDate: "30/04/2026"
  },
  {
    id: "prop-seed-002",
    code: "BQP-2026-Y03",
    title: "Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội",
    unit: "Bệnh viện Quân y 103",
    owner: "TS. Phạm Anh Tuấn",
    intakePeriod: "Đợt 1/2026",
    status: "in-review",
    submittedAt: "20/04/2026",
    dueDate: "28/04/2026"
  },
  {
    id: "hvqy-2026-021",
    code: "HVQY-2026-021",
    title: "Nghiên cứu chỉ số sinh học trong chẩn đoán sớm tổn thương thận cấp",
    unit: "Bộ môn Sinh lý bệnh",
    owner: "ThS. Lê Quốc Huy",
    intakePeriod: "Đợt 1/2026",
    status: "needs-supplement",
    submittedAt: "18/04/2026",
    dueDate: "27/04/2026"
  },
  {
    id: "hvqy-2026-032",
    code: "HVQY-2026-032",
    title: "Tối ưu quy trình huấn luyện cấp cứu chiến thuật",
    unit: "Trung tâm Huấn luyện kỹ năng y khoa",
    owner: "Đại tá, TS. Phạm Anh Tuấn",
    intakePeriod: "Đợt 2/2026",
    status: "submitted",
    submittedAt: "25/04/2026",
    dueDate: "05/05/2026"
  }
];

export const tasks: Task[] = [
  {
    id: "T-1024",
    title: "Rà soát hồ sơ chờ phê duyệt HVQY-2026-001",
    linkedRecord: "HVQY-2026-001",
    assignee: "Phòng Quản lý khoa học",
    priority: "high",
    status: "pending-approval",
    dueDate: "Hôm nay"
  },
  {
    id: "T-1025",
    title: "Nhắc reviewer hoàn tất đánh giá đề tài nhiễm khuẩn",
    linkedRecord: "HVQY-2026-014",
    assignee: "CN. Vũ Lan",
    priority: "medium",
    status: "overdue",
    dueDate: "Quá hạn 1 ngày"
  },
  {
    id: "T-1026",
    title: "Kiểm tra minh chứng bổ sung của đề tài thận cấp",
    linkedRecord: "HVQY-2026-021",
    assignee: "ThS. Hoàng Mai",
    priority: "medium",
    status: "needs-supplement",
    dueDate: "27/04/2026"
  },
  {
    id: "T-1027",
    title: "Chuẩn bị báo cáo tổng hợp đợt 1/2026",
    linkedRecord: "Báo cáo điều hành",
    assignee: "Phòng Quản lý khoa học",
    priority: "low",
    status: "draft",
    dueDate: "03/05/2026"
  }
];

export const timeline = [
  {
    title: "Hồ sơ được nộp chính thức",
    meta: "TS. Nguyễn Minh Đức - 22/04/2026 09:12",
    status: "submitted"
  },
  {
    title: "Chuyên viên kiểm tra tính đầy đủ",
    meta: "CN. Vũ Lan - 23/04/2026 14:30",
    status: "completed"
  },
  {
    title: "Hoàn tất tổng hợp ý kiến đánh giá",
    meta: "Phòng Quản lý khoa học - 25/04/2026 16:10",
    status: "completed"
  },
  {
    title: "Chờ lãnh đạo phê duyệt",
    meta: "Trạng thái hiện tại - hạn xử lý 30/04/2026",
    status: "pending-approval"
  }
];

export const submittedFiles = [
  {
    name: "Thuyet-minh-de-cuong-HVQY-2026-001.pdf",
    meta: "PDF - 2.4 MB - TS. Nguyễn Minh Đức - 22/04/2026"
  },
  {
    name: "Du-toan-kinh-phi.xlsx",
    meta: "Excel - 418 KB - TS. Nguyễn Minh Đức - 22/04/2026"
  },
  {
    name: "Ly-lich-khoa-hoc-chu-nhiem.pdf",
    meta: "PDF - 860 KB - TS. Nguyễn Minh Đức - 22/04/2026"
  }
];

export function getProposalById(id: string) {
  return proposals.find((proposal) => proposal.id === id) ?? null;
}

export function getDashboardSnapshot(role: UserRole): DashboardSnapshot {
  switch (role) {
    case "SCIENTIFIC_MANAGEMENT_STAFF":
      return {
        eyebrow: "Điều hành nghiệp vụ",
        title: "Dashboard chuyên viên quản lý khoa học",
        description: "Tổng hợp các hồ sơ mới nộp, hồ sơ cần kiểm tra và tiến độ thẩm định trong phạm vi đơn vị quản lý.",
        primaryActionLabel: "Mở danh sách hồ sơ",
        primaryActionHref: "/proposals",
        kpis: [
          { label: "Hồ sơ mới nộp", value: "14", meta: "5 hồ sơ phát sinh trong 48 giờ qua", tone: "info" },
          { label: "Hồ sơ cần kiểm tra", value: "09", meta: "Cần rà soát thành phần và điều kiện nộp", tone: "warning" },
          { label: "Hồ sơ đang đánh giá", value: "18", meta: "Đã phân công reviewer và hội đồng", tone: "default" },
          { label: "Reviewer chưa hoàn thành", value: "06", meta: "3 phân công sắp đến hạn", tone: "danger" }
        ],
        panels: [
          {
            variant: "table",
            title: "Hồ sơ cần kiểm tra",
            subtitle: "Sắp xếp theo hạn xử lý và tình trạng thành phần",
            actionLabel: "Xem toàn bộ",
            actionHref: "/proposals",
            rows: proposals.map((proposal) => ({
              code: proposal.code,
              title: proposal.title,
              meta: proposal.owner,
              unit: proposal.unit,
              status: proposal.status,
              dueDate: proposal.dueDate,
              href: `/proposals/${proposal.id}`
            }))
          },
          {
            variant: "list",
            title: "Cảnh báo thẩm định",
            subtitle: "Theo dõi các mục cần nhắc việc và tổng hợp",
            items: [
              { title: "Hội đồng Kiểm soát nhiễm khuẩn chưa nộp đủ biên bản", meta: "Hạn tổng hợp 29/04/2026" },
              { title: "Hồ sơ HVQY-2026-021 đang chờ bổ sung tài liệu bắt buộc", meta: "Đơn vị chủ trì đã được thông báo" },
              { title: "Báo cáo tổng hợp đợt 1/2026 cần chốt trước 03/05/2026", meta: "Phòng Quản lý khoa học phụ trách" }
            ]
          },
          {
            variant: "chart",
            title: "Tình hình theo đơn vị",
            subtitle: "Số lượng hồ sơ đang xử lý theo đơn vị chuyên môn",
            bars: [
              { label: "Chấn thương", height: "148px" },
              { label: "Nội khoa", height: "112px" },
              { label: "Cận lâm sàng", height: "136px" },
              { label: "Sinh học", height: "94px" },
              { label: "QLKH", height: "168px" }
            ]
          },
          {
            variant: "list",
            title: "Báo cáo sắp đến hạn",
            subtitle: "Các mốc cần nhắc việc trong 7 ngày tới",
            actionLabel: "Mở báo cáo",
            actionHref: "/reports",
            items: [
              { title: "Tổng hợp đợt tiếp nhận 1/2026", meta: "Hạn 03/05/2026 - Phòng Quản lý khoa học" },
              { title: "Danh sách hội đồng cần xác nhận lịch họp", meta: "Hạn 30/04/2026 - 4 phiên cần đối chiếu" },
              { title: "Báo cáo công tác tuần", meta: "Hạn 02/05/2026 - Chuyên viên tổng hợp" }
            ]
          }
        ]
      };
    case "RESEARCHER_INTERNAL_USER":
      return {
        eyebrow: "Công việc cá nhân",
        title: "Dashboard nhà nghiên cứu khoa học",
        description: "Tổng hợp nhiệm vụ nghiên cứu khoa học và công nghệ, hồ sơ đề xuất, lời mời phản biện và báo cáo định kỳ.",
        primaryActionLabel: "Được mời phản biện",
        primaryActionHref: "/invitation-to-review",
        kpis: [
          { label: "Được mời phản biện", value: "02", meta: "02 hồ sơ đang chờ đánh giá", tone: "warning" },
          { label: "Nhiệm vụ KH&CN", value: "04", meta: "02 đề tài đang thực hiện", tone: "default" },
          { label: "Hồ sơ của tôi", value: "06", meta: "04 đã nộp, 02 đang chuẩn bị", tone: "info" },
          { label: "Báo cáo cần nộp", value: "02", meta: "Một mốc đến hạn trong 5 ngày tới", tone: "danger" }
        ],
        panels: [
          {
            variant: "table",
            title: "Được mời phản biện",
            subtitle: "Hồ sơ đề tài bạn được mời tham gia đánh giá, phản biện",
            actionLabel: "Vào đánh giá",
            actionHref: "/invitation-to-review",
            rows: [
              {
                code: "HVQY-2026-NC02",
                title: "Nghiên cứu ứng dụng kỹ thuật giải trình tự gen thế hệ mới trong chẩn đoán sớm bệnh lý tim mạch di truyền",
                meta: "Vai trò: Phản biện độc lập",
                unit: "Khoa Tim mạch",
                status: "in-review",
                dueDate: "2026-09-30",
                href: "/invitation-to-review"
              },
              {
                code: "BQP-2026-Y03",
                title: "Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội",
                meta: "Vai trò: Thành viên Hội đồng",
                unit: "Bệnh viện Quân y 103",
                status: "in-review",
                dueDate: "2026-10-15",
                href: "/invitation-to-review"
              }
            ]
          },
          {
            variant: "table",
            title: "Hồ sơ của tôi",
            subtitle: "Theo dõi tình trạng tiếp nhận, thẩm định và bổ sung",
            actionLabel: "Xem hồ sơ",
            actionHref: "/my-proposals",
            rows: proposals.slice(0, 3).map((proposal) => ({
              code: proposal.code,
              title: proposal.title,
              meta: `Chủ nhiệm: ${proposal.owner}`,
              unit: proposal.intakePeriod,
              status: proposal.status,
              dueDate: proposal.dueDate,
              href: `/proposals/${proposal.id}`
            }))
          },
          {
            variant: "list",
            title: "Nhiệm vụ của tôi",
            subtitle: "Nhiệm vụ ưu tiên cần xử lý",
            actionLabel: "Mở nhiệm vụ",
            actionHref: "/my-tasks",
            items: [
              { title: "Đánh giá hồ sơ đề tài HVQY-2026-NC02", meta: "Hạn 30/09/2026 - Mức ưu tiên cao" },
              { title: "Hoàn thiện dự toán kinh phí đề tài thận cấp", meta: "Hạn 29/04/2026 - Mức ưu tiên cao" },
              { title: "Cập nhật biên bản họp nhóm nghiên cứu", meta: "Hạn 30/04/2026 - Trung tâm Huấn luyện kỹ năng y khoa" },
              { title: "Rà soát tài liệu bổ sung đề tài chấn thương", meta: "Hạn 02/05/2026 - Cần đối chiếu với Phòng QLKH" }
            ]
          },
          {
            variant: "chart",
            title: "Tiến độ đề tài",
            subtitle: "Mức độ hoàn thành theo nhóm công việc",
            bars: [
              { label: "Nội dung", height: "158px" },
              { label: "Nhân sự", height: "126px" },
              { label: "Kinh phí", height: "92px" },
              { label: "Báo cáo", height: "118px" },
              { label: "Minh chứng", height: "146px" }
            ]
          }
        ]
      };
    case "EXTERNAL_RESEARCHER_USER":
      return {
        eyebrow: "Công việc chuyên gia",
        title: "Dashboard nhà khoa học & chuyên gia",
        description: "Tổng hợp các nhiệm vụ nghiên cứu khoa học và công nghệ, lời mời phản biện và lý lịch khoa học cá nhân.",
        primaryActionLabel: "Xem hồ sơ được mời phản biện",
        primaryActionHref: "/invitation-to-review",
        kpis: [
          { label: "Được mời phản biện", value: "02", meta: "02 hồ sơ đang chờ gửi phiếu đánh giá", tone: "warning" },
          { label: "Nhiệm vụ tham gia", value: "03", meta: "Đang tham gia phối hợp nghiên cứu", tone: "info" },
          { label: "Đánh giá đã hoàn tất", value: "05", meta: "Đã nộp phiếu nhận xét chuyên môn", tone: "default" },
          { label: "Thông báo mới", value: "03", meta: "Nhắc việc và phân công phản biện", tone: "danger" }
        ],
        panels: [
          {
            variant: "table",
            title: "Được mời phản biện",
            subtitle: "Hồ sơ chuyên gia được phân công đánh giá",
            actionLabel: "Vào đánh giá",
            actionHref: "/invitation-to-review",
            rows: [
              {
                code: "HVQY-2026-NC02",
                title: "Nghiên cứu ứng dụng kỹ thuật giải trình tự gen thế hệ mới trong chẩn đoán sớm bệnh lý tim mạch di truyền",
                meta: "Vai trò: Phản biện độc lập",
                unit: "Khoa Tim mạch",
                status: "in-review",
                dueDate: "2026-09-30",
                href: "/invitation-to-review"
              },
              {
                code: "BQP-2026-Y03",
                title: "Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội",
                meta: "Vai trò: Thành viên Hội đồng",
                unit: "Bệnh viện Quân y 103",
                status: "in-review",
                dueDate: "2026-10-15",
                href: "/invitation-to-review"
              }
            ]
          },
          {
            variant: "list",
            title: "Nhiệm vụ của tôi",
            subtitle: "Nhiệm vụ ưu tiên cần xử lý",
            actionLabel: "Mở nhiệm vụ",
            actionHref: "/my-tasks",
            items: [
              { title: "Đánh giá hồ sơ đề tài HVQY-2026-NC02", meta: "Hạn 30/09/2026 - Mức ưu tiên cao" },
              { title: "Gửi nhận xét phản biện đề tài BQP-2026-Y03", meta: "Hạn 15/10/2026 - Ban Quản lý KHQS" },
              { title: "Cập nhật thông tin lý lịch khoa học năm 2026", meta: "Hoàn thiện hồ sơ chuyên gia" }
            ]
          },
          {
            variant: "chart",
            title: "Hoạt động phản biện",
            subtitle: "Số lượng hồ sơ đã tham gia đánh giá theo đợt",
            bars: [
              { label: "Đợt 1/2025", height: "90px" },
              { label: "Đợt 2/2025", height: "135px" },
              { label: "Đợt 3/2025", height: "160px" },
              { label: "Đợt 1/2026", height: "120px" },
              { label: "Hiện tại", height: "145px" }
            ]
          },
          {
            variant: "list",
            title: "Thông báo & Nhắc việc",
            subtitle: "Các cập nhật liên quan đến lời mời phản biện",
            actionLabel: "Xem tất cả",
            actionHref: "/notifications",
            items: [
              { title: "Mời phản biện đề tài gen tim mạch", meta: "Hạn 30/09/2026 - Mới phân công" },
              { title: "Phiên họp hội đồng nghiệm thu đề tài ghép tạng", meta: "Dự kiến 20/10/2026 tại Phòng Hội thảo" },
              { title: "Nhắc cập nhật lý lịch khoa học định kỳ", meta: "Đã xác nhận dữ liệu đợt 1" }
            ]
          }
        ]
      };
    case "SYSTEM_ADMIN":
      return {
        eyebrow: "Quản trị hệ thống",
        title: "Dashboard quản trị hệ thống",
        description: "Tổng hợp tài khoản, vai trò, đơn vị và các điểm cần cấu hình trong hệ thống vận hành nội bộ.",
        primaryActionLabel: "Mở quản lý người dùng",
        primaryActionHref: "/users",
        kpis: [
          { label: "Tổng số người dùng", value: "128", meta: "Phân bổ trên 18 đơn vị", tone: "default" },
          { label: "Tài khoản đang hoạt động", value: "121", meta: "07 tài khoản tạm ngưng", tone: "info" },
          { label: "Vai trò hệ thống", value: "09", meta: "Bao gồm vai trò nghiệp vụ và quản trị", tone: "warning" },
          { label: "Danh mục cần cấu hình", value: "05", meta: "Cần đối chiếu trước đợt tiếp nhận mới", tone: "danger" }
        ],
        panels: [
          {
            variant: "list",
            title: "Người dùng và vai trò",
            subtitle: "Tổng hợp tài khoản cần theo dõi",
            actionLabel: "Mở danh sách người dùng",
            actionHref: "/users",
            items: [
              { title: "07 tài khoản cần cập nhật đơn vị công tác", meta: "Liên quan đến thay đổi nhân sự tháng 04/2026" },
              { title: "03 tài khoản cần đối chiếu quyền truy cập báo cáo", meta: "Thuộc nhóm lãnh đạo và văn phòng tổng hợp" },
              { title: "02 tài khoản mới chưa kích hoạt", meta: "Chờ xác nhận hồ sơ từ Trung tâm CNTT" }
            ]
          },
          {
            variant: "list",
            title: "Danh mục và cấu hình",
            subtitle: "Các nội dung cần rà soát trước kỳ vận hành mới",
            actionLabel: "Mở cấu hình hệ thống",
            actionHref: "/system-settings",
            items: [
              { title: "Cần bổ sung danh mục lĩnh vực nghiên cứu năm 2026", meta: "Phục vụ đợt tiếp nhận mới" },
              { title: "Mẫu thông báo nhắc hạn cần cập nhật nội dung", meta: "Chờ phê duyệt văn bản" },
              { title: "Thông tin đơn vị vừa điều chỉnh cơ cấu", meta: "Cần đồng bộ trước khi cấp quyền" }
            ]
          },
          {
            variant: "chart",
            title: "Phân bổ theo đơn vị",
            subtitle: "Số lượng tài khoản đang hoạt động theo nhóm đơn vị",
            bars: [
              { label: "BGH", height: "104px" },
              { label: "QLKH", height: "166px" },
              { label: "Khoa", height: "152px" },
              { label: "Hội đồng", height: "118px" },
              { label: "CNTT", height: "86px" }
            ]
          },
          {
            variant: "list",
            title: "Nhật ký hệ thống",
            subtitle: "Các mục cần kiểm tra trong 24 giờ qua",
            actionLabel: "Mở nhật ký",
            actionHref: "/system-logs",
            items: [
              { title: "Đã ghi nhận 18 phiên đăng nhập thành công", meta: "Không có cảnh báo bất thường" },
              { title: "02 tài khoản bị từ chối do sai thông tin đăng nhập", meta: "Cần đối chiếu nếu lặp lại nhiều lần" },
              { title: "01 cấu hình thông báo đã được cập nhật", meta: "Thực hiện bởi KS. Nguyễn Quốc Bảo" }
            ]
          }
        ]
      };
    case "LEADERSHIP_APPROVAL_AUTHORITY":
    default:
      return {
        eyebrow: "Điều hành",
        title: "Dashboard lãnh đạo",
        description: "Tổng hợp hồ sơ chờ phê duyệt, đề tài chậm tiến độ, việc quá hạn và báo cáo tổng hợp trong phạm vi Học viện Quân y.",
        primaryActionLabel: "Mở hồ sơ chờ phê duyệt",
        primaryActionHref: "/approvals",
        kpis: [
          { label: "Hồ sơ chờ phê duyệt", value: "08", meta: "3 hồ sơ cần xử lý trong hôm nay", tone: "warning" },
          { label: "Đề tài chậm tiến độ", value: "03", meta: "01 đề tài cần can thiệp trực tiếp", tone: "info" },
          { label: "Việc quá hạn", value: "05", meta: "2 nhiệm vụ thuộc Phòng Quản lý khoa học", tone: "danger" },
          { label: "Báo cáo tổng hợp", value: "12", meta: "7 ngày tới có 12 đầu mục cần theo dõi", tone: "default" }
        ],
        panels: [
          {
            variant: "table",
            title: "Hồ sơ chờ phê duyệt",
            subtitle: "Ưu tiên theo hạn xử lý và kết quả thẩm định hiện có",
            actionLabel: "Xem toàn bộ",
            actionHref: "/approvals",
            rows: proposals.slice(0, 3).map((proposal) => ({
              code: proposal.code,
              title: proposal.title,
              meta: proposal.owner,
              unit: proposal.unit,
              status: proposal.status,
              dueDate: proposal.dueDate,
              href: `/proposals/${proposal.id}`
            }))
          },
          {
            variant: "list",
            title: "Cảnh báo ưu tiên",
            subtitle: "Các tín hiệu cần xử lý hoặc cần theo dõi sát",
            items: [
              { title: "Reviewer quá hạn đánh giá hồ sơ HVQY-2026-014", meta: "Quá hạn 1 ngày - cần nhắc xử lý" },
              { title: "Hồ sơ HVQY-2026-001 đang chờ quyết định phê duyệt", meta: "Hạn xử lý 30/04/2026" },
              { title: "Báo cáo tiến độ quý II sắp đến hạn", meta: "12 báo cáo cần theo dõi trong 7 ngày tới" }
            ]
          },
          {
            variant: "chart",
            title: "Tình hình theo đơn vị",
            subtitle: "Tổng hợp hồ sơ và đầu mục cần xử lý theo đơn vị",
            bars: [
              { label: "Ngoại khoa", height: "150px" },
              { label: "Nội khoa", height: "112px" },
              { label: "Cận lâm sàng", height: "136px" },
              { label: "Sinh học", height: "84px" },
              { label: "QLKH", height: "168px" }
            ]
          },
          {
            variant: "list",
            title: "Công việc quá hạn",
            subtitle: "Nhiệm vụ cần can thiệp trong phạm vi điều hành",
            actionLabel: "Mở giao việc",
            actionHref: "/tasks",
            items: tasks.slice(0, 3).map((task) => ({
              title: task.title,
              meta: `${task.assignee} - ${task.dueDate}`
            }))
          }
        ]
      };
  }
}
