export async function createTrpcContext() {
  return {};
}

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;
