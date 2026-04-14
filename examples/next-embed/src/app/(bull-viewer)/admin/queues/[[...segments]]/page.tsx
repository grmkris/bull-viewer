import { QueuesPage } from "@grmkris/bull-viewer-next";

import { auth } from "@/lib/auth";

export default async function Page() {
  const session = await auth();
  if (!session?.user.isAdmin) {
    return <div style={{ padding: "2rem" }}>Forbidden</div>;
  }
  return (
    <QueuesPage
      basePath="/admin/queues"
      apiBase="/admin/queues/api"
      viewer={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      }}
      scopes={["read"]}
    />
  );
}
