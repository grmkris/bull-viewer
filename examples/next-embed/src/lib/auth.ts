// Pretend session: flip `isAdmin` to false to test the gating.
export interface Session {
  user: { id: string; name: string; email: string; isAdmin: boolean };
}

export async function auth(): Promise<Session | null> {
  return {
    user: {
      id: "1",
      name: "Demo Admin",
      email: "admin@example.com",
      isAdmin: true,
    },
  };
}
