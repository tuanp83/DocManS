import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ReviewerQueuePanel } from "@/components/research-proposals/reviewer-queue-panel";

export default function InvitationToReviewPage() {
  return (
    <>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Được mời phản biện" }
        ]}
      />
      <PageHeader
        eyebrow="Phản biện chuyên gia"
        title="Được mời phản biện"
        description="Danh sách các đề tài, nhiệm vụ khoa học và công nghệ bạn được nhà quản lý khoa học mời tham gia phản biện và đánh giá."
      />
      <ReviewerQueuePanel />
    </>
  );
}
