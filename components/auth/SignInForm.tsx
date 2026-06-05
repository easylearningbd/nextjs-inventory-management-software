'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UserRound, AlertCircle, Loader2 } from 'lucide-react';

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result?.ok) {
      setError('Invalid email or password. Please try again.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="auth-page">
      <div className="auth">
        <div className="auth-ava">
          <UserRound />
        </div>

        <div className="auth-card">
          <h1 className="auth-title">Sign In</h1>

          {error && (
            <div className="auth-error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <div className="auth-label-row">
                <label className="auth-label" htmlFor="email">
                  Email : <span className="req">*</span>
                </label>
              </div>
              <input
                id="email"
                className="auth-input"
                type="email"
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <div className="auth-label-row">
                <label className="auth-label" htmlFor="password">
                  Password: <span className="req">*</span>
                </label>
                <a href="#" className="auth-forgot">Forgot Password ?</a>
              </div>
              <input
                id="password"
                className="auth-input"
                type="password"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
