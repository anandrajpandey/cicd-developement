import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createTrpcContext } from '../../../../lib/trpc/context';
import { appRouter } from '../../../../lib/trpc/router';

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: createTrpcContext,
  });

export { handler as GET, handler as POST };
