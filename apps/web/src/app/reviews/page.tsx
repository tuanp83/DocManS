import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ProposalReviewsWorkspace } from "@/components/reviews/proposal-reviews-workspace";

export default function ReviewsPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Đánh giá hồ sơ" }]} />
      <PageHeader
        eyebrow="Hội đồng & Thẩm định"
        title="Đánh giá hồ sơ đề tài"
        description="Theo dõi tiến độ đánh giá, phân công hội đồng khoa học và tổng hợp nhận xét biên bản họp."
      />
      <ProposalReviewsWorkspace />
    </>
  );
}
