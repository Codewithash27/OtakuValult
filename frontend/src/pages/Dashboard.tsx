import { useQuery } from '@tanstack/react-query'
import { useSession } from '../hooks/useSession'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { HealthResponse } from '../types'

export default function Dashboard() {
  const { user, signOut } = useSession()
  const navigate = useNavigate()
  const { data: health } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health'),
  })

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                MediaShelf
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {user?.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="mt-4 md:mt-0 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* API Health */}
        {health && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              API Status
            </h2>
            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-4 rounded">
              <p className="font-semibold">{health.service}</p>
              <p>Status: {health.status}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
