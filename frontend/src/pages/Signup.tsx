import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { useNavigate } from 'react-router-dom'
import { AuthLayout, AuthLoading } from '../components/AuthLayout'

export default function Signup() {
  const { session, loading } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [confirmationRequired, setConfirmationRequired] = useState(false)

  useEffect(() => {
    if (!loading && session) {
      navigate('/', { replace: true })
    }
  }, [loading, session, navigate])

  if (loading || session) return <AuthLoading />

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      // If no session, email confirmation is required
      if (!data.session) {
        setConfirmationRequired(true)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setIsLoading(false)
    }
  }

  if (confirmationRequired) {
    return (
      <AuthLayout title="Check your email" subtitle="One more step to unlock your vault.">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-float">📧</div>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            We've sent a confirmation link to <strong>{email}</strong>. Please click it to verify your account.
          </p>
          <Link
            to="/login"
            className="text-sky-600 dark:text-sky-400 hover:underline font-semibold"
          >
            Back to Login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create account" subtitle="Start building your shelf in seconds.">
      <div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-300 p-3 rounded-xl mb-4 text-sm animate-fade-up">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-premium"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-premium"
              placeholder="••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="input-premium"
              placeholder="••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-glow w-full !py-3"
          >
            {isLoading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-center text-gray-600 dark:text-gray-400 mt-6 text-sm">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-sky-600 dark:text-sky-400 hover:underline font-semibold"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
