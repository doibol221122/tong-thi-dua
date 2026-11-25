// Màn hình Đăng nhập / Đăng ký / Quên mật khẩu (dùng chung qua Supabase).
// - Đăng ký: họ tên, lớp, email, mật khẩu tối thiểu 6 ký tự, chọn vai trò
//   Cờ đỏ trực hoặc Chỉ xem. Không cho tự đăng ký làm Ban thi đua.
//   Lớp bắt buộc với cả Cờ đỏ lẫn Chỉ xem (GVCN chọn lớp chủ nhiệm).
//   Lớp đăng ký được lưu vào requested_class để hồ sơ tự
//   gán sẵn lớp, Ban thi đua duyệt là tài khoản hiện "Họ tên — Lớp ...".
// - Link mời GVCN (?lop=10B1&vai-tro=chi-xem&dang-ky=1) mở thẳng form
//   đăng ký với vai trò + lớp đã chọn sẵn.
// - Tài khoản đầu tiên đăng ký sẽ thành Ban thi đua (admin).
//   Các tài khoản sau đều ở trạng thái chờ duyệt.
// - Nếu Supabase yêu cầu xác nhận email, sau khi đăng ký sẽ hiện
//   thông báo mở email để xác nhận rồi đăng nhập.
// - Quên mật khẩu: gửi email rồi bấm link trong email sẽ mở màn hình
//   "Đặt mật khẩu mới" (mã khôi phục trong link: ?code= hoặc
//   #access_token=...&type=recovery, sự kiện PASSWORD_RECOVERY).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DUTY_CLASSES } from './lib';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng. Kiểm tra lại rồi thử lại nhé.';
  if (/user already registered|already registered/i.test(message)) return 'Email này đã có tài khoản rồi. Bạn đăng nhập nhé, hoặc bấm "Quên mật khẩu" để đặt lại.';
  if (/password should be at least/i.test(message)) return 'Mật khẩu phải từ 6 ký tự trở lên.';
  if (/invalid email/i.test(message)) return 'Email chưa đúng định dạng.';
  if (/email.*confirm/i.test(message)) return 'Tài khoản cần xác nhận email trước. Bạn mở hộp thư và bấm link xác nhận nhé.';
  if (/too many requests|rate limit/i.test(message)) return 'Bạn thao tác quá nhanh, chờ một lát rồi thử lại.';
  return message || 'Có lỗi xảy ra, thử lại sau.';
}

