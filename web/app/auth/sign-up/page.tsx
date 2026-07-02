'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'

export default function SignUp() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const { error } = await authClient.signUp.email({ name: fd.get('name') as string, email: fd.get('email') as string, password: fd.get('password') as string })
    setLoading(false)
    if (error) { setError(error.message ?? 'Failed'); return }
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-black text-indigo-400">RegrettableAttritionRadar</Link>
          <h1 className="text-2xl font-bold mt-4 text-white">Create your account</h1>
        </div>
        <form onSubmit={handleSubmit} className="bg-stone-900 rounded-xl border border-stone-800 p-8 space-y-4">
          {error && <div className="bg-rose-900/30 border border-rose-700 text-rose-400 rounded-lg p-3 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Name</label>
            <input name="name" type="text" required className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Email</label>
            <input name="email" type="email" required className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">Password</label>
            <input name="password" type="password" required minLength={8} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-stone-950 py-3 rounded-lg font-semibold transition-colors">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <p className="text-center text-stone-400 text-sm">
            Already have an account? <Link href="/auth/sign-in" className="text-indigo-400 hover:text-indigo-300">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  )
}
