// Màn hình Đăng nhập / Đăng ký / Quên mật khẩu (dùng chung qua Supabase).
// - Đăng ký: họ tên, email, mật khẩu tối thiểu 6 ký tự, chọn vai trò
//   Cờ đỏ trực hoặc Chỉ xem. Không cho tự đăng ký làm Ban thi đua.
// - Tài khoản đầu tiên đăng ký sẽ thành Ban thi đua (admin).
//   Các tài khoản sau đều ở trạng thái chờ duyệt.
// - Nếu Supabase yêu cầu xác nhận email, sau khi đăng ký sẽ hiện
//   thông báo mở email để xác nhận rồi đăng nhập.
import { useState } from 'react';
import { supabase } from './supabase';

type Mode = 'login' | 'register' | 'forgot';

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng. Kiểm tra lại rồi thử lại nhé.';
  if (/user already registered|already registered/i.test(message)) return 'Email này đã có tài khoản rồi. Bạn đăng nhập nhé, hoặc bấm "Quên mật khẩu" để đặt lại.';
  if (/password should be at least/i.test(message)) return 'Mật khẩu phải từ 6 ký tự trở lên.';
  if (/invalid email/i.test(message)) return 'Email chưa đúng định dạng.';
  if (/email.*confirm/i.test(message)) return 'Tài khoản cần xác nhận email trước. Bạn mở hộp thư và bấm link xác nhận nhé.';
  if (/too many requests|rate limit/i.test(message)) return 'Bạn thao tác quá nhanh, chờ một lát rồi thử lại.';
  return message || 'Có lỗi xảy ra, thử lại sau.';
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [requestedRole, setRequestedRole] = useState<'codo' | 'viewer'>('codo');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function onLogin() {
    if (!supabase) return;
    if (!email.trim() || !password) { setErr('Bạn nhập email và mật khẩu nhé.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(friendlyError(error.message));
    // Đăng nhập thành công: App.tsx tự nhận phiên qua onAuthStateChange.
  }

  async function onRegister() {
    if (!supabase) return;
    if (!fullName.trim()) { setErr('Bạn nhập họ tên nhé.'); return; }
    if (!email.trim()) { setErr('Bạn nhập email nhé.'); return; }
    if (password.length < 6) { setErr('Mật khẩu phải từ 6 ký tự trở lên.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), requested_role: requestedRole } },
    });
    setBusy(false);
    if (error) { setErr(friendlyError(error.message)); return; }
    if (!data.session) {
      setMsg('Đã tạo tài khoản. Bạn mở email vừa đăng ký, bấm link xác nhận, rồi quay lại đăng nhập nhé. Tài khoản sẽ ở trạng thái chờ Ban thi đua duyệt.');
    } else {
      setMsg('Đã tạo tài khoản. Tài khoản đang chờ Ban thi đua duyệt.');
    }
  }

  async function onForgot() {
    if (!supabase) return;
    if (!email.trim()) { setErr('Bạn nhập email đã đăng ký để nhận link đặt lại mật khẩu.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) { setErr(friendlyError(error.message)); return; }
    setMsg('Đã gửi email đặt lại mật khẩu. Bạn mở email và làm theo hướng dẫn nhé.');
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2>{mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Đăng ký tài khoản' : 'Quên mật khẩu'}</h2>
      {mode === 'register' && (
        <p>Tài khoản đầu tiên đăng ký sẽ là <b>Ban thi đua</b> (quản trị). Các tài khoản đăng ký sau đều ở trạng thái <b>chờ duyệt</b> và chỉ được vào hệ thống sau khi Ban thi đua duyệt.</p>
      )}
      {mode === 'login' && <p>Đăng nhập bằng email và mật khẩu đã đăng ký. Tài khoản chưa được Ban thi đua duyệt thì chưa vào được.</p>}
      {mode === 'register' && (
        <>
          <label>Họ tên</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Vd: Trần Thị Hương" />
          <label>Vai trò muốn đăng ký</label>
          <select value={requestedRole} onChange={e => setRequestedRole(e.target.value as 'codo' | 'viewer')}>
            <option value="codo">Cờ đỏ trực — nhập điểm lớp được phân công</option>
            <option value="viewer">Chỉ xem (GVCN / BGH) — chỉ xem, không nhập</option>
          </select>
          <p>Không tự đăng ký được vai trò Ban thi đua.</p>
        </>
      )}
      <label>Email</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Vd: ten@email.com" autoComplete="email" />
      {mode !== 'forgot' && (
        <>
          <label>Mật khẩu{mode === 'register' ? ' (tối thiểu 6 ký tự)' : ''}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </>
      )}
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        {mode === 'login' && <button className="btn" type="button" disabled={busy} onClick={onLogin}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>}
        {mode === 'register' && <button className="btn" type="button" disabled={busy} onClick={onRegister}>{busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}</button>}
        {mode === 'forgot' && <button className="btn" type="button" disabled={busy} onClick={onForgot}>{busy ? 'Đang gửi email…' : 'Gửi link đặt lại mật khẩu'}</button>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        {mode !== 'login' && <button className="btn ghost" type="button" onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>Đã có tài khoản — Đăng nhập</button>}
        {mode !== 'register' && <button className="btn ghost" type="button" onClick={() => { setMode('register'); setErr(''); setMsg(''); }}>Chưa có tài khoản — Đăng ký</button>}
        {mode !== 'forgot' && <button className="btn ghost" type="button" onClick={() => { setMode('forgot'); setErr(''); setMsg(''); }}>Quên mật khẩu</button>}
      </div>
    </div>
  );
}
