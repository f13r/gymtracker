import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startActing, stopActing, useActingStore } from './acting.store'

const inna = { id: 'inna', displayName: 'Inna' }

describe('acting store', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    useActingStore.setState({ athlete: null })
    queryClient = new QueryClient()
    queryClient.setQueryData(['profile'], { trainingDays: ['monday'] })
  })

  it('startActing and stopActing each clear the query cache', () => {
    startActing(queryClient, inna)
    expect(useActingStore.getState().athlete).toEqual(inna)
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()

    queryClient.setQueryData(['profile'], { trainingDays: ['friday'] })
    stopActing(queryClient)
    expect(useActingStore.getState().athlete).toBeNull()
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
  })

  it('cancels in-flight queries before clearing the cache', () => {
    const order: string[] = []
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(() => {
      order.push('cancel')
      return Promise.resolve()
    })
    vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      order.push('clear')
    })
    startActing(queryClient, inna)
    stopActing(queryClient)
    expect(order).toEqual(['cancel', 'clear', 'cancel', 'clear'])
  })

  it('state is kept in sessionStorage, not localStorage', () => {
    startActing(queryClient, inna)
    expect(JSON.parse(sessionStorage.getItem('gymtracker-acting') ?? '{}').state.athlete).toEqual(inna)
    expect(localStorage.getItem('gymtracker-acting')).toBeNull()
  })
})
