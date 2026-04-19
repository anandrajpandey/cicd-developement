'use client';

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import type { AppRouter } from './router';

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});
