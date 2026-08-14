import { Component, type ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Error Boundary — mencegah layar putih saat komponen crash (audit #22)
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Terjadi kesalahan.' };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F1113', color: '#e2e8f0', padding: 24, fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💥</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Terjadi Kesalahan</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Aplikasi mengalami error yang tidak terduga. Muat ulang untuk melanjutkan.
            </p>
            {this.state.message && (
              <pre style={{ background: '#16181D', border: '1px solid #334155', borderRadius: 8, padding: 12, fontSize: 11, color: '#f87171', overflow: 'auto', textAlign: 'left', marginBottom: 16 }}>
                {this.state.message}
              </pre>
            )}
            <button
              onClick={() => (window.location.href = '/')}
              style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}