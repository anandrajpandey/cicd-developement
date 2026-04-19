import { cache } from 'react';

import { createTrpcContext } from './context';
import { appRouter } from './router';

export const getTrpcCaller = cache(async () => {
  const context = await createTrpcContext();
  return appRouter.createCaller(context);
});
