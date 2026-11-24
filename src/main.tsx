import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Đăng ký service worker tối thiểu để trình duyệt cho cài app (PWA).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

// Lỗi render bất ngờ (dữ liệu lạ, lỗi thư viện...) thì hiện màn hình lỗi
// rõ ràng thay vì trang trắng: người dùng bấm "Tải lại trang" là vào lại.
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : 'Lỗi không xác định.' };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
        <div className="card">
          <h2>Ứng dụng gặp lỗi</h2>
          <p>Có lỗi xảy ra khi mở trang. Dữ liệu của bạn vẫn còn trên máy / trên máy chủ, bấm nút dưới để tải lại trang.</p>
          {this.state.message && <p className="err">{this.state.message}</p>}
          <button className="btn" type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
