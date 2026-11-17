import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

// localStorage persistence is disabled for now — it was caching queries across
// reloads and masking data changed outside the app. If it is ever re-enabled it
// MUST be per User: pass `buster: <user id>` (or key the storage by user id),
// otherwise one User's cached data is shown to the next User who signs in on
// the same browser. `syncIdentity` (lib/identity.ts) only clears the in-memory
// cache. To re-enable, restore:
//   import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
//   import { persistQueryClient } from '@tanstack/react-query-persist-client'
//   const persister = createAsyncStoragePersister({ storage: localStorage })
//   persistQueryClient({ queryClient, persister })