export default function AuthScreen({ initialMode, onRecoveryDone, onNotice }: { initialMode?: Mode; onRecoveryDone?: () => void; onNotice?: (text: string) => void }) {
  // Link mời GVCN (?lop=10B1&vai-tro=chi-xem&dang-ky=1) mở thẳng form
  // đăng ký với vai trò + lớp đã chọn sẵn.
  const [mode, setMode] = useState<Mode>(() => {
    if (initialMode) return initialMode;
    const search = new URLSearchParams(window.location.search);
    // Link đặt lại mật khẩu trong email: Supabase trả về ?code= (hoặc
    // #access_token=...&type=recovery) — mở thẳng form đặt mật khẩu mới.
    if (search.get('code') || /type=recovery/.test(window.location.hash)) return 'reset';
    return search.get('dang-ky') === '1' ? 'register' : 'login';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [fullName, setFullName] = useState('');
  const [requestedRole, setRequestedRole] = useState<'codo' | 'viewer'>(() => new URLSearchParams(window.location.search).get('vai-tro') === 'chi-xem' ? 'viewer' : 'codo');
  const [requestedClass, setRequestedClass] = useState(() => {
    const v = (new URLSearchParams(window.location.search).get('lop') ?? '').trim().toUpperCase();
    return DUTY_CLASSES.includes(v) ? v : '';
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // Lắng nghe sự kiện khôi phục mật khẩu của Supabase (khi link trong
  // email được bấm): chuyển sang form đặt mật khẩu mới ngay cả khi
  // phiên khôi phục đã tự tạo trong App.
  useEffect(() => {
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

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
    if (!requestedClass) { setErr(requestedRole === 'codo' ? 'Bạn chọn lớp của mình nhé.' : 'Bạn chọn lớp chủ nhiệm nhé.'); return; }
    if (!email.trim()) { setErr('Bạn nhập email nhé.'); return; }
    if (password.length < 6) { setErr('Mật khẩu phải từ 6 ký tự trở lên.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), requested_role: requestedRole, requested_class: requestedClass }, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) { setErr(friendlyError(error.message)); return; }
    if (!data.session) {
      setMsg('Đã tạo tài khoản. Bạn mở email vừa đăng ký, bấm link xác nhận, rồi quay lại đăng nhập nhé. Tài khoản sẽ ở trạng thái chờ Ban thi đua duyệt.');
    } else {
      setMsg('Đã tạo tài khoản. Tài khoản đang chờ Ban thi đua duyệt.');
    }
  }

  async function onResend() {
    if (!supabase) return;
    if (!email.trim()) { setErr('Bạn nhập email đã đăng ký để gửi lại email xác nhận.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) { setErr(friendlyError(error.message)); return; }
    setMsg('Đã gửi lại email xác nhận. Bạn mở email, bấm link xác nhận rồi quay lại đăng nhập nhé.');
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

  // Đặt mật khẩu mới sau khi bấm link trong email (phiên khôi phục).
  async function onReset() {
    if (!supabase) return;
    if (password.length < 6) { setErr('Mật khẩu phải từ 6 ký tự trở lên.'); return; }
    if (password !== password2) { setErr('Hai lần nhập mật khẩu chưa khớp.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(friendlyError(error.message)); return; }
    // Đổi xong thì đăng xuất khỏi phiên khôi phục và về màn hình đăng nhập.
    await supabase.auth.signOut();
    // Xóa mã khôi phục khỏi địa chỉ để tải lại trang không mở lại form này.
    window.history.replaceState(null, '', window.location.pathname);
    setPassword(''); setPassword2('');
    // Thông báo thành công phải đặt ở App (onNotice): sau signOut, App
    // chuyển sang màn hình đăng nhập và AuthScreen bị remount, msg cục
    // bộ của AuthScreen sẽ mất trước khi người dùng kịp thấy.
    if (onNotice) onNotice('Đã đặt mật khẩu mới. Bạn đăng nhập lại nhé.');
    else setMsg('Đã đặt mật khẩu mới. Bạn đăng nhập lại nhé.');
    setMode('login');
    onRecoveryDone?.();
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2>{mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Đăng ký tài khoản' : mode === 'forgot' ? 'Quên mật khẩu' : 'Đặt mật khẩu mới'}</h2>
      {mode === 'reset' && <p>Bạn vừa bấm link đặt lại mật khẩu trong email. Nhập mật khẩu mới bên dưới nhé.</p>}
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
            <option value="codo">Cờ đỏ trực — nhập điểm lớp mình trực</option>
            <option value="viewer">Chỉ xem (GVCN / BGH) — chỉ xem, không nhập</option>
          </select>
          <>
            <label>{requestedRole === 'codo' ? 'Lớp của bạn' : 'Lớp chủ nhiệm'}</label>
            <select value={requestedClass} onChange={e => setRequestedClass(e.target.value)}>
              <option value="">— Chọn lớp —</option>
              {DUTY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {requestedRole === 'viewer' && <p style={{ margin: 0 }}>Bắt buộc chọn lớp bạn chủ nhiệm để Ban thi đua duyệt đúng lớp nhé.</p>}
            {requestedRole === 'codo' && <p style={{ margin: 0 }}>Lớp bạn đang học — bạn là cờ đỏ của lớp này (cố định). Lớp trực sẽ theo lịch trực, hoặc bạn tự chọn khi nhập điểm.</p>}
          </>
          <p>Không tự đăng ký được vai trò Ban thi đua.</p>
        </>
      )}
      {mode !== 'reset' && (
        <>
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Vd: ten@email.com" autoComplete="email" />
        </>
      )}
      {mode === 'reset' && (
        <>
          <label>Mật khẩu mới (tối thiểu 6 ký tự)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu mới" autoComplete="new-password" />
          <label>Nhập lại mật khẩu mới</label>
          <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" />
        </>
      )}
      {mode !== 'forgot' && mode !== 'reset' && (
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
        {mode === 'reset' && <button className="btn" type="button" disabled={busy} onClick={onReset}>{busy ? 'Đang đặt mật khẩu…' : 'Đặt mật khẩu mới'}</button>}
      </div>
      {mode !== 'reset' && (
        <div className="row" style={{ marginTop: 10 }}>
          {mode !== 'login' && <button className="btn ghost" type="button" onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>Đã có tài khoản — Đăng nhập</button>}
          {mode !== 'register' && <button className="btn ghost" type="button" onClick={() => { setMode('register'); setErr(''); setMsg(''); }}>Chưa có tài khoản — Đăng ký</button>}
          {mode !== 'forgot' && <button className="btn ghost" type="button" onClick={() => { setMode('forgot'); setErr(''); setMsg(''); }}>Quên mật khẩu</button>}
          {mode === 'login' && <button className="btn ghost" type="button" disabled={busy} onClick={onResend}>{busy ? 'Đang gửi…' : 'Chưa nhận được email? Gửi lại email xác nhận'}</button>}
        </div>
      )}
    </div>
  );
}
