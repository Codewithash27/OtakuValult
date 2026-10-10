import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import { HealthResponse } from '../types'

export default function Home() {
  const { data, isLoading, error } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health'),
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">MediaShelf</h1>
        
        {isLoading && (
          <p className="text-gray-600">Checking API health...</p>
        )}
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded">
            Error: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        )}
        
        {data && (
          <div className="bg-green-50 text-green-700 p-4 rounded">
            <p className="font-semibold">{data.service}</p>
            <p>Status: {data.status}</p>
          </div>
        )}
      </div>
    </div>
  )
}
