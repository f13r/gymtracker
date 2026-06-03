import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

// localStorage persistence is disabled for now — it was caching queries across
// reloads and masking data changed outside the app. To re-enable, restore:
//   import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
//   import { persistQueryClient } from '@tanstack/react-query-persist-client'
//   const persister = createAsyncStoragePersister({ storage: localStorage })
//   persistQueryClient({ queryClient, persister })
