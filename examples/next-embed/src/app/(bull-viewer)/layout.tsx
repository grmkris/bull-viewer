import { QueuesLayout } from "@grmkris/bull-viewer-next";

export default function BullViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <QueuesLayout>{children}</QueuesLayout>;
}
