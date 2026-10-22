import { Suspense } from "react";
import { ProposalsWorkspace } from "@/components/research-proposals/proposals-workspace";

export default function ProposalsPage() {
  return (
    <Suspense>
      <ProposalsWorkspace />
    </Suspense>
  );
}
