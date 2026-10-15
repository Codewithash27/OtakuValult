import React, { Component, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { AuthProvider } from './hooks/useSession'
import { ToastProvider } from './components/Toast'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Library from './pages/Library'
import Import from './pages/Import'
import AdminUsers from './pages/AdminUsers'
import Gallery from './pages/Gallery'
import CommunityLists from './pages/CommunityLists'
import NotFound from './pages/NotFound'
import TitleDetail from './pages/TitleDetail'
import { IntroSplash } from './components/IntroSplash'
import { AuthShell } from './components/AuthLayout'
import { initPrefsSync } from './lib/prefsSync'
import './index.css'

const queryClient = new QueryClient()

initPrefsSync()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || 'Something went wrong' }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              OtakuVault hit a problem
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg"
            >
              Back to library
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route element={<AuthShell />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<Library key="all" />} />
                  <Route path="/anime" element={<Library key="anime" fixedType="anime" />} />
                  <Route path="/manga" element={<Library key="manga" fixedType="manga" />} />
                  <Route path="/manhwa" element={<Library key="manhwa" fixedType="manhwa" />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/community-lists" element={<CommunityLists />} />
                  <Route path="/community-lists/series/:slug" element={<CommunityLists />} />
                  <Route path="/title/:kind/:id" element={<TitleDetail />} />
                  <Route path="/import" element={<Import />} />
                  <Route path="/admin" element={<AdminUsers />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            <IntroSplash />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
