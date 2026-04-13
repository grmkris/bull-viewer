import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
      <h1>Host app</h1>
      <p>
        Pretend this is your Next.js app. The bull-viewer dashboard is mounted
        as a route group and gated by the host&apos;s session.
      </p>
      <p>
        <Link href="/admin/queues">→ open queues dashboard</Link>
      </p>
    </main>
  );
}
