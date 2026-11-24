import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, ClassGroup, ClassItem, Details, ExtraLine, Role, Score, Week } from './lib';
import { calcScore, classAvg, classCoverage, classGroup, clsOf, compareAvg, downloadBlob, dropLegacyWhenSplit, dutyMonitored, DUTY_CLASSES, DUTY_WEEKS, emptyDetails, emptyState, gateDuty, groupLabel, hocTapLines, legacyMixedClusters, monthBlockOf, monthLabel, neNepLines, nowStr, safeFilename, sectionSums, stamp, toCsv, uid, validateDetails, validateImportedState, violationStats, weekNumberOf } from './lib';
import { exportClassDocx, exportMonthDocx, exportWeekDocx, exportWeekDocxNoRank } from './docxExport';
import { LOGO_DATA_URI } from './logoData';
import AuthScreen from './AuthScreen';
import { deleteProfile, ensureProfile, fetchHistory, fetchHistoryData, fetchSharedState, isSupabaseConfigured, listProfiles, saveSharedState, supabase, updateProfile } from './supabase';
import type { HistoryVersion, Profile } from './supabase';

// Sự kiện trình duyệt báo app web cài được (beforeinstallprompt).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LS_KEY = 'tong-thi-dua-v1';
const LS_SESSION = 'tong-thi-dua-session-v1';
const STATUS_LABEL: Record<string, string> = { draft: 'Nháp', submitted: 'Chờ duyệt', approved: 'Đã duyệt', returned: 'Bị trả lại' };

// Lỗi đọc dữ liệu local lần khởi động (để hiện ở đầu app, không lặng lẽ mất dữ liệu).
let loadStateError = '';
function loadState(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AppState;
      if (p.settings && typeof p.settings === 'object' && Array.isArray(p.weeks) && Array.isArray(p.classes) && Array.isArray(p.roster) && Array.isArray(p.scores) && Array.isArray(p.logs)) return p;
      loadStateError = 'Dữ liệu lưu trên máy này bị lỗi định dạng — đã bắt đầu lại từ dữ liệu trống. Nếu có file sao lưu JSON, nhập lại ở tab Quản lý.';
    }
  } catch { loadStateError = 'Dữ liệu lưu trên máy này bị lỗi — đã bắt đầu lại từ dữ liệu trống.'; }
  return emptyState();
}

function Stepper({ label, pts, value, onChange, disabled }: { label: string; pts: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const timer = useRef<number | null>(null);
  const valueRef = useRef(value);
  // Ô gõ tay: giữ nguyên nội dung người dùng gõ (kể cả rỗng/không hợp lệ)
  // để hiện "nhập số" thay vì lặng lẽ thành 0 — chỉ lưu 0 khi gõ số 0.
  const [raw, setRaw] = useState<string | null>(null);
  useEffect(() => { valueRef.current = value; }, [value]);
  // Một lần bấm chỉ tính một lần: dùng pointer event (chuột hay cảm ứng
  // đều chỉ bắn một lần) thay cho cặp mousedown + touchstart trước đây —
  // trên điện thoại hai sự kiện đó bắn chồng nhau nên mỗi lần bấm nhảy 2.
  // Giữ nút để tăng/giảm liên tục: interval đọc giá trị mới nhất qua ref
  // (callback cũ đóng kín giá trị lúc bấm nên giữ nút chỉ nhảy 1 rồi đứng).
  const start = (dir: number) => {
    if (disabled) return;
    setRaw(null);
    const step = () => {
      const next = Math.max(0, valueRef.current + dir);
      valueRef.current = next;
      onChange(next);
    };
    step();
    timer.current = window.setInterval(step, 120);
  };
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const onInput = (text: string) => {
    setRaw(text);
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n) && Number.isInteger(n) && n >= 0) {
      setRaw(null);
      valueRef.current = n;
      onChange(n);
    }
  };
  const rawInvalid = raw !== null && (raw.trim() === '' || !Number.isFinite(Number(raw)) || !Number.isInteger(Number(raw)) || Number(raw) < 0);
  return (
    <div className="field">
      <div className="nm">{label}<div className="pts">{pts}</div></div>
      <div className="stepper">
        <button type="button" disabled={disabled} onPointerDown={() => start(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} aria-label="Giảm">−</button>
        <input type="number" min={0} value={raw ?? value} disabled={disabled} onChange={e => onInput(e.target.value)} onBlur={() => setRaw(null)} aria-label={label} />
        <button type="button" disabled={disabled} onPointerDown={() => start(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} aria-label="Tăng">+</button>
        {rawInvalid && <span className="num-hint">nhập số</span>}
      </div>
    </div>
  );
}

// Một mục trong phiếu nhập điểm: tiêu đề gọn kèm tổng điểm của mục,
// bấm để thu gọn / mở ra.
function Section({ title, sum, children }: { title: string; sum: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" className="sec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span><span className="sec-sum">{sum}</span><span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

export default function App() {
  const [initial] = useState(() => { const s = loadState(); return { state: s, error: loadStateError }; });
  const [state, setState] = useState<AppState>(initial.state);
  const [bootErr, setBootErr] = useState(initial.error);
  // --- Đồng bộ Supabase (P0-03/04/05) ---
  // Trạng thái đồng bộ hiện ở header mọi lúc: Đang lưu… / Đã đồng bộ lúc
  // HH:MM / Lỗi đồng bộ — Thử lại. "Đã lưu" chỉ hiện sau khi máy chủ xác
  // nhận; lỗi mạng tự thử lại tối đa 3 lần rồi mới báo lỗi.
  type SyncStatus = 'idle' | 'saving' | 'synced' | 'error';
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncTime, setSyncTime] = useState('');
  const [syncErr, setSyncErr] = useState('');
  const [conflict, setConflict] = useState(false);
  const [syncRetry, setSyncRetry] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [useLocalOnly, setUseLocalOnly] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [authRetry, setAuthRetry] = useState(0);
  const [profileRetry, setProfileRetry] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState(() => new URLSearchParams(window.location.search).get('code') !== null || /type=recovery/.test(window.location.hash));
  const remoteVersionRef = useRef<number | null>(null);
  const savePendingRef = useRef(false);
  const saveSeqRef = useRef(0);
  const syncedStateJsonRef = useRef('');
  const lastSaveNoteRef = useRef('');
  const weekGoneAskedRef = useRef('');
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileRef = useRef<Profile | null>(null);
  const weekIdRef = useRef('');
  const dirtyRef = useRef(false);
  const [session, setSession] = useState<{ role: Role; name: string; id?: string; email?: string } | null>(() => {
    if (isSupabaseConfigured) return null; // Chế độ Supabase: phiên do Supabase + hồ sơ quyết định, không dùng vai trò chọn tay.
    try { const raw = localStorage.getItem(LS_SESSION); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  // --- Supabase: tài khoản dùng chung ---
  const [authUser, setAuthUser] = useState<{ id: string; email: string; user_metadata?: Record<string, unknown> } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  profileRef.current = profile;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [profileErr, setProfileErr] = useState('');
  const [remoteLoaded, setRemoteLoaded] = useState(!isSupabaseConfigured);
  const remoteUpdatedAtRef = useRef<string | null>(null);
  const lastSavedAtRef = useRef<string | null>(null);
  const remoteLoadingRef = useRef(false);
  const [tab, setTab] = useState('tong-quan');
  const [weekId, setWeekId] = useState('');
  weekIdRef.current = weekId;
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Details | null>(null);
  const [dirty, setDirty] = useState(false);
  dirtyRef.current = dirty;
  const [msg, setMsg] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [showPhieu, setShowPhieu] = useState(false);
  const [rankGroup, setRankGroup] = useState<'all' | ClassGroup>('all');
  // Cờ đỏ tự chọn lớp trực: đang mở ô chọn lớp thì true.
  const [showDutyPicker, setShowDutyPicker] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  // Cài đặt app (PWA): trình duyệt báo khi app cài được.
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Học sinh đang chờ duyệt: chọn lớp của mình ở màn hình chờ duyệt.
  const [pendingClassId, setPendingClassId] = useState('');
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingMsg, setPendingMsg] = useState('');
  const [pendingErr, setPendingErr] = useState('');
  const [pendingRetry, setPendingRetry] = useState(0);

  // Lưu dữ liệu trên máy này (localStorage) — lỗi (đầy bộ nhớ...) thì báo
  // rõ chứ không lặng lẽ mất dữ liệu.
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch { setSyncStatus('error'); setSyncErr('Không lưu được dữ liệu trên máy này (trình duyệt đầy bộ nhớ?).'); }
  }, [state]);
  useEffect(() => { if (session) localStorage.setItem(LS_SESSION, JSON.stringify(session)); else localStorage.removeItem(LS_SESSION); }, [session]);

  // Tự kiểm tra bản mới: khi mở app, mỗi lần quay lại app và mỗi 5 phút,
  // so version.json trên máy chủ với số hiệu bản đang chạy (__BUILD_V__).
  // Chỉ hiện thông báo, không tự tải lại để không mất phiếu đang nhập dở.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (!navigator.onLine) return;
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json() as { v?: number };
        if (typeof j.v !== 'number' || j.v === 0) return;
        if (__BUILD_V__ !== 0 && j.v !== __BUILD_V__ && !stopped) setUpdateAvailable(true);
      } catch { /* ngoại tuyến hoặc chưa có version.json: bỏ qua */ }
    };
    check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Nghe sự kiện "cài được app": trình duyệt chỉ báo khi app đủ điều kiện
  // (đã có manifest + icon + service worker). Đã cài rồi thì không hiện.
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  // Theo dõi phiên Supabase (đăng nhập / đăng xuất / làm mới token).
  // Lỗi lấy phiên (mạng...) thì báo rõ + có nút thử lại, không kẹt ở
  // màn hình "Đang kiểm tra..." mãi. Link đặt lại mật khẩu trong email
  // mở ra sự kiện PASSWORD_RECOVERY -> mở form đặt mật khẩu mới.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user;
        setAuthUser(u ? { id: u.id, email: u.email ?? '', user_metadata: (u.user_metadata ?? {}) as Record<string, unknown> } : null);
        setAuthReady(true);
      })
      .catch(() => { setAuthErr('Không kiểm tra được phiên đăng nhập (lỗi mạng?). Bạn thử lại nhé.'); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      const u = sess?.user;
      if (event === 'PASSWORD_RECOVERY') { setRecoveryMode(true); setAuthReady(true); return; }
      // Đăng nhập tài khoản (mới): xóa thông báo của phiên trước
      // (vd: "Đã đăng xuất." sau khi đăng xuất) để không hiện sang tài khoản khác,
      // và đưa về tab Tổng quan thay vì ở lại tab của tài khoản trước.
      if (event === 'SIGNED_IN' && u) { setMsg(''); setErrs([]); setTab('tong-quan'); }
      setAuthUser(u ? { id: u.id, email: u.email ?? '', user_metadata: (u.user_metadata ?? {}) as Record<string, unknown> } : null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [authRetry]);

  // Từ tài khoản Supabase -> hồ sơ (profiles) -> vai trò trong app.
  // Hồ sơ chưa có (đăng ký / đăng nhập lần đầu) thì tự tạo theo quy tắc
  // khởi tạo trong ensureProfile: hồ sơ đầu tiên thành admin, còn lại chờ duyệt.
  // Chỉ tài khoản đã duyệt mới có phiên làm việc (session); tài khoản
  // đang chờ duyệt / bị khóa thì session = null để hiện màn hình chờ duyệt.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!authUser) { setProfile(null); setSession(null); setProfileErr(''); return; }
    let alive = true;
    ensureProfile(authUser as never)
      .then(p => {
        if (!alive) return;
        setProfile(p);
        if (p.status === 'active') setSession({ role: p.role, name: p.full_name, id: p.id, email: p.email });
        else setSession(null);
        setProfileErr('');
      })
      .catch(e => { if (alive) setProfileErr(`Không tải được hồ sơ: ${e instanceof Error ? e.message : 'lỗi không rõ'}. Kiểm tra xem đã chạy supabase/schema.sql chưa.`); });
    return () => { alive = false; };
  }, [authUser, profileRetry]);

  // Ban thi đua tải danh sách tài khoản để duyệt / quản lý.
  useEffect(() => {
    if (!isSupabaseConfigured || profile?.role !== 'admin') return;
    listProfiles().then(setProfiles).catch(() => { /* hiển thị trống, lỗi sẽ thấy khi thao tác */ });
  }, [profile]);

  // Tải dữ liệu dùng chung từ Supabase sau khi đăng nhập.
  // Chỉ tài khoản đã duyệt mới tải; tài khoản chờ duyệt chỉ thấy danh
  // sách lớp cố định ở màn hình chờ (P1-13).
  // Tải lỗi (mạng, hoặc dữ liệu chung sai định dạng) thì KHÔNG đặt
  // remoteLoaded — effect ghi sẽ không chạy, không đẩy dữ liệu máy này
  // lên ghi đè dữ liệu chung. Hiện màn hình lỗi có nút thử lại.
  useEffect(() => {
    if (!isSupabaseConfigured || !profile || remoteLoaded || remoteLoadingRef.current) return;
    if (profile.status !== 'active') { setRemoteLoaded(true); return; }
    remoteLoadingRef.current = true;
    fetchSharedState()
      .then(async row => {
        if (row.data) {
          setState(row.data);
          remoteUpdatedAtRef.current = row.updatedAt;
          remoteVersionRef.current = row.version;
          lastSavedAtRef.current = row.updatedAt;
          syncedStateJsonRef.current = JSON.stringify(row.data);
        } else {
          // Chưa có dòng dữ liệu trên máy chủ: đẩy dữ liệu máy này lên làm bản đầu.
          const res = await saveSharedState(loadState(), profile.full_name, {});
          remoteUpdatedAtRef.current = res.updatedAt;
          remoteVersionRef.current = res.version;
          lastSavedAtRef.current = res.updatedAt;
          syncedStateJsonRef.current = JSON.stringify(loadState());
        }
        setRemoteLoaded(true);
        setSyncStatus('synced');
        setSyncTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
      })
      .catch((e) => {
        setLoadFailed(true);
        setSyncStatus('error');
        setSyncErr(e instanceof Error ? e.message : 'Chưa tải được dữ liệu dùng chung từ Supabase.');
      })
      .finally(() => { remoteLoadingRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, remoteLoaded, loadAttempt]);

  // Ghi dữ liệu lên Supabase sau mỗi thay đổi (debounce ~1s, ghi có điều
  // kiện — máy khác đã lưu mới hơn thì báo xung đột, không ghi đè lén).
  // Lỗi mạng tự thử lại tối đa 3 lần rồi mới báo lỗi đồng bộ.
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || profile?.status !== 'active' || useLocalOnly) return;
    if (JSON.stringify(state) === syncedStateJsonRef.current) return;
    setSyncStatus('saving');
    savePendingRef.current = true;
    const seq = ++saveSeqRef.current;
    const timer = window.setTimeout(() => { void doSave(seq, 0); }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, remoteLoaded, profile, syncRetry, useLocalOnly]);

  // Tự làm mới dữ liệu dùng chung: máy khác nộp/duyệt phiếu thì máy này
  // tự thấy sau tối đa ~45 giây mà không cần tải lại trang. Chỉ đọc,
  // không ghi; phiếu đang nhập dở không bị mất vì bản nháp nằm riêng.
  // Tạm dừng khi đang lưu hoặc đang lỗi đồng bộ (tránh ghi đè bản local
  // chưa lưu được); chỉ chạy với tài khoản đã duyệt.
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !profile || profile.status !== 'active' || useLocalOnly) return;
    const id = window.setInterval(async () => {
      if (document.hidden || !navigator.onLine) return;
      if (savePendingRef.current || syncStatus === 'error') return;
      try {
        const remote = await fetchSharedState();
        if (remote.data && remote.updatedAt && remote.updatedAt !== lastSavedAtRef.current && (!remoteUpdatedAtRef.current || remote.updatedAt > remoteUpdatedAtRef.current)) {
          // Tuần đang xem bị xóa ở máy khác thì hỏi trước khi nhảy tuần;
          // giữ bản nháp nếu người dùng chọn ở lại.
          const curWeekId = weekIdRef.current;
          if (curWeekId && remote.data && !remote.data.weeks.some(w => w.id === curWeekId)) {
            const label = stateRef.current.weeks.find(w => w.id === curWeekId)?.label ?? curWeekId;
            if (weekGoneAskedRef.current !== curWeekId) {
              weekGoneAskedRef.current = curWeekId;
              if (dirtyRef.current) {
                if (!window.confirm(`Tuần ${label} đã bị xóa ở máy khác. Chuyển sang tuần mới nhất? (Bản nháp đang sửa sẽ được giữ lại nếu bạn chọn Hủy.)`)) return;
              } else {
                setMsg(`Tuần ${label} đã bị xóa ở máy khác, đã chuyển sang tuần mới nhất.`);
              }
            }
          }
          setState(remote.data);
          remoteUpdatedAtRef.current = remote.updatedAt;
          remoteVersionRef.current = remote.version;
          syncedStateJsonRef.current = JSON.stringify(remote.data);
        }
      } catch { /* ngoại tuyến / lỗi mạng: lần sau thử lại */ }
    }, 45000);
    return () => window.clearInterval(id);
  }, [remoteLoaded, profile, syncStatus, useLocalOnly]);

  // Ghi dữ liệu hiện tại lên Supabase, có điều kiện (không ghi đè bản mới
  // hơn từ máy khác). Lỗi mạng thì tự thử lại tối đa 3 lần rồi báo lỗi.
  async function doSave(seq: number, attempt: number): Promise<void> {
    const prof = profileRef.current;
    if (!isSupabaseConfigured || !prof || prof.status !== 'active') { savePendingRef.current = false; return; }
    try {
      const res = await saveSharedState(stateRef.current, prof.full_name, { expectedUpdatedAt: remoteUpdatedAtRef.current, expectedVersion: remoteVersionRef.current });
      if (seq !== saveSeqRef.current) return; // đã có lần ghi mới hơn
      if (res.conflict) {
        savePendingRef.current = false;
        setConflict(true);
        setSyncStatus('error');
        setSyncErr('Có máy khác vừa lưu mới hơn. Bản của bạn chưa bị ghi đè.');
        return;
      }
      remoteUpdatedAtRef.current = res.updatedAt;
      remoteVersionRef.current = res.version;
      lastSavedAtRef.current = res.updatedAt;
      syncedStateJsonRef.current = JSON.stringify(stateRef.current);
      savePendingRef.current = false;
      setSyncStatus('synced');
      setSyncTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
      if (lastSaveNoteRef.current) { setMsg(lastSaveNoteRef.current); lastSaveNoteRef.current = ''; }
    } catch {
      if (seq !== saveSeqRef.current) return;
      if (attempt < 3) {
        window.setTimeout(() => { void doSave(seq, attempt + 1); }, 2000 * (attempt + 1));
      } else {
        savePendingRef.current = false;
        setSyncStatus('error');
        setSyncErr('Chưa đồng bộ được lên Supabase — dữ liệu vẫn lưu trên máy này.');
      }
    }
  }

  // Xử lý xung đột ghi: "Xem bản mới" lấy bản trên máy chủ (hỏi trước nếu
  // đang sửa dở), "Giữ bản của tôi" ghi đè có xác nhận.
  async function resolveConflict(keepMine: boolean) {
    const prof = profileRef.current;
    if (!prof) return;
    if (!keepMine && dirtyRef.current && !window.confirm('Phiếu đang sửa chưa lưu sẽ bị thay bằng bản trên máy chủ. Tiếp tục?')) return;
    if (keepMine && !window.confirm('Ghi đè dữ liệu trên máy chủ bằng bản của bạn? Bản trên máy chủ sẽ mất (vẫn còn trong lịch sử sao lưu nếu đã bật sao lưu tự động).')) return;
    setSyncStatus('saving');
    try {
      if (keepMine) {
        const res = await saveSharedState(stateRef.current, prof.full_name, { force: true });
        remoteUpdatedAtRef.current = res.updatedAt;
        remoteVersionRef.current = res.version;
        lastSavedAtRef.current = res.updatedAt;
        syncedStateJsonRef.current = JSON.stringify(stateRef.current);
        setConflict(false);
        setSyncStatus('synced');
        setSyncTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
        setMsg('Đã ghi đè dữ liệu trên máy chủ bằng bản của bạn.');
      } else {
        const row = await fetchSharedState();
        if (row.data) {
          setState(row.data);
          remoteUpdatedAtRef.current = row.updatedAt;
          remoteVersionRef.current = row.version;
          lastSavedAtRef.current = row.updatedAt;
          syncedStateJsonRef.current = JSON.stringify(row.data);
          setConflict(false);
          setSyncStatus('synced');
          setSyncTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
          setMsg('Đã tải bản mới nhất từ máy chủ.');
        }
      }
    } catch {
      setSyncStatus('error');
      setSyncErr('Chưa xử lý được xung đột — thử lại sau.');
    }
  }

  // Thông báo xanh (đã lưu, đã duyệt...) tự ẩn sau 5 giây cho gọn.
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(''), 5000);
    return () => window.clearTimeout(t);
  }, [msg]);

  // Nút "Cài app": chỉ hiện khi app chưa được cài (chưa chạy standalone)
  // và trình duyệt báo cài được, hoặc đang dùng iPhone (hướng dẫn thủ công).
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  const showInstall = !isStandalone && (installPrompt !== null || /iPad|iPhone|iPod/.test(navigator.userAgent));

  const week: Week | undefined = state.weeks.find(w => w.id === weekId) ?? state.weeks[state.weeks.length - 1];
  const effectiveWeekId = week?.id ?? '';
  const currentScore: Score | undefined = state.scores.find(s => s.weekId === effectiveWeekId && s.classId === classId);
  // Phân công của cờ đỏ — lớp mình học (hồ sơ) khác lớp mình trực:
  // - Ưu tiên phân công trực của tuần hiện tại (roster): Ban thi đua gán
  //   theo lịch trực, lớp đó là lớp cờ đỏ phải nhập điểm.
  // - Chưa có phân công trực thì dùng lớp/tuần gán trong hồ sơ Supabase
  //   (lớp của chính cờ đỏ) hoặc phân công cũ (roster) theo họ tên.
  // homeClassId = lớp của chính cờ đỏ (để hiển thị), source cho biết
  // assignment này là lớp trực (roster) hay lớp của mình (profile).
  const assignment = useMemo(() => {
    if (session?.role !== 'codo') return undefined;
    const homeClassId = profile?.assigned_class_id ?? null;
    const curWeek = state.weeks[state.weeks.length - 1];
    if (curWeek) {
      const r = state.roster.find(x => x.name === session.name && x.active && x.weekId === curWeek.id);
      if (r) return { ...r, homeClassId, source: 'roster' as const };
    }
    if (profile?.assigned_class_id && profile?.assigned_week_id) {
      return { id: 'profile', name: session.name, classId: profile.assigned_class_id, weekId: profile.assigned_week_id, active: true, homeClassId, source: 'profile' as const };
    }
    const r = state.roster.find(x => x.name === session.name && x.active);
    return r ? { ...r, homeClassId, source: 'roster' as const } : undefined;
  }, [session, profile, state.roster, state.weeks]);

  // Lớp đăng ký trước đó (requested_class) mà hồ sơ chưa gán được (vd lớp
  // chưa có trong hệ thống lúc đăng ký) thì gợi ý sẵn ở màn hình chờ duyệt.
  // Tài khoản chờ duyệt không tải dữ liệu chung nên danh sách lớp có thể
  // chỉ là danh sách cố định — lúc đó gợi ý theo tên lớp ("name:10B1").
  // Tra không ra lớp thì báo rõ + có nút Thử lại ở màn hình chờ.
  useEffect(() => {
    if (!profile || profile.status !== 'pending' || (profile.role !== 'codo' && profile.role !== 'viewer')) return;
    if (profile.assigned_class_id || pendingClassId) return;
    const rc = authUser?.user_metadata?.requested_class;
    if (typeof rc !== 'string' || !rc.trim()) return;
    const nm = rc.trim().toUpperCase();
    const c = state.classes.find(x => x.name.toUpperCase() === nm);
    if (c) setPendingClassId(c.id);
    else if (DUTY_CLASSES.includes(nm)) setPendingClassId(`name:${nm}`);
    else setPendingErr(`Không tìm thấy lớp “${rc.trim()}” trong hệ thống — chọn lại lớp bên dưới nhé.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, authUser, state.classes, pendingRetry]);

  // Cờ đỏ vào là tự mở đúng lớp được phân công
  useEffect(() => {
    if (session?.role === 'codo' && assignment) { setWeekId(assignment.weekId); setClassId(assignment.classId); setTab('nhap-diem'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (currentScore) setDraft(currentScore.details);
    else setDraft(emptyDetails());
    setDirty(false); setErrs([]); setShowPhieu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWeekId, classId]);

  const calc = useMemo(() => calcScore(draft ?? emptyDetails()), [draft]);
  const roleLabel = session?.role === 'admin' ? 'Ban thi đua' : session?.role === 'codo' ? 'Cờ đỏ' : 'Chỉ xem';
  const canEdit = useMemo(() => {
    if (!session || session.role === 'viewer' || !draft) return false;
    if (week?.submittedAt) return false;
    if (currentScore && currentScore.status === 'approved') return false;
    if (currentScore && currentScore.status === 'submitted') return false;
    if (session.role === 'codo') return assignment?.classId === classId && assignment?.weekId === effectiveWeekId;
    return true;
  }, [session, week, currentScore, assignment, classId, effectiveWeekId, draft]);

  // Bấm "Cài app": Android mở hộp thoại cài đặt của trình duyệt;
  // iPhone không có hộp thoại này nên hiện hướng dẫn thêm thủ công.
  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => undefined);
      setInstallPrompt(null);
      return;
    }
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) setMsg('Trên iPhone: bấm nút Chia sẻ (hình vuông có mũi tên lên) rồi chọn "Thêm vào Màn hình chính" nhé.');
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setRemoteLoaded(false);
    remoteUpdatedAtRef.current = null;
    remoteVersionRef.current = null;
    lastSavedAtRef.current = null;
    syncedStateJsonRef.current = '';
    savePendingRef.current = false;
    weekGoneAskedRef.current = '';
    setSyncStatus('idle'); setSyncErr(''); setConflict(false); setLoadFailed(false); setUseLocalOnly(false);
    setDraft(null); setDirty(false); setWeekId(''); setClassId(''); setTab('tong-quan'); setShowPhieu(false); setReturnReason('');
    setMsg('Đã đăng xuất.');
  }

  // Ban thi đua cập nhật tài khoản (duyệt / đổi vai trò / gán lớp-tuần / khóa / mở lại / từ chối).
  // - Không bao giờ hạ/khóa/xóa tài khoản Ban thi đua đang dùng duy nhất.
  // - Đổi vai trò, khóa tài khoản đều hỏi xác nhận trước.
  async function patchProfile(id: string, patch: Partial<Pick<Profile, 'role' | 'status' | 'reject_reason' | 'assigned_class_id' | 'assigned_week_id'>>) {
    if (!supabase) { setErrs(['Chưa cấu hình Supabase nên chưa quản lý được tài khoản.']); return; }
    const p = profiles.find(x => x.id === id);
    const isLastAdmin = p?.role === 'admin' && p.status === 'active' && profiles.filter(x => x.role === 'admin' && x.status === 'active').length <= 1;
    if (isLastAdmin && ((patch.role !== undefined && patch.role !== 'admin') || patch.status === 'disabled' || patch.status === 'rejected')) {
      setErrs(['Không thể làm vậy vì đây là tài khoản Ban thi đua đang dùng duy nhất. Cần có ít nhất một tài khoản Ban thi đua khác đang dùng trước.']);
      return;
    }
    if (patch.role !== undefined && p && patch.role !== p.role && !window.confirm(`Đổi vai trò của ${p.full_name} thành ${patch.role === 'admin' ? 'Ban thi đua' : patch.role === 'codo' ? 'Cờ đỏ trực' : 'Chỉ xem'}?`)) return;
    if (patch.status === 'disabled' && p && !window.confirm(`Khóa tài khoản ${p.full_name} (${p.email})? Người này sẽ không vào hệ thống được nữa.`)) return;
    try {
      await updateProfile(id, patch);
      setProfiles(prev => prev.map(pp => (pp.id === id ? { ...pp, ...patch } : pp)));
      update(s => s, 'Quản lý tài khoản', `${p?.full_name ?? ''} (${p?.email ?? ''})`);
      setMsg('Đã cập nhật tài khoản.');
    } catch {
      setErrs(['Không cập nhật được tài khoản. Kiểm tra lại Supabase (đã chạy schema.sql chưa).']);
    }
  }

  // Học sinh đang chờ duyệt tự lưu lớp của mình (màn hình chờ duyệt).
  // pendingClassId có thể là id lớp thật, hoặc "name:TÊN LỚP" khi hệ thống
  // chưa tải được danh sách lớp (màn hình chờ chỉ có danh sách cố định) —
  // lúc đó khớp tên với lớp thật, chưa có lớp thì báo rõ, không lưu sai.
  async function savePendingClass() {
    if (!profile) return;
    let cid = pendingClassId || profile.assigned_class_id || '';
    if (cid.startsWith('name:')) {
      const nm = cid.slice(5);
      const found = state.classes.find(c => c.name.toUpperCase() === nm.toUpperCase());
      if (!found) { setPendingErr(`Lớp ${nm} chưa có trong hệ thống — Ban thi đua sẽ gán lớp cho bạn sau khi duyệt.`); return; }
      cid = found.id;
    }
    if (!cid) { setPendingErr('Bạn chọn lớp của mình trước nhé.'); return; }
    setPendingBusy(true); setPendingErr(''); setPendingMsg('');
    try {
      await updateProfile(profile.id, { assigned_class_id: cid });
      setProfile({ ...profile, assigned_class_id: cid });
      setPendingClassId(cid);
      setPendingMsg(`Đã lưu lớp của bạn: ${state.classes.find(c => c.id === cid)?.name ?? ''}. Ban thi đua duyệt tài khoản là bạn vào nhập điểm được ngay.`);
    } catch (e) {
      setPendingErr(`Chưa lưu được: ${e instanceof Error ? e.message : 'lỗi không rõ'}. Bạn thử lại nhé.`);
    }
    setPendingBusy(false);
  }

  // Ban thi đua xóa tài khoản: gỡ hồ sơ khỏi bảng profiles, người đó không vào app được nữa.
  // Không xóa được tài khoản của chính mình (báo rõ thay vì lặng lẽ bỏ qua),
  // không xóa tài khoản Ban thi đua đang dùng duy nhất. Phân công trực
  // mang tên tài khoản này cũng được xóa theo. Phiếu đã nhập vẫn giữ lại.
  async function removeProfile(id: string) {
    if (!supabase) { setErrs(['Chưa cấu hình Supabase nên chưa quản lý được tài khoản.']); return; }
    const p = profiles.find(x => x.id === id);
    if (!p) return;
    if (session?.id === id) { setErrs(['Không xóa được tài khoản của chính mình.']); return; }
    const isLastAdmin = p.role === 'admin' && p.status === 'active' && profiles.filter(x => x.role === 'admin' && x.status === 'active').length <= 1;
    if (isLastAdmin) { setErrs(['Không xóa được vì đây là tài khoản Ban thi đua đang dùng duy nhất. Cần có ít nhất một tài khoản Ban thi đua khác đang dùng trước.']); return; }
    if (!window.confirm(`Xóa tài khoản ${p.full_name} (${p.email})? Người này sẽ không đăng nhập vào hệ thống được nữa. Phiếu đã nhập vẫn giữ lại.`)) return;
    try {
      await deleteProfile(id);
      setProfiles(prev => prev.filter(x => x.id !== id));
      update(s => ({ ...s, roster: s.roster.filter(r => r.name !== p.full_name) }), 'Xóa tài khoản', `${p.full_name} (${p.email})`);
      setMsg('Đã xóa tài khoản.');
    } catch {
      setErrs(['Không xóa được tài khoản. Kiểm tra lại Supabase (đã chạy dòng chính sách xóa trong schema.sql chưa).']);
    }
  }

  function update(fn: (s: AppState) => AppState, logAction?: string, logDetail?: string) {
    setState(prev => {
      const next = fn(prev);
      // Nhật ký giữ tối đa 300 dòng gần nhất (tránh phình bộ nhớ local).
      if (logAction) next.logs = [...next.logs, { id: uid(), time: nowStr(), actor: session?.name ?? 'Hệ thống', role: roleLabel, action: logAction, detail: logDetail ?? '' }].slice(-300);
      return next;
    });
  }
  function setD<K extends keyof Details>(key: K, v: Details[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: v }); setDirty(true);
  }
  function confirmDirty(): boolean {
    if (!dirty) return true;
    return window.confirm('Phiếu đang sửa chưa lưu & nộp. Chuyển đi sẽ mất số liệu chưa lưu. Bạn có chắc muốn chuyển đi?');
  }
  function switchTab(t: string) { if (confirmDirty()) { setTab(t); setDirty(false); } }
  function switchClass(id: string) { if (confirmDirty()) setClassId(id); }

  function saveScore(status: 'draft' | 'submitted') {
    if (!draft || !week || !classId) return;
    // Chốt khóa: phiếu đã nộp/duyệt hoặc tuần đã chốt thì không ai lưu đè
    // được nữa (kể cả cờ đỏ tự chọn lại lớp) — Ban thi đua phải mở lại trước.
    if (!canEdit) { setErrs(['Phiếu này không sửa được nữa (đã nộp, đã duyệt hoặc tuần đã chốt). Ban thi đua mở lại thì mới sửa được.']); return; }
    const errors = status === 'submitted' ? validateDetails(draft) : [];
    if (errors.length) { setErrs(errors); setMsg(''); return; }
    setErrs([]);
    const clsName = state.classes.find(c => c.id === classId)?.name ?? classId;
    const c = calcScore(draft);
    update(prev => {
      const ex = prev.scores.find(s => s.weekId === week.id && s.classId === classId);
      const base: Score = ex ?? { id: uid(), weekId: week.id, classId, details: draft, status: 'draft' };
      const ns: Score = { ...base, details: draft, status, updatedBy: session?.name, updatedAt: nowStr(),
        submittedBy: status === 'submitted' ? session?.name : base.submittedBy,
        submittedAt: status === 'submitted' ? nowStr() : base.submittedAt,
        returnReason: status === 'submitted' ? undefined : base.returnReason };
      return { ...prev, scores: ex ? prev.scores.map(s => s.id === ex.id ? ns : s) : [...prev.scores, ns] };
    }, status === 'submitted' ? 'Nộp phiếu' : 'Lưu nháp', `${clsName} — ${week.label}: ${c.final}đ-${c.cls}`);
    setDirty(false);
    // "Đã lưu" chỉ hiện sau khi máy chủ xác nhận (đồng bộ xong) — trước
    // đó chỉ báo "đang đồng bộ". Chế độ máy này (không Supabase) thì lưu
    // trên máy là xong ngay.
    const doneMsg = status === 'submitted' ? `Đã lưu & nộp phiếu lớp ${clsName}: ${c.final}đ, loại ${c.cls}.` : `Đã lưu nháp phiếu lớp ${clsName}.`;
    if (isSupabaseConfigured) {
      lastSaveNoteRef.current = doneMsg;
      setMsg(`Đã ghi phiếu lớp ${clsName}${status === 'submitted' ? ` (${c.final}đ, loại ${c.cls})` : ' (nháp)'} — đang đồng bộ lên máy chủ…`);
    } else setMsg(doneMsg);
  }
  function approveScore() {
    if (!currentScore || session?.role !== 'admin') return;
    // Chỉ duyệt phiếu đang Chờ duyệt và đủ điều kiện nộp (đủ giờ, số liệu hợp lệ).
    if (currentScore.status !== 'submitted') { setErrs(['Chỉ duyệt được phiếu đang ở trạng thái Chờ duyệt.']); return; }
    const errors = validateDetails(currentScore.details);
    if (errors.length) { setErrs([`Phiếu chưa đủ điều kiện duyệt: ${errors[0]}`]); return; }
    const clsName = state.classes.find(c => c.id === currentScore.classId)?.name ?? '';
    if (!window.confirm(`Duyệt phiếu lớp ${clsName} (${calcScore(currentScore.details).final}đ, loại ${calcScore(currentScore.details).cls})? Phiếu đã duyệt sẽ vào xếp hạng chính thức.`)) return;
    update(prev => ({ ...prev, scores: prev.scores.map(s => s.id === currentScore.id ? { ...s, status: 'approved', approvedBy: session?.name, approvedAt: nowStr() } : s) }), 'Duyệt phiếu', `${clsName} — ${week?.label}`);
    setMsg(`Đã duyệt phiếu lớp ${clsName}.`); setDraft(currentScore.details);
  }
  // Duyệt tất cả phiếu đã nộp của tuần hiện tại (chỉ Ban thi đua).
  // Phiếu chưa đủ điều kiện thì bỏ qua và báo rõ từng phiếu.
  function approveAllScores() {
    if (!week || session?.role !== 'admin') return;
    const ids = pendingScores.map(s => s.id);
    if (!ids.length) return;
    if (!window.confirm(`Duyệt tất cả ${ids.length} phiếu đã nộp của ${week.label}?`)) return;
    const okIds: string[] = [];
    const skipped: string[] = [];
    for (const s of pendingScores) {
      const errs = validateDetails(s.details);
      if (errs.length) skipped.push(`${state.classes.find(c => c.id === s.classId)?.name ?? s.classId} (${errs[0]})`);
      else okIds.push(s.id);
    }
    if (!okIds.length) { setErrs([`Không duyệt được phiếu nào: ${skipped.join('; ')}`]); return; }
    const idSet = new Set(okIds);
    update(prev => ({ ...prev, scores: prev.scores.map(s => idSet.has(s.id) ? { ...s, status: 'approved', approvedBy: session?.name, approvedAt: nowStr() } : s) }), 'Duyệt tất cả phiếu', `${week.label} — ${okIds.length} phiếu`);
    setMsg(`Đã duyệt ${okIds.length} phiếu của ${week.label}.${skipped.length ? ` Bỏ qua ${skipped.length} phiếu chưa đủ điều kiện: ${skipped.join('; ')}.` : ''}`);
  }
  // Cờ đỏ tự chọn lớp trực tuần hiện tại: ghi thành phân công (roster) để
  // Ban thi đua thấy trong Quản lý; chọn lại thì cập nhật dòng cũ, không
  // nhân đôi. Sau khi chọn, phân công này được ưu tiên như gán tay.
  function confirmDutyPick(classId: string) {
    if (!week || session?.role !== 'codo' || !classId) return;
    if (!confirmDirty()) return;
    const clsName = state.classes.find(c => c.id === classId)?.name ?? '';
    update(prev => {
      const roster = [...prev.roster];
      const i = roster.findIndex(r => r.name === session.name && r.weekId === week.id);
      if (i >= 0) roster[i] = { ...roster[i], classId, active: true };
      else roster.push({ id: uid(), name: session.name, classId, weekId: week.id, active: true });
      return { ...prev, roster };
    }, 'Tự chọn lớp trực', `${session.name} — ${clsName} — ${week.label}`);
    setShowDutyPicker(false);
    setWeekId(week.id); setClassId(classId);
  }
  function returnScore() {
    if (!currentScore || session?.role !== 'admin' || !returnReason.trim()) { setErrs(['Trả lại phiếu phải ghi rõ lý do.']); return; }
    if (currentScore.status !== 'submitted') { setErrs(['Chỉ trả lại được phiếu đang ở trạng thái Chờ duyệt.']); return; }
    const clsName = state.classes.find(c => c.id === currentScore.classId)?.name ?? '';
    if (!window.confirm(`Trả lại phiếu lớp ${clsName} với lý do: “${returnReason.trim()}”?`)) return;
    update(prev => ({ ...prev, scores: prev.scores.map(s => s.id === currentScore.id ? { ...s, status: 'returned', returnReason: returnReason.trim() } : s) }), 'Trả lại phiếu', `${clsName} — Lý do: ${returnReason.trim()}`);
    setMsg(`Đã trả lại phiếu lớp ${clsName}.`); setReturnReason(''); setDraft(currentScore.details);
  }
  // Hủy duyệt khi Ban thi đua lỡ duyệt nhầm: phiếu trở về nháp để sửa
  // lại (xóa cả người/giờ duyệt cũ và người/giờ nộp cũ). Nếu tuần đã chốt
  // thì mở lại luôn tuần — không thì phiếu thành nháp mà tuần vẫn khóa,
  // không sửa được.
  function reopenScore() {
    if (!currentScore || session?.role !== 'admin') return;
    const clsName = state.classes.find(c => c.id === currentScore.classId)?.name ?? '';
    const weekClosed = !!week?.submittedAt;
    if (!window.confirm(weekClosed ? `Hủy duyệt phiếu lớp ${clsName} sẽ mở lại cả ${week?.label} cho tất cả các lớp (tuần đang chốt). Tiếp tục?` : `Mở lại phiếu lớp ${clsName} để sửa? Phiếu trở về bản nháp.`)) return;
    update(prev => ({
      ...prev,
      scores: prev.scores.map(s => s.id === currentScore.id ? { ...s, status: 'draft', returnReason: undefined, approvedBy: undefined, approvedAt: undefined, submittedBy: undefined, submittedAt: undefined } : s),
      weeks: weekClosed && week ? prev.weeks.map(w => w.id === week.id ? { ...w, submittedAt: null, submittedBy: null } : w) : prev.weeks,
    }), weekClosed ? 'Hủy duyệt phiếu + mở lại tuần' : 'Hủy duyệt phiếu', `${clsName} — ${week?.label}${weekClosed ? ' (tuần đã chốt nên mở lại luôn tuần)' : ''}`);
    setMsg(weekClosed ? `Đã hủy duyệt phiếu lớp ${clsName} và mở lại ${week?.label} để sửa.` : `Đã hủy duyệt phiếu lớp ${clsName}. Phiếu trở về nháp để sửa lại.`);
  }
  function closeWeek() {
    if (!week || session?.role !== 'admin') return;
    const missing = state.classes.filter(c => !state.scores.some(s => s.weekId === week.id && s.classId === c.id && s.status === 'approved'));
    if (missing.length) { setErrs([`Chưa chốt được tuần: còn ${missing.length} lớp chưa có phiếu đã duyệt (${missing.map(c => c.name).join(', ')}).`]); return; }
    if (!window.confirm(`Nộp & chốt ${week.label}? Sau khi chốt, các lớp không sửa phiếu được nữa (Ban thi đua vẫn mở lại được).`)) return;
    setErrs([]);
    update(prev => ({ ...prev, weeks: prev.weeks.map(w => w.id === week.id ? { ...w, submittedAt: nowStr(), submittedBy: session?.name } : w) }), 'Nộp & chốt tuần', week.label);
    setMsg(`Đã nộp & chốt ${week.label}.`);
  }
  function reopenWeek() {
    if (!week || session?.role !== 'admin') return;
    if (!window.confirm(`Mở lại ${week.label}? Các lớp sẽ sửa được phiếu trở lại.`)) return;
    update(prev => ({ ...prev, weeks: prev.weeks.map(w => w.id === week.id ? { ...w, submittedAt: null, submittedBy: null } : w) }), 'Mở lại tuần', week.label);
    setMsg(`Đã mở lại ${week.label}.`);
  }
  function copyPrevWeek() {
    if (!draft || !classId) return;
    if (state.weeks.length < 2) { setMsg('Chưa có tuần trước để chép.'); return; }
    // Tuần trước = tuần có số tuần lớn nhất mà nhỏ hơn tuần hiện tại
    // (không dùng vị trí trong mảng — mảng có thể không theo thứ tự).
    const curIdx = state.weeks.findIndex(w => w.id === effectiveWeekId);
    const curNum = curIdx >= 0 ? weekNumberOf(state.weeks[curIdx], curIdx + 1) : 0;
    const prevWeek = state.weeks
      .map((w, i) => ({ w, n: weekNumberOf(w, i + 1) }))
      .filter(x => x.n < curNum)
      .sort((a, b) => b.n - a.n)[0]?.w;
    if (!prevWeek) { setMsg('Chưa có tuần trước để chép.'); return; }
    if (dirty && !window.confirm('Phiếu đang sửa chưa lưu sẽ bị thay bằng số liệu tuần trước. Tiếp tục?')) return;
    const prevScore = state.scores.find(s => s.weekId === prevWeek.id && s.classId === classId);
    if (!prevScore) { setMsg(`Lớp này chưa có phiếu ở ${prevWeek.label}.`); return; }
    // Bỏ trường gộp cũ khi đã có trường tách nhỏ (tránh trừ trùng).
    setDraft(dropLegacyWhenSplit(prevScore.details)); setDirty(true); setMsg(`Đã chép số liệu từ ${prevWeek.label}. Nhớ kiểm tra rồi Lưu & nộp.`);
  }
  async function doExportDocxWeek() {
    if (!week) return;
    // File xếp hạng chỉ gồm phiếu đã duyệt (D2).
    try { const blob = await exportWeekDocx(state, week, true); downloadBlob(blob, safeFilename(`TONG_HOP_THI_DUA_${week.label}_${stamp()}.docx`)); update(s => s, 'Xuất file .docx', week.label); setMsg('Đã tải file .docx tổng hợp tuần.'); }
    catch { setErrs(['Không xuất được file .docx. Thử lại sau.']); }
  }
  async function doExportDocxWeekNoRank() {
    if (!week) return;
    try { const blob = await exportWeekDocxNoRank(state, week); downloadBlob(blob, safeFilename(`TONG_HOP_THI_DUA_${week.label}_KHONG_XEP_HANG_${stamp()}.docx`)); update(s => s, 'Xuất file .docx (không xếp hạng)', week.label); setMsg('Đã tải file .docx tổng hợp tuần (không xếp hạng).'); }
    catch { setErrs(['Không xuất được file .docx. Thử lại sau.']); }
  }
  async function doExportDocxMonth(weeks: Week[], monthName: string) {
    try { const blob = await exportMonthDocx(state, weeks, monthName); downloadBlob(blob, safeFilename(`TONG_HOP_THI_DUA_${monthName}_${stamp()}.docx`)); update(s => s, 'Xuất file .docx tổng hợp tháng', monthName); setMsg(`Đã tải file .docx tổng hợp ${monthName}.`); }
    catch { setErrs(['Không xuất được file .docx tổng hợp tháng. Thử lại sau.']); }
  }
  async function doExportDocxClass() {
    if (!currentScore) return;
    try { const blob = await exportClassDocx(state, currentScore); downloadBlob(blob, safeFilename(`PHIEU_${state.classes.find(c => c.id === currentScore.classId)?.name ?? ''}_${week?.label ?? ''}_${stamp()}.docx`)); setMsg('Đã tải file .docx phiếu lớp.'); }
    catch { setErrs(['Không xuất được file .docx phiếu lớp.']); }
  }
  function exportCsv() {
    if (!week) return;
    const rows = state.scores.filter(s => s.weekId === week.id && s.status === 'approved')
      .sort((a, b) => calcScore(b.details).final - calcScore(a.details).final)
      .map((s, i) => { const c = calcScore(s.details); return [String(i + 1), state.classes.find(cl => cl.id === s.classId)?.name ?? '', hocTapLines(s.details).join('; '), neNepLines(s.details).join('; '), `${c.final}đ-${c.cls}`, STATUS_LABEL[s.status]]; });
    downloadBlob(new Blob([toCsv([['TT', 'Lớp', 'Học tập', 'Nề nếp', 'Tổng điểm - Xếp loại', 'Trạng thái'], ...rows])], { type: 'text/csv;charset=utf-8' }), safeFilename(`XEP_HANG_${week.label}_${stamp()}.csv`));
    update(s => s, 'Xuất file CSV', week.label);
  }
  function exportJson() {
    downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `tong-thi-dua-sao-luu_${stamp()}.json`);
    setMsg('Đã tải file sao lưu JSON. Giữ file này để khôi phục dữ liệu khi cần.');
  }
  // Nhập JSON sao lưu: hỏi xác nhận, tải bản sao lưu hiện tại trước,
  // kiểm tra toàn bộ file rồi mới nhập; file lỗi thì từ chối toàn bộ,
  // dữ liệu hiện tại giữ nguyên.
  function importJson(file: File) {
    if (!window.confirm('Nhập file sao lưu sẽ THAY TOÀN BỘ dữ liệu hiện tại (tuần, lớp, phiếu, phân công, nhật ký). Trước khi nhập, hệ thống sẽ tải về một bản sao lưu JSON của dữ liệu hiện tại. Tiếp tục?')) return;
    exportJson();
    const reader = new FileReader();
    reader.onload = () => {
      let parsed: unknown;
      try { parsed = JSON.parse(String(reader.result)); }
      catch { setErrs(['File sao lưu không đúng định dạng JSON.']); return; }
      const res = validateImportedState(parsed);
      if (!res.ok) { setErrs([`Không nhập được file sao lưu: ${res.error} Dữ liệu hiện tại vẫn giữ nguyên.`]); return; }
      setState(res.state);
      update(s => s, 'Nhập JSON sao lưu', file.name);
      setMsg('Đã nhập dữ liệu sao lưu thành công.');
    };
    reader.readAsText(file);
  }
  function copyZalo() {
    if (!week) return;
    const rows = state.scores.filter(s => s.weekId === week.id && s.status === 'approved').sort((a, b) => calcScore(b.details).final - calcScore(a.details).final);
    const text = `TỔNG HỢP THI ĐUA ${week.label.toUpperCase()}\n` + rows.map((s, i) => `${i + 1}. ${state.classes.find(c => c.id === s.classId)?.name}: ${calcScore(s.details).final}đ-${calcScore(s.details).cls}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => setMsg('Đã chép bảng xếp hạng để gửi Zalo.')).catch(() => setErrs(['Không chép được, trình duyệt chặn clipboard.']));
  }
  // Chép tin nhắn nhắc các lớp chưa nộp phiếu (để gửi Zalo).
  function copyReminder() {
    if (!week) return;
    const missingNames = state.classes.filter(c => !state.scores.some(s => s.weekId === week.id && s.classId === c.id)).map(c => c.name);
    if (!missingNames.length) { setMsg('Tất cả các lớp đã có phiếu.'); return; }
    const text = `Nhắc nộp phiếu thi đua ${week.label.toUpperCase()}${week.dateRange ? ` (${week.dateRange})` : ''}:\nCác lớp chưa nộp phiếu: ${missingNames.join(', ')}.\nNhờ các lớp nộp phiếu đúng hạn nhé. Cảm ơn các lớp!`;
    navigator.clipboard?.writeText(text).then(() => setMsg('Đã chép tin nhắc để gửi Zalo.')).catch(() => setErrs(['Không chép được, trình duyệt chặn clipboard.']));
  }

  const approvedScores = useMemo(() => week ? state.scores.filter(s => s.weekId === week.id && s.status === 'approved').sort((a, b) => calcScore(b.details).final - calcScore(a.details).final) : [], [state.scores, week]);
  const rankedScores = useMemo(() => rankGroup === 'all' ? approvedScores : approvedScores.filter(s => classGroup(state.classes.find(c => c.id === s.classId)?.name ?? '') === rankGroup), [approvedScores, rankGroup, state.classes]);
  const pendingScores = useMemo(() => week ? state.scores.filter(s => s.weekId === week.id && s.status === 'submitted') : [], [state.scores, week]);
  // Cờ đỏ chỉ xem được hoạt động của chính mình trong nhật ký.
  const myLogs = useMemo(() => [...state.logs].reverse().filter(l => l.actor === session?.name), [state.logs, session?.name]);
  const filteredClasses = state.classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const visibleClasses = session?.role === 'codo' && assignment ? state.classes.filter(c => c.id === assignment.classId) : filteredClasses;

  if (!session) {
    // --- Chế độ Supabase: đăng nhập bằng email + mật khẩu ---
    if (isSupabaseConfigured) {
      if (!authReady) {
        return (<div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header><main className="wrap"><div className="card"><p>Đang kiểm tra phiên đăng nhập…</p>{authErr && <><div className="err">{authErr}</div><div className="row"><button className="btn" type="button" onClick={() => { setAuthErr(''); setAuthRetry(r => r + 1); }}>Thử lại</button></div></>}</div></main></div>);
      }
      if (authUser && profile && profile.status === 'rejected') {
        return (
          <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
          <main className="wrap"><div className="card"><h2>Tài khoản của bạn đã bị từ chối</h2>
          <p>Xin chào <b>{profile.full_name}</b> ({profile.email}). Ban thi đua đã từ chối tài khoản này{profile.reject_reason ? ` — lý do: ${profile.reject_reason}` : ''}. Bạn liên hệ Ban thi đua để biết thêm nhé.</p>
          <div className="row"><button className="btn grey" type="button" onClick={handleSignOut}>Đăng xuất</button></div></div></main></div>
        );
      }
      if (authUser && profile && (profile.status === 'pending' || profile.status === 'disabled')) {
        const pendingClasses = state.classes.length > 0 ? state.classes.map(c => ({ id: c.id, name: c.name })) : DUTY_CLASSES.map(c => ({ id: `name:${c}`, name: c }));
        const assignedName = profile.assigned_class_id ? state.classes.find(c => c.id === profile.assigned_class_id)?.name : undefined;
        return (
          <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
          <main className="wrap"><div className="card"><h2>{profile.status === 'pending' ? 'Tài khoản đang chờ Ban thi đua duyệt' : 'Tài khoản đã bị khóa'}</h2>
          <p>Xin chào <b>{profile.full_name}</b> ({profile.email}). {profile.status === 'pending' ? 'Tài khoản của bạn đang chờ Ban thi đua duyệt. Sau khi được duyệt, bạn đăng nhập lại là vào được hệ thống.' : 'Tài khoản của bạn đã bị Ban thi đua khóa. Bạn liên hệ Ban thi đua để được mở lại.'}</p>
          <div className="row"><button className="btn grey" type="button" onClick={handleSignOut}>Đăng xuất</button></div></div>
          {profile.status === 'pending' && (profile.role === 'codo' || profile.role === 'viewer') && (
            <div className="card"><h2>Hoàn thiện thông tin của bạn</h2>
            <p>{profile.role === 'codo' ? 'Trong lúc chờ duyệt, bạn chọn sẵn lớp mình đang học để Ban thi đua khỏi phải hỏi lại nhé. Tuần trực thì Ban thi đua sẽ gán cho bạn khi duyệt.' : 'Trong lúc chờ duyệt, bạn chọn sẵn lớp mình chủ nhiệm để Ban thi đua khỏi phải hỏi lại nhé.'}</p>
            <label>{profile.role === 'codo' ? 'Lớp của bạn' : 'Lớp chủ nhiệm'}</label>
            {state.classes.length === 0 && <p>Danh sách lớp chưa tải được — chọn theo danh sách cố định bên dưới, hệ thống sẽ khớp lớp khi có dữ liệu.</p>}
            {profile.assigned_class_id && !assignedName && <p>Đã gán lớp cho bạn rồi (đang chờ tải danh sách lớp để hiện tên).</p>}
            <select value={pendingClassId || (assignedName ? profile.assigned_class_id ?? '' : '')} onChange={e => setPendingClassId(e.target.value)}>
              <option value="">— Chọn lớp —</option>
              {pendingClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" disabled={pendingBusy} onClick={savePendingClass}>{pendingBusy ? 'Đang lưu…' : 'Lưu lớp của tôi'}</button>
              <button className="btn ghost" type="button" onClick={() => { setPendingErr(''); setPendingRetry(r => r + 1); }}>Thử lại tra lớp</button>
            </div>
            {pendingMsg && <div className="ok">{pendingMsg}</div>}
            {pendingErr && <div className="err">{pendingErr}</div>}
            </div>
          )}
          </main></div>
        );
      }
      if (authUser && !profile) {
        return (<div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header><main className="wrap"><div className="card"><p>Đang tải hồ sơ tài khoản…</p>{profileErr && <><div className="err">{profileErr}</div><div className="row"><button className="btn" type="button" onClick={() => { setProfileErr(''); setProfileRetry(r => r + 1); }}>Thử lại</button></div></>}<div className="row"><button className="btn grey" type="button" onClick={handleSignOut}>Đăng xuất</button></div></div></main></div>);
      }
      return (
        <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
        <main className="wrap"><AuthScreen initialMode={recoveryMode ? 'reset' : undefined} onRecoveryDone={() => setRecoveryMode(false)} />{profileErr && <div className="err">{profileErr}</div>}{authErr && <div className="err">{authErr}</div>}{msg && <div className="ok">{msg}</div>}</main></div>
      );
    }
    // --- Chế độ cũ (chưa cấu hình Supabase): chọn vai trò, dữ liệu trên máy này ---
    return (
      <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
      <main className="wrap"><div className="card"><h2>Chọn vai trò để vào hệ thống</h2><p>Ban thi đua quản lý toàn bộ. Cờ đỏ chỉ nhập lớp được phân công. Chỉ xem không được nhập hay sửa.</p>
      <p><b>CHƯA CẤU HÌNH SUPABASE — dữ liệu chỉ lưu trên máy này, không đồng bộ.</b> Dữ liệu và vai trò chỉ lưu trên trình duyệt này; muốn đăng nhập dùng chung cho mọi máy, cấu hình Supabase theo hướng dẫn trong README.</p>
      <div className="rolecard">
        <button type="button" onClick={() => { if (!window.confirm('Chế độ trên máy này chưa cấu hình Supabase. Vai trò Ban thi đua tự chọn chỉ dùng để thử trên máy này, không đồng bộ với ai. Bạn có chắc muốn vào với vai trò Ban thi đua?')) return; setSession({ role: 'admin', name: state.settings.signer }); }}><b>Ban thi đua</b><br />{state.settings.signer} — toàn quyền: tạo tuần/lớp, phân công cờ đỏ, duyệt, chốt tuần, xuất file.</button>
        <button type="button" onClick={() => { const names = state.roster.filter(r => r.active).map(r => r.name); if (!names.length) { setMsg('Chưa có cờ đỏ nào được phân công. Nhờ Ban thi đua thêm ở tab Quản lý.'); return; } const n = window.prompt('Nhập đúng tên cờ đỏ của bạn:\n' + names.join(', ')); if (n && names.includes(n.trim())) setSession({ role: 'codo', name: n.trim() }); else if (n) setMsg('Tên này không có trong danh sách phân công.'); }}><b>Cờ đỏ trực</b><br />Chọn đúng tên được phân công, hệ thống tự mở lớp của bạn để nhập trực tiếp.</button>
        <button type="button" onClick={() => setSession({ role: 'viewer', name: 'Khách xem' })}><b>Chỉ xem (GVCN / BGH)</b><br />Chỉ xem xếp hạng, phiếu và tổng hợp, không nhập, không sửa.</button>
      </div>{msg && <div className="warn">{msg}</div>}</div></main></div>
    );
  }

  // Phiên khôi phục mật khẩu (bấm link trong email): hiện form đặt mật
  // khẩu mới thay vì app chính, kể cả khi hồ sơ đã duyệt.
  if (recoveryMode && isSupabaseConfigured) {
    return (
      <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
      <main className="wrap"><AuthScreen initialMode="reset" onRecoveryDone={() => setRecoveryMode(false)} /></main></div>
    );
  }

  // Thanh tab theo vai trò: Cờ đỏ không thấy tab Quản lý (chỉ Ban thi đua
  // mới quản lý được); Chỉ xem không thấy Quản lý lẫn Lịch sử (không có
  // nội dung gì cho vai trò này ở 2 tab đó).
  const allTabs: [string, string][] = [['tong-quan', 'Tổng quan'], ['nhap-diem', 'Nhập điểm'], ['xep-hang', 'Xếp hạng'], ['tong-hop', 'Tổng hợp'], ['quan-ly', 'Quản lý'], ['lich-su', 'Lịch sử']];
  const tabs: [string, string][] = allTabs.filter(([k]) => {
    if (k === 'quan-ly') return session.role === 'admin';
    if (k === 'lich-su') return session.role !== 'viewer';
    return true;
  });
  return (
    <div>
      <div className="top-sticky">
      {!isSupabaseConfigured && <div className="local-banner">CHƯA CẤU HÌNH SUPABASE — dữ liệu chỉ lưu trên máy này, không đồng bộ</div>}
      {updateAvailable && !updateDismissed && (
        <div className="update-banner">
          <span>Đã có bản cập nhật mới của app.</span>
          <button type="button" onClick={() => { if (dirty && !window.confirm('Phiếu đang nhập dở chưa lưu — cập nhật ngay sẽ mất phần chưa lưu. Cập nhật luôn?')) return; window.location.reload(); }}>Cập nhật ngay</button>
          <button type="button" className="ghost" onClick={() => setUpdateDismissed(true)}>Để sau</button>
        </div>
      )}
      <header className="top"><div className="top-inner">
        <div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div>
        <div className="userbox">
          <span className="chip">{week ? week.label : 'Chưa có tuần'}</span>
          {isSupabaseConfigured ? (
            conflict ? <span className="chip sync-err">Có bản mới hơn — xem banner bên dưới</span>
            : syncStatus === 'error' ? <button type="button" className="chip sync-err" title={syncErr} onClick={() => { setSyncErr(''); setSyncStatus('saving'); setSyncRetry(r => r + 1); }}>Lỗi đồng bộ — Thử lại</button>
            : syncStatus === 'saving' ? <span className="chip sync-saving">Đang lưu…</span>
            : syncStatus === 'synced' ? <span className="chip sync-ok">Đã đồng bộ lúc {syncTime}</span>
            : <span className="chip">Chưa đồng bộ</span>
          ) : (
            syncStatus === 'error' ? <span className="chip sync-err" title={syncErr}>Lỗi lưu trên máy này</span> : <span className="chip">Chỉ lưu trên máy này</span>
          )}
          {session.role === 'codo' && assignment?.classId && <span className="chip">{assignment.source === 'roster' ? 'Trực lớp' : 'Lớp'} {state.classes.find(c => c.id === assignment.classId)?.name}</span>}
          <span className="chip rolebadge">{roleLabel}</span>
          <span className="chip"><span className="who">{session.name}</span></span>
          {showInstall && <button type="button" className="btn logout" onClick={installApp}>Cài app</button>}
          <button type="button" className="btn logout" onClick={handleSignOut}>{isSupabaseConfigured ? 'Đăng xuất' : 'Đổi vai trò'}</button>
        </div>
      </div></header>
      </div>
      <main className="wrap">
        <div className="tabs">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => switchTab(k)}>{l}</button>)}</div>
        {msg && <div className="ok">{msg}</div>}
        {errs.length > 0 && <div className="err">{errs.map((e, i) => <div key={i}>• {e}</div>)}</div>}
        {bootErr && <div className="err">{bootErr} <button type="button" className="btn ghost" onClick={() => setBootErr('')}>Đã hiểu</button></div>}
        {conflict && (
          <div className="warn" style={{ borderColor: '#dc2626', background: '#fef2f2' }}>
            <b>Có máy khác vừa lưu mới hơn.</b> Bản của bạn chưa bị ghi đè — chọn một trong hai cách xử lý:
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" type="button" onClick={() => void resolveConflict(false)}>Xem bản mới</button>
              <button className="btn grey" type="button" onClick={() => void resolveConflict(true)}>Giữ bản của tôi (ghi đè, có xác nhận)</button>
            </div>
          </div>
        )}
        {session.role === 'codo' && assignment && <div className="warn">Bạn đang nhập cho lớp {state.classes.find(c => c.id === assignment.classId)?.name}{assignment.source === 'roster' ? ' (lớp bạn trực)' : ''} — {state.weeks.find(w => w.id === assignment.weekId)?.label}. Chỉ nhập và nộp được lớp này.</div>}
        {currentScore?.status === 'returned' && <div className="err">Phiếu bị trả lại — lý do: {currentScore.returnReason}. Sửa lại rồi nộp lại nhé.</div>}

        {loadFailed ? (
          <div className="card"><h2>Chưa tải được dữ liệu dùng chung</h2>
            <p>{syncErr || 'Chưa tải được dữ liệu dùng chung từ Supabase.'}</p>
            <p>Để tránh ghi đè mất dữ liệu chung, app chưa đẩy dữ liệu trên máy này lên. Bạn thử tải lại, hoặc dùng tạm dữ liệu trên máy này (không đồng bộ) rồi báo Ban thi đua kiểm tra Supabase.</p>
            <div className="row">
              <button className="btn" type="button" onClick={() => { setLoadFailed(false); setLoadAttempt(a => a + 1); }}>Thử lại</button>
              <button className="btn grey" type="button" onClick={() => { setUseLocalOnly(true); setLoadFailed(false); setMsg('Đang dùng dữ liệu trên máy này (không đồng bộ).'); }}>Dùng dữ liệu trên máy này</button>
            </div>
          </div>
        ) : (<>

        {tab === 'tong-quan' && <Overview state={state} week={week} role={session.role} assignment={assignment?.classId && assignment?.weekId ? { classId: assignment.classId, weekId: assignment.weekId, homeClassId: assignment.homeClassId ?? undefined, source: assignment.source } : undefined} homeClassId={profile?.assigned_class_id ?? undefined} onEnterScores={() => { if (assignment) { if (!confirmDirty()) return; setWeekId(assignment.weekId); setClassId(assignment.classId); setTab('nhap-diem'); setDirty(false); } }} onGoTab={switchTab} onCopyReminder={copyReminder} onOpenClass={(cid: string) => { if (confirmDirty()) { setWeekId(effectiveWeekId); setClassId(cid); setTab('nhap-diem'); setDirty(false); } }} />}
        {tab === 'nhap-diem' && (!week ? (
          <div className="card"><h2>Nhập điểm</h2><p>Chưa có tuần nào nên chưa nhập điểm được.</p>{session.role === 'admin' ? <><p>Tạo tuần đầu tiên để bắt đầu chấm thi đua nhé.</p><div className="row"><button className="btn" type="button" onClick={() => setTab('quan-ly')}>Sang tab Quản lý tạo tuần</button></div></> : <p>Nhờ Ban thi đua tạo tuần nhé.</p>}</div>
        ) : session.role === 'codo' && (!assignment || showDutyPicker) ? (
          <DutyPicker state={state} week={week} homeName={profile?.assigned_class_id ? state.classes.find(c => c.id === profile.assigned_class_id)?.name : undefined} myName={session.name} initialClassId={assignment?.classId} onConfirm={confirmDutyPick} onCancel={assignment ? () => setShowDutyPicker(false) : undefined} />
        ) : draft && (
          <>
            {session.role === 'codo' && assignment && (
              <div className="row" style={{ marginBottom: 10 }}><button className="btn ghost" type="button" onClick={() => setShowDutyPicker(true)}>Đổi lớp trực</button><span>Bạn đang trực lớp {state.classes.find(c => c.id === assignment.classId)?.name} — {week.label}.</span></div>
            )}
            {session.role === 'admin' && pendingScores.length > 0 && (
              <div className="row" style={{ marginBottom: 10 }}><button className="btn green" type="button" onClick={approveAllScores}>Duyệt tất cả {pendingScores.length} phiếu đã nộp</button><span>Còn {pendingScores.length} phiếu chờ duyệt trong {week.label}.</span></div>
            )}
            <ScoreForm state={state} week={week} draft={draft} calc={calc} canEdit={canEdit} classId={classId} setClassId={switchClass} weekId={effectiveWeekId} setWeekId={(id: string) => { if (confirmDirty()) setWeekId(id); }} search={search} setSearch={setSearch} classes={visibleClasses} currentScore={currentScore} setD={setD} dirty={dirty} onSaveDraft={() => saveScore('draft')} onSubmit={() => saveScore('submitted')} onApprove={approveScore} onReturn={returnScore} returnReason={returnReason} setReturnReason={setReturnReason} onReopen={reopenScore} onCopyPrev={copyPrevWeek} onShowPhieu={() => setShowPhieu(true)} showPhieu={showPhieu} onExportClass={doExportDocxClass} sessionRole={session.role} />
          </>
        ))}
        {tab === 'xep-hang' && (week ? (
          <div className="card"><h2>Xếp hạng — {week.label} {week.submittedAt ? <span className="badge approved">Đã nộp {week.submittedAt}</span> : <span className="badge draft">Chưa chốt tuần</span>}</h2>
            <p>Chỉ phiếu <b>đã duyệt</b> mới vào xếp hạng chính thức. Còn {pendingScores.length} phiếu chờ duyệt, {state.classes.length - approvedScores.length} lớp chưa có phiếu duyệt.</p>
            <div className="row"><span><b>Khối:</b></span>{(['all', 'tu-nhien', 'xa-hoi'] as const).map(g => <button key={g} type="button" className={rankGroup === g ? 'seg on' : 'seg'} onClick={() => setRankGroup(g)}>{g === 'all' ? 'Tất cả' : groupLabel(g)}</button>)}</div>
            <ol className="ranklist">
              {rankedScores.map((s, i) => { const c = calcScore(s.details); const clsName = state.classes.find(x => x.id === s.classId)?.name ?? s.classId; return (
                <li key={s.id} className={i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}>
                  <span className="rank">{i + 1}</span>
                  <span className="rclass"><b>{clsName}</b><small>{s.submittedBy ?? '—'}{s.submittedAt ? ` · ${s.submittedAt}` : ''}</small></span>
                  <span className="rscore"><b>{c.final}đ</b><span className={`badge ${c.cls}`}>{c.cls}</span></span>
                </li>); })}
              {rankedScores.length === 0 && <li>Chưa có lớp nào được duyệt trong tuần này{rankGroup === 'all' ? '' : ` ở ${groupLabel(rankGroup)}`}.</li>}
            </ol>
            <h3>Xuất file</h3>
            <div className="exportgrid"><button className="btn ghost" type="button" onClick={doExportDocxWeek}>Xuất Word (.docx)</button><button className="btn ghost" type="button" onClick={doExportDocxWeekNoRank}>Xuất .docx (không xếp hạng)</button><button className="btn ghost" type="button" onClick={exportCsv}>Tải CSV</button><button className="btn ghost" type="button" onClick={copyZalo}>Chép gửi Zalo</button></div>
            {session.role === 'admin' && <div className="divider">{week.submittedAt ? <button className="btn grey" type="button" onClick={reopenWeek}>Mở lại tuần</button> : <button className="btn green" type="button" onClick={closeWeek}>Nộp &amp; chốt tuần này</button>}</div>}
          </div>
        ) : (
          <div className="card"><h2>Xếp hạng</h2><p>Chưa có tuần nào nên chưa có bảng xếp hạng.</p>{session.role === 'admin' ? <><p>Tạo tuần đầu tiên để bắt đầu chấm thi đua nhé.</p><div className="row"><button className="btn" type="button" onClick={() => setTab('quan-ly')}>Sang tab Quản lý tạo tuần</button></div></> : <p>Nhờ Ban thi đua tạo tuần nhé.</p>}</div>
        ))}
        {tab === 'tong-hop' && <SummaryTab state={state} onExportMonth={doExportDocxMonth} />}
        {tab === 'quan-ly' && <ManageTab state={state} setState={setState} session={session} onLog={(a: string, d: string) => update(s => s, a, d)} onExportJson={exportJson} onImportJson={importJson} profiles={profiles} onProfilePatch={patchProfile} onProfileDelete={removeProfile} onRefreshProfiles={() => { if (isSupabaseConfigured) listProfiles().then(setProfiles).catch(() => undefined); }} />}
        {tab === 'lich-su' && (
          <div className="card"><h2>Lịch sử hoạt động</h2>
          {session.role === 'admin' ? (state.logs.length === 0 ? <p>Chưa có hoạt động nào.</p> : <>
            <div className="tablewrap log-table-wrap"><table className="log-table"><thead><tr><th>Thời gian</th><th>Người làm</th><th>Vai trò</th><th>Việc làm</th><th>Chi tiết</th></tr></thead><tbody>{[...state.logs].reverse().map(l => <tr key={l.id}><td>{l.time}</td><td>{l.actor}</td><td>{l.role}</td><td>{l.action}</td><td>{l.detail}</td></tr>)}</tbody></table></div>
            <div className="log-list">{[...state.logs].reverse().map(l => <div key={l.id} className="log-item"><b>{l.action}</b>{l.detail ? ` — ${l.detail}` : ''}<div className="meta">{l.actor} • {l.role} • {l.time}</div></div>)}</div>
          </>) : session.role === 'codo' ? (
            myLogs.length === 0 ? <p>Bạn chưa có hoạt động nào được ghi lại.</p> : <div className="log-list always">{myLogs.map(l => <div key={l.id} className="log-item"><b>{l.action}</b>{l.detail ? ` — ${l.detail}` : ''}<div className="meta">{l.time}</div></div>)}</div>
          ) : <p>Vai trò Chỉ xem không xem được nhật ký chi tiết.</p>}
          </div>
        )}
        </>)}
      </main>
    </div>
  );
}

// Cờ đỏ tự chọn lớp mình trực trong tuần hiện tại. Lớp gợi ý lấy theo
// lịch trực từ lớp của chính cờ đỏ; chọn lớp khác vẫn được (vd trực thay).
// Chặn nhập thay: lớp đã có cờ đỏ khác trực, hoặc phiếu đã nộp/duyệt thì
// không chọn được nữa (phiếu đã duyệt là khóa hẳn, chỉ Ban thi đua mở lại).
function DutyPicker({ state, week, homeName, myName, initialClassId, onConfirm, onCancel }: {
  state: AppState; week: Week; homeName?: string; myName: string; initialClassId?: string;
  onConfirm: (classId: string) => void; onCancel?: () => void;
}) {
  const suggested = homeName ? dutyMonitored(homeName, weekNumberOf(week, state.weeks.indexOf(week) + 1)) : null;
  const [sel, setSel] = useState(initialClassId ?? state.classes.find(c => c.name === suggested)?.id ?? '');
  const existing = sel ? state.scores.find(s => s.weekId === week.id && s.classId === sel) : undefined;
  const otherDuty = sel ? state.roster.find(r => r.weekId === week.id && r.classId === sel && r.active && r.name !== myName) : undefined;
  const locked = existing && (existing.status === 'submitted' || existing.status === 'approved');
  return (
    <div className="card"><h2>Chọn lớp trực — {week.label}</h2>
      <p>Tuần này bạn trực lớp nào? Chọn lớp rồi nhập điểm cho lớp đó nhé. Lớp đã chọn sẽ lưu lại để Ban thi đua thấy.</p>
      {suggested && <p>Theo lịch trực, cờ đỏ lớp {homeName} trực lớp <b>{suggested}</b> tuần này.</p>}
      <label>Lớp trực</label>
      <select value={sel} onChange={e => setSel(e.target.value)}>
        <option value="">— Chọn lớp —</option>
        {state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {otherDuty && <p>Lớp {state.classes.find(c => c.id === sel)?.name} đã có cờ đỏ {otherDuty.name} trực tuần này — bạn liên hệ Ban thi đua nếu trực thay nhé.</p>}
      {existing && locked && <p>Lớp {state.classes.find(c => c.id === sel)?.name} đã có phiếu {STATUS_LABEL[existing.status]} — phiếu đã khóa, không nhập lại được.</p>}
      {existing && !locked && <p>Lớp {state.classes.find(c => c.id === sel)?.name} đã có phiếu {STATUS_LABEL[existing.status]} — bấm vào để nhập tiếp.</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" type="button" disabled={!sel || !!otherDuty || !!locked} onClick={() => onConfirm(sel)}>Bắt đầu nhập điểm lớp này</button>
        {onCancel && <button className="btn grey" type="button" onClick={onCancel}>Hủy</button>}
      </div>
    </div>
  );
}

function Overview({ state, week, role, assignment, homeClassId, onEnterScores, onGoTab, onCopyReminder, onOpenClass }: {
  state: AppState; week?: Week;
  role: Role;
  assignment?: { classId: string; weekId: string; homeClassId?: string; source?: 'roster' | 'profile' };
  homeClassId?: string;
  onEnterScores: () => void;
  onGoTab?: (tab: string) => void;
  onCopyReminder?: () => void;
  onOpenClass?: (classId: string) => void;
}) {
  // Cờ đỏ: chỉ thấy phần việc của mình — lớp, tuần, trạng thái phiếu và
  // vi phạm của chính lớp mình. Không thấy số liệu toàn trường, danh sách
  // lớp cần nhắc hay cảnh báo duyệt (việc của Ban thi đua).
  if (role === 'codo') {
    const clsName = assignment ? state.classes.find(c => c.id === assignment.classId)?.name : undefined;
    const homeName = assignment?.homeClassId ? state.classes.find(c => c.id === assignment.homeClassId)?.name : undefined;
    const wk = assignment ? state.weeks.find(w => w.id === assignment.weekId) : undefined;
    const myScore = assignment ? state.scores.find(s => s.weekId === assignment.weekId && s.classId === assignment.classId) : undefined;
    const myCalc = myScore ? calcScore(myScore.details) : undefined;
    const myViol = myScore ? violationStats([myScore], state.classes) : null;
    return (
      <div>
        <div className="card"><h2>Lớp của bạn</h2>
          {!assignment || !clsName || !wk ? (
            <>
              <p>Bạn chưa có phân công tuần này. Bạn tự chọn lớp mình trực ở tab Nhập điểm nhé.</p>
              <div className="row"><button className="btn" type="button" onClick={() => onGoTab?.('nhap-diem')}>Chọn lớp trực để nhập điểm</button></div>
            </>
          ) : (
            <>
              {homeName && homeName !== clsName ? (
                <p>Lớp của bạn: <b>{homeName}</b> — Tuần này bạn trực lớp <b>{clsName}</b> — {wk.label} {wk.dateRange}</p>
              ) : assignment?.source === 'roster' ? (
                <p>Tuần này bạn trực lớp <b>{clsName}</b> — {wk.label} {wk.dateRange}</p>
              ) : (
                <p><b>{clsName}</b> — {wk.label} {wk.dateRange}</p>
              )}
              {!myScore ? <p>Chưa nhập phiếu tuần này.</p> : (
                <p>Phiếu tuần này: <b>{STATUS_LABEL[myScore.status]}</b>{myScore.status === 'returned' && myScore.returnReason ? ` — lý do: ${myScore.returnReason}` : ''}{myCalc ? ` — ${myCalc.final}đ, loại ${myCalc.cls}` : ''}</p>
              )}
              <div className="row"><button className="btn" type="button" onClick={onEnterScores}>Nhập điểm lớp trực</button></div>
            </>
          )}
        </div>
        {myViol && (
          <div className="card"><h2>Vi phạm của lớp bạn{wk ? ` — ${wk.label}` : ''}</h2>
            {myViol.topViolations.length === 0 ? <p>Phiếu tuần này của lớp bạn chưa ghi nhận vi phạm nào.</p> : (
              <>
                <p>Tổng {myViol.totalCount} lượt vi phạm theo phiếu tuần này.</p>
                {myViol.topViolations.map(v => (
                  <div key={v.key} className="vbar-row"><span className="vbar-label">{v.label}</span><div className="vbar"><div style={{ width: `${Math.max(4, Math.round((v.count / myViol.topViolations[0].count) * 100))}%` }} /></div><b>{v.count} lượt</b></div>
                ))}
              </>
            )}
          </div>
        )}
        <div className="card"><h2>Quy trình làm việc</h2>
          <div className="steps"><span>1. Nháp</span><i>→</i><span>2. Cờ đỏ nộp</span><i>→</i><span>3. Ban thi đua duyệt</span><i>→</i><span>4. Chốt tuần</span></div>
          <p>Chỉ phiếu đã duyệt mới vào xếp hạng chính thức. Trả lại phải kèm lý do.</p>
        </div>
      </div>
    );
  }
  // Ban thi đua / Chỉ xem: bảng tổng hợp toàn trường.
  const total = state.classes.length;
  const approved = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'approved').length : 0;
  const submitted = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'submitted').length : 0;
  const missing = state.classes.filter(c => !week || !state.scores.some(s => s.weekId === week.id && s.classId === c.id));
  const pending = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'submitted') : [];
  const returned = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'returned') : [];
  const anomalies = week ? state.scores.filter(s => s.weekId === week.id && (calcScore(s.details).final > 150 || calcScore(s.details).final < 50)) : [];
  // Vi phạm: chỉ tính phiếu đã duyệt của tuần hiện tại.
  const approvedWeek = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'approved') : [];
  // Lớp của tôi (GVCN): tài khoản Chỉ xem được gán lớp chủ nhiệm thì thấy
  // ngay điểm, hạng và vi phạm của lớp mình ở đầu trang.
  const myHomeClass = role === 'viewer' && homeClassId ? state.classes.find(c => c.id === homeClassId) : undefined;
  const myHomeScore = myHomeClass && week ? state.scores.find(s => s.weekId === week.id && s.classId === myHomeClass.id) : undefined;
  const myHomeCalc = myHomeScore ? calcScore(myHomeScore.details) : undefined;
  const myHomeRank = myHomeScore && approvedWeek.length ? [...approvedWeek].sort((a, b) => calcScore(b.details).final - calcScore(a.details).final).findIndex(s => s.classId === myHomeClass!.id) + 1 : 0;
  const myHomeViol = myHomeScore ? violationStats([myHomeScore], state.classes) : null;
  const viol = violationStats(approvedWeek, state.classes);
  const violMax = viol.topViolations.length ? viol.topViolations[0].count : 0;
  return (
    <div>
      {myHomeClass && (
        <div className="card"><h2>Lớp của tôi — {myHomeClass.name}</h2>
          {!week ? <p>Chưa có tuần nào.</p> : !myHomeScore ? <p>{week.label}: lớp bạn chưa có phiếu.</p> : (
            <p>{week.label}: <b>{myHomeCalc?.final}đ, loại {myHomeCalc?.cls}</b> — {STATUS_LABEL[myHomeScore.status]}{myHomeRank > 0 ? ` — hạng ${myHomeRank}/${approvedWeek.length}` : ''}</p>
          )}
          {myHomeViol && myHomeViol.topViolations.length > 0 && <p>Vi phạm thường gặp: {myHomeViol.topViolations.slice(0, 3).map(v => `${v.label} ×${v.count}`).join(', ')}.</p>}
          <div className="row"><button className="btn ghost" type="button" onClick={() => onGoTab?.('xep-hang')}>Xem xếp hạng</button></div>
        </div>
      )}
      <div className="kpi">
        <div><b>{state.weeks.length}</b>Tuần</div><div><b>{total}</b>Lớp</div>
        <button type="button" className="kpi-btn" onClick={() => onGoTab?.('xep-hang')}><b>{approved}/{total}</b>Đã duyệt</button>
        <button type="button" className="kpi-btn" onClick={() => onGoTab?.('nhap-diem')}><b>{submitted}</b>Chờ duyệt</button>
      </div>
      {week && <p>Tuần hiện tại: <b>{week.label}</b> {week.dateRange} {week.submittedAt ? `— Đã nộp ${week.submittedAt}` : '— Chưa chốt'}</p>}
      <div className="card"><h2>Cần xử lý ngay{week ? ` — ${week.label}` : ''}</h2>
        {!week ? <p>Chưa có tuần nào.</p> : pending.length === 0 && returned.length === 0 && missing.length === 0 ? <p>Không có việc nào cần xử lý — tất cả các lớp đã được duyệt.</p> : (<div>
          {pending.length > 0 && <><p><b>Chờ duyệt ({pending.length}):</b></p>{pending.map(s => (
            <div key={s.id} className="warn-row"><div><b>{state.classes.find(c => c.id === s.classId)?.name}</b> — {calcScore(s.details).final}đ, loại {calcScore(s.details).cls}</div><div className="row">{onOpenClass && <button className="btn ghost" type="button" onClick={() => onOpenClass(s.classId)}>Xem phiếu</button>}</div></div>
          ))}</>}
          {returned.length > 0 && <><p><b>Bị trả lại ({returned.length}):</b></p>{returned.map(s => (
            <div key={s.id} className="warn-row"><div><b>{state.classes.find(c => c.id === s.classId)?.name}</b>{s.returnReason ? ` — ${s.returnReason}` : ''}</div><div className="row">{onOpenClass && <button className="btn ghost" type="button" onClick={() => onOpenClass(s.classId)}>Xem phiếu</button>}</div></div>
          ))}</>}
          {missing.length > 0 && <p><b>Chưa nộp phiếu ({missing.length}):</b> {missing.map(c => <span key={c.id} className="chip-mini">{c.name}</span>)}</p>}
        </div>)}
      </div>
      <div className="card"><h2>Vi phạm thường gặp{week ? ` — ${week.label}` : ''}</h2>
        {!week ? <p>Chưa có tuần nào nên chưa có thống kê vi phạm. Tạo tuần ở tab Quản lý để bắt đầu.</p> : viol.topViolations.length === 0 ? <p>Chưa ghi nhận lượt vi phạm nào trong các phiếu đã duyệt của tuần này.</p> : (
          <>
            <p>Chỉ tính phiếu đã duyệt — tổng {viol.totalCount} lượt vi phạm.</p>
            {viol.topViolations.map(v => (
              <div key={v.key} className="vbar-row"><span className="vbar-label">{v.label}</span><div className="vbar"><div style={{ width: `${Math.max(4, Math.round((v.count / violMax) * 100))}%` }} /></div><b>{v.count} lượt</b></div>
            ))}
          </>
        )}
      </div>
      <div className="card"><h2>Cảnh báo lớp vi phạm{week ? ` — ${week.label}` : ''}</h2>
        {!week ? <p>Chưa có tuần nào nên chưa có cảnh báo.</p> : viol.classWarnings.length === 0 ? <p>Chưa ghi nhận lượt vi phạm nào trong các phiếu đã duyệt của tuần này.</p> : (
          <div>{viol.classWarnings.map(c => (
            <div key={c.classId} className="warn-row">
              <div><b>{c.name}</b> — {c.total} lượt vi phạm</div>
              <div>Hay vi phạm: {c.top.map(t => `${t.label} ×${t.count}`).join(', ')}</div>
              <div className="row">{c.total >= 5 && <span className="badge warn">Cần nhắc nhở</span>}{onOpenClass && <button className="btn ghost" type="button" onClick={() => onOpenClass(c.classId)}>Xem phiếu</button>}</div>
            </div>
          ))}</div>
        )}
      </div>
      <div className="card"><h2>Lớp cần nhắc</h2>{!week ? <p>Chưa có tuần nào — tạo tuần ở tab Quản lý để bắt đầu chấm.</p> : missing.length === 0 ? <p>Tất cả các lớp đã có phiếu.</p> : <><p>{missing.map(c => <span key={c.id} className="chip-mini">{c.name}</span>)}</p><div className="row"><button className="btn ghost" type="button" onClick={() => onCopyReminder?.()}>Chép tin nhắc Zalo</button></div></>}</div>
      {anomalies.length > 0 && <div className="card"><h2>Cảnh báo bất thường</h2>{anomalies.map(s => <p key={s.id}>Lớp {state.classes.find(c => c.id === s.classId)?.name}: {calcScore(s.details).final}đ — kiểm tra lại số liệu trước khi duyệt.</p>)}</div>}
      <div className="card"><h2>Quy trình làm việc</h2>
        <div className="steps"><span>1. Nháp</span><i>→</i><span>2. Cờ đỏ nộp</span><i>→</i><span>3. Ban thi đua duyệt</span><i>→</i><span>4. Chốt tuần</span></div>
        <p>Chỉ phiếu đã duyệt mới vào xếp hạng chính thức. Trả lại phải kèm lý do.</p></div>
    </div>
  );
}

function SummaryTab({ state, onExportMonth }: { state: AppState; onExportMonth?: (weeks: Week[], monthName: string) => void }) {
  const [mode, setMode] = useState<'week' | 'month' | 'group'>('week');
  // Các tháng có tuần, xếp theo khối 4 tuần của năm học (Tháng 9 rồi tới Tháng 10...).
  const months = useMemo(() => {
    const map = new Map<number, Week[]>();
    state.weeks.forEach((w, i) => { const b = monthBlockOf(w, i + 1); const arr = map.get(b) ?? []; arr.push(w); map.set(b, arr); });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [state.weeks]);
  const [monthSel, setMonthSel] = useState<number | ''>('');
  const selMonth = monthSel === '' ? (months.length ? months[months.length - 1][0] : 0) : monthSel;
  const monthWeeks = months.find(([m]) => m === selMonth)?.[1] ?? [];
  const avg = (classId: string, weekIds?: string[]) => classAvg(state, classId, weekIds ?? state.weeks.map(w => w.id));
  const cov = (classId: string, weekIds?: string[]) => classCoverage(state, classId, weekIds ?? state.weeks.map(w => w.id));
  const ranked = [...state.classes].map(c => ({ c, a: avg(c.id), cov: cov(c.id) })).sort((x, y) => compareAvg(x.a, y.a));
  const monthRows = [...state.classes].map(c => ({ c, a: avg(c.id, monthWeeks.map(w => w.id)), cov: cov(c.id, monthWeeks.map(w => w.id)) })).sort((x, y) => compareAvg(x.a, y.a));
  const groupRows = (g: ClassGroup | null) => [...state.classes].filter(c => classGroup(c.name) === g).map(c => ({ c, a: avg(c.id), cov: cov(c.id) })).sort((x, y) => compareAvg(x.a, y.a));
  // Hạng chỉ đếm lớp có điểm trung bình (lớp chưa có phiếu duyệt: "—"),
  // kèm độ phủ nộp "nộp n/m tuần" để thấy lớp nào chưa nộp đủ.
  const groupTable = (title: string, rows: { c: ClassItem; a: number | null; cov: { approved: number; total: number } }[]) => {
    let rank = 0;
    return (
      <div className="card"><h2>{title}</h2>
        {rows.length === 0 ? <p>Chưa có lớp nào trong khối này.</p> : <div className="tablewrap slim"><table><thead><tr><th>Hạng</th><th>Lớp</th><th>Điểm TB</th><th>Loại</th><th>Nộp</th></tr></thead><tbody>
          {rows.map(({ c, a, cov: cv }) => <tr key={c.id}><td>{a === null ? '—' : ++rank}</td><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td><td>{a === null ? '—' : <span className={`badge ${clsOf(a)}`}>{clsOf(a)}</span>}</td><td>nộp {cv.approved}/{cv.total} tuần</td></tr>)}
        </tbody></table></div>}
      </div>
    );
  };
  let monthRank = 0;
  return (
    <div>
      <div className="tabs">
        <button type="button" className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Theo tuần</button>
        <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Theo tháng</button>
        <button type="button" className={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}>Theo khối</button>
      </div>
      {mode === 'week' && (
        <div className="card"><h2>Tổng hợp theo điểm trung bình qua các tuần</h2><p>Chỉ tính phiếu đã duyệt.</p>
          <div className="tablewrap"><table><thead><tr><th>Lớp</th><th>Điểm TB</th><th>Nộp</th>{state.weeks.map(w => <th key={w.id}>{w.label}</th>)}</tr></thead><tbody>
            {ranked.map(({ c, a, cov: cv }) => <tr key={c.id}><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td><td>nộp {cv.approved}/{cv.total} tuần</td>{state.weeks.map(w => { const s = state.scores.find(x => x.weekId === w.id && x.classId === c.id && x.status === 'approved'); return <td key={w.id}>{s ? `${calcScore(s.details).final}đ-${calcScore(s.details).cls}` : '—'}</td>; })}</tr>)}
          </tbody></table></div></div>
      )}
      {mode === 'month' && (
        <div className="card"><h2>Tổng hợp theo tháng</h2><p>Điểm trung bình của các phiếu đã duyệt trong các tuần thuộc tháng đã chọn. Cứ 4 tuần là 1 tháng (tuần 1–4 là Tháng 9, tuần 5–8 là Tháng 10…).</p>
          {months.length === 0 ? <p>Chưa có tuần nào. Tạo tuần ở tab Quản lý để xem tổng hợp theo tháng.</p> : <>
            <div className="row"><label style={{ margin: 0 }}>Tháng</label><select value={selMonth} onChange={e => setMonthSel(Number(e.target.value))} style={{ maxWidth: 200 }}>{months.map(([m]) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select><span>{monthWeeks.map(w => w.label).join(', ')}</span><button className="btn" type="button" onClick={() => onExportMonth?.(monthWeeks, monthLabel(selMonth))}>Xuất Word (.docx)</button></div>
            <div className="tablewrap"><table><thead><tr><th>Hạng</th><th>Lớp</th><th>Điểm TB</th><th>Loại</th><th>Nộp</th>{monthWeeks.map(w => <th key={w.id}>{w.label}</th>)}</tr></thead><tbody>
              {monthRows.map(({ c, a, cov: cv }) => <tr key={c.id}><td>{a === null ? '—' : ++monthRank}</td><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td><td>{a === null ? '—' : <span className={`badge ${clsOf(a)}`}>{clsOf(a)}</span>}</td><td>nộp {cv.approved}/{cv.total} tuần</td>{monthWeeks.map(w => { const s = state.scores.find(x => x.weekId === w.id && x.classId === c.id && x.status === 'approved'); return <td key={w.id}>{s ? `${calcScore(s.details).final}đ-${calcScore(s.details).cls}` : '—'}</td>; })}</tr>)}
            </tbody></table></div>
          </>}
        </div>
      )}
      {mode === 'group' && (
        <div><p>Điểm trung bình qua tất cả các tuần, chỉ tính phiếu đã duyệt.</p>
          {groupTable('Khối tự nhiên', groupRows('tu-nhien'))}
          {groupTable('Khối xã hội', groupRows('xa-hoi'))}
          {groupTable('Chưa phân khối', groupRows(null))}
        </div>
      )}
    </div>
  );
}

function ScoreForm(props: {
  state: AppState; week?: Week; draft: Details; calc: ReturnType<typeof calcScore>; canEdit: boolean;
  classId: string; setClassId: (id: string) => void; weekId: string; setWeekId: (id: string) => void;
  search: string; setSearch: (s: string) => void; classes: ClassItem[]; currentScore?: Score;
  setD: <K extends keyof Details>(k: K, v: Details[K]) => void; dirty: boolean;
  onSaveDraft: () => void; onSubmit: () => void; onApprove: () => void; onReturn: () => void;
  returnReason: string; setReturnReason: (s: string) => void; onReopen: () => void; onCopyPrev: () => void;
  onShowPhieu: () => void; showPhieu: boolean; onExportClass: () => void; sessionRole: Role;
}) {
  const extraRow = (key: 'extraPlus' | 'extraMinus', i: number) => {
    const list = (props.draft[key] ?? []) as ExtraLine[];
    const row = list[i] ?? { points: 0, note: '' };
    const setRow = (patch: Partial<ExtraLine>) => {
      const next = [...list];
      while (next.length <= i) next.push({ points: 0, note: '' });
      next[i] = { ...row, ...patch };
      props.setD(key, next);
    };
    return (
      <div className="extra-row" key={i}>
        <input type="number" min={0} value={row.points || ''} placeholder={key === 'extraPlus' ? '+ Điểm' : '− Điểm'} disabled={!props.canEdit} onChange={e => setRow({ points: Math.max(0, Number(e.target.value) || 0) })} aria-label={`${key === 'extraPlus' ? 'Cộng' : 'Trừ'} khác ${i + 1} — điểm`} />
        <input type="text" value={row.note} placeholder={`Nội dung ${i + 1}...`} disabled={!props.canEdit} onChange={e => setRow({ note: e.target.value })} aria-label={`${key === 'extraPlus' ? 'Cộng' : 'Trừ'} khác ${i + 1} — nội dung`} />
      </div>
    );
  };
  const { state, week, draft, calc, canEdit } = props;
  const d = draft;
  const sec = sectionSums(d);
  // Phiếu trộn cả số liệu cũ (gộp) và mới (tách nhỏ) thì đang tính cả hai
  // (trừ trùng) — chỉ cảnh báo, không tự sửa điểm phiếu đã duyệt.
  const mixedLegacy = legacyMixedClusters(d);
  const pm = (plus: number, minus: number) => [plus ? `+${plus}đ` : '', minus ? `−${minus}đ` : ''].filter(Boolean).join(' • ') || '0đ';
  const f = (key: keyof Details, label: string, pts: string, forceDisabled?: boolean) => <Stepper label={label} pts={pts} value={(d[key] as number) ?? 0} onChange={v => props.setD(key, v as never)} disabled={!canEdit || !!forceDisabled} />;
  // Hàng vi phạm: dưới ô đếm lượt luôn có ô ghi tên HS vi phạm đúng mục đó
  // (hiện cả khi chưa có lượt, để cờ đỏ thấy chỗ ghi ngay từ đầu).
  const fv = (key: keyof Details, label: string, pts: string) => {
    const v = (d[key] as number) ?? 0;
    return (
      <div key={key}>
        <Stepper label={label} pts={pts} value={v} onChange={n => props.setD(key, n as never)} disabled={!canEdit} />
        <input type="text" placeholder={`HS vi phạm: ${label.toLowerCase()}…`} value={d.violNames?.[key as string] ?? ''} disabled={!canEdit} onChange={e => props.setD('violNames', { ...(d.violNames ?? {}), [key as string]: e.target.value })} aria-label={`HS vi phạm ${label}`} style={{ marginTop: -2, marginBottom: 8 }} />
      </div>
    );
  };
  return (
    <div>
      <div className="card">
        <div className="row stack-m">
          <div style={{ flex: 1, minWidth: 160 }}><label>Tuần</label><select value={props.weekId} onChange={e => props.setWeekId(e.target.value)}>{state.weeks.map(w => <option key={w.id} value={w.id}>{w.label} {w.dateRange}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: 160 }}><label>Tìm lớp</label><input type="text" placeholder="Nhập tên lớp, vd 10B1" value={props.search} onChange={e => props.setSearch(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>{props.classes.map(c => <button key={c.id} type="button" className={props.classId === c.id ? 'btn' : 'btn ghost'} onClick={() => props.setClassId(c.id)}>{c.name}</button>)}</div>
        {props.classes.length === 0 && <p>Chưa có lớp nào. Ban thi đua thêm lớp ở tab Quản lý.</p>}
      </div>
      {week && props.classId && (
        <div className="card">
          <h2>Phiếu tổng kết — Lớp {state.classes.find(c => c.id === props.classId)?.name} — {week.label} {props.currentScore && <span className={`badge ${props.currentScore.status}`}>{STATUS_LABEL[props.currentScore.status]}</span>} {props.dirty && <span className="badge">Chưa lưu</span>}</h2>
          {mixedLegacy.length > 0 && <div className="warn">Phiếu này có cả số liệu cũ (gộp) và mới (tách nhỏ) ở: {mixedLegacy.join('; ')} — đang tính cả hai, kiểm tra lại trước khi nộp nhé.</div>}
          <div className="row"><button className="btn ghost" type="button" disabled={!canEdit} onClick={props.onCopyPrev}>Chép số liệu tuần trước</button><button className="btn ghost" type="button" onClick={props.onShowPhieu}>Xem phiếu tổng kết</button>{props.currentScore && <button className="btn ghost" type="button" onClick={props.onExportClass}>Xuất .docx phiếu này</button>}</div>
          <div className="grid2">
            <div>
              <div className="top100">
                <label><input type="checkbox" checked={calc.is100Tot} disabled={!canEdit} onChange={e => props.setD('allGood', e.target.checked)} style={{ width: 22, height: 22 }} /> 100% giờ Tốt (+20đ)</label>
                <p className="note">Tích rồi thì giờ Khá/Trung bình/Yếu lỡ nhập không bị trừ điểm.</p>
              </div>
              <Section title="Giờ học" sum={calc.totalHours > 0 ? `Tổng ${calc.totalHours} giờ${calc.is100Tot ? ' • +20đ' : ''}${sec.hoursMinus ? ` • −${sec.hoursMinus}đ` : ''}` : calc.is100Tot ? '+20đ' : '0đ'}>
              {f('hoursTot', 'Giờ Tốt', '', d.allGood === true)}
              {f('hoursKha', 'Giờ Khá', '-1đ/giờ', d.allGood === true)}
              {f('hoursTb', 'Giờ Trung bình', '-3đ/giờ', d.allGood === true)}
              {f('hoursYeu', 'Giờ Yếu', '-5đ/giờ', d.allGood === true)}
              {calc.is100Tot && calc.totalHours === 0
                ? <p>100% giờ Tốt — không cần nhập tổng số giờ.</p>
                : <p>Tổng giờ: {calc.totalHours} giờ.</p>}
              {calc.is100Tot && (d.hoursKha + d.hoursTb + d.hoursYeu > 0) && <p>Giờ Khá/Trung bình/Yếu đã nhập sẽ không bị trừ điểm vì đã tích 100% giờ Tốt.</p>}
              </Section>
              <Section title="Về học tập" sum={pm(sec.hocTapPlus, sec.hocTapMinus)}>
              {f('goodHigh', 'Tổng điểm tốt (≥5)', '+1đ/điểm')}
              {fv('goodLow', 'Tổng điểm tốt (<5)', '-1đ/điểm')}
              {fv('studyNoLearn', 'Không học bài', '-1đ/lượt')}
              {fv('studyNoPrepare', 'Không soạn bài', '-1đ/lượt')}
              {fv('studyNoMaterial', 'Không mang tài liệu, đồ dùng học tập', '-1đ/lượt')}
              {fv('cheating', 'Gian lận trong thi', '-10đ/lượt')}
              {f('bonusYouth', 'Công trình thanh niên', '+20đ/lần')}
              {f('bonusSweep', 'Quét sân', '+10đ/lần')}
              {f('bonusNtvt', 'NTVT', '+10đ/lần')}
              </Section>
            </div>
            <div>
              <div className="top100">
                <label><input type="checkbox" checked={calc.noAbsentLate} disabled={!canEdit} onChange={e => props.setD('noAbsLate', e.target.checked)} style={{ width: 22, height: 22 }} /> 100% không vắng, không đi muộn (+10đ)</label>
                <p className="note">Tích rồi thì vắng/đi muộn lỡ nhập không bị trừ điểm.</p>
              </div>
              <Section title="Về nề nếp" sum={pm(sec.neNepPlus, sec.neNepMinus)}>
              <p>Vắng học (tổng): <b>{d.absentPermit + d.absentNoPermit} buổi</b> — tự tính từ có phép + không phép.</p>
              {f('absentPermit', 'Trong đó: có phép', '')}
              {fv('absentNoPermit', 'Trong đó: không phép', '-5đ/lượt')}
              {fv('lateLate', 'Đi muộn', '-2đ/lượt')}
              {fv('lateOut', 'Tự ý ra ngoài trong sinh hoạt 15p', '-2đ/lượt')}
              {fv('noisy', 'Lớp ồn trong sinh hoạt 15p', '-5đ/lượt')}
              {fv('workPrivate', 'Làm việc riêng', '-2đ/lượt')}
              {fv('workNotSerious', 'Không nghiêm túc', '-2đ/lượt')}
              {fv('workSleep', 'Ngủ gục', '-2đ/lượt')}
              {fv('lateDuty', 'Trực nhật muộn', '-2đ/lượt')}
              {fv('dirty', 'Lớp bẩn', '-5đ/lượt')}
              {fv('foodEat', 'Ăn/mang đồ ăn vào lớp', '-2đ/lượt')}
              {fv('foodPhone', 'Không bỏ điện thoại vào tủ', '-2đ/lượt')}
              {fv('dressSlipper', 'Mang dép lê', '-1đ/lượt')}
              {fv('dressNoCard', 'Không đeo thẻ HS', '-1đ/lượt')}
              {fv('dressNoBadge', 'Không đeo huy hiệu đoàn', '-1đ/lượt')}
              {fv('dressHair', 'Nhuộm tóc', '-1đ/lượt')}
              {fv('dressEarring', 'Đeo bông tai (Nam)', '-1đ/lượt')}
              {fv('skip', 'Bỏ tiết', '-5đ/lượt')}
              {fv('dishonestLie', 'Không trung thực', '-5đ/lượt')}
              {fv('dishonestSwear', 'Nói tục, chửi thề', '-5đ/lượt')}
              {fv('parkingWrong', 'Để xe sai quy định', '-5đ/lượt')}
              {fv('parkingRev', 'Nẹt bô', '-5đ/lượt')}
              {fv('phone', 'Dùng điện thoại trong giờ học', '-10đ/lượt')}
              {fv('trafficHelmet', 'Không đội mũ bảo hiểm', '-10đ/lượt')}
              {fv('trafficMirror', 'Xe không có gương chiếu hậu', '-10đ/lượt')}
              {fv('trafficThree', 'Chở ba', '-10đ/lượt')}
              {fv('fightHit', 'Đánh nhau', '-20đ/lượt')}
              {fv('fightRude', 'Vô lễ với GV', '-20đ/lượt')}
              {fv('fightExplosive', 'Tàng trữ, sử dụng chất gây nổ', '-20đ/lượt')}
              {fv('fightDrug', 'Sử dụng thuốc lá, chất gây nghiện', '-20đ/lượt')}
              {calc.noAbsentLate && (d.absentNoPermit > 0 || (d.late ?? 0) > 0 || (d.lateLate ?? 0) > 0) && <p>Vắng không phép/đi muộn đã nhập sẽ không bị trừ điểm vì đã tích 100% không vắng, không đi muộn.</p>}
              </Section>
            </div>
          </div>
          <Section title="Cộng / trừ đột xuất" sum={pm(sec.extraPlus, sec.extraMinus)}>
          <div className="grid2">
            <div>
              <span className="extra-head plus">⊕ + CỘNG KHÁC</span>
              {[0, 1, 2, 3, 4].map(i => extraRow('extraPlus', i))}
            </div>
            <div>
              <span className="extra-head minus">⊖ − TRỪ KHÁC</span>
              {[0, 1, 2, 3, 4].map(i => extraRow('extraMinus', i))}
            </div>
          </div>
          </Section>
          <label>Tên HS vi phạm (không bắt buộc)</label>
          <input type="text" placeholder="Vd: Lan Anh, Sang, Ngân…" value={d.names} disabled={!canEdit} onChange={e => props.setD('names', e.target.value)} />
          <label>Ý kiến của lớp theo dõi</label>
          <textarea value={d.opinionClass} disabled={!canEdit} onChange={e => props.setD('opinionClass', e.target.value)} />
          <label>Ý kiến của cờ đỏ</label>
          <textarea value={d.opinionCodo} disabled={!canEdit} onChange={e => props.setD('opinionCodo', e.target.value)} />
          {!canEdit && <div className="warn">Phiếu này bạn không được sửa (xem phân quyền / phiếu đã nộp hoặc đã duyệt / tuần đã chốt).</div>}
          <div className="scorebar">
            <div className="scorebar-scores"><span>(1) Cộng: <b>+{calc.plus}đ</b></span><span>(2) Trừ: <b>-{calc.minus}đ</b></span><span>Điểm thi đua: <b>{calc.final}đ</b></span><span className={`badge ${calc.cls}`}>Loại {calc.cls}</span></div>
            <div className="scorebar-btns">
              <button className="btn ghost" type="button" disabled={!canEdit} onClick={props.onSaveDraft}>Lưu nháp</button>
              <button className="btn" type="button" disabled={!canEdit} onClick={props.onSubmit}>Lưu &amp; nộp phiếu từng lớp</button>
            </div>
          </div>
          {props.sessionRole === 'admin' && props.currentScore && (
            <div className="card" style={{ marginTop: 12 }}><h3>Duyệt phiếu (Ban thi đua)</h3>
              {props.currentScore.status === 'approved' ? (
                <>
                  <p><span className="badge approved">Đã duyệt</span> Phiếu này đã được duyệt{props.currentScore.approvedBy ? ` bởi ${props.currentScore.approvedBy}` : ''}{props.currentScore.approvedAt ? ` lúc ${props.currentScore.approvedAt}` : ''}.</p>
                  <div className="row"><button className="btn grey" type="button" onClick={props.onReopen}>Hủy duyệt (lỡ duyệt nhầm)</button></div>
                  <p>Lỡ duyệt nhầm thì bấm “Hủy duyệt” — phiếu trở về bản nháp để sửa lại, rồi nộp và duyệt lại như bình thường. Nếu tuần đã chốt thì tuần cũng được mở lại luôn.</p>
                </>
              ) : props.currentScore.status === 'submitted' ? (
                <>
                  <div className="row"><button className="btn green" type="button" onClick={props.onApprove}>Duyệt phiếu</button><button className="btn grey" type="button" onClick={props.onReopen}>Mở lại để sửa</button></div>
                  <label>Lý do trả lại (bắt buộc khi trả)</label><input type="text" value={props.returnReason} onChange={e => props.setReturnReason(e.target.value)} placeholder="Vd: Thiếu tên HS đi muộn" />
                  <div className="row" style={{ marginTop: 8 }}><button className="btn" type="button" onClick={props.onReturn}>Trả lại phiếu</button></div>
                </>
              ) : props.currentScore.status === 'returned' ? (
                <p><span className="badge returned">Bị trả lại</span> Phiếu bị trả lại — cờ đỏ sửa lại rồi nộp lại, Ban thi đua duyệt sau.</p>
              ) : (
                <p>Phiếu đang ở trạng thái Nháp — cờ đỏ nộp phiếu rồi Ban thi đua mới duyệt được.</p>
              )}
            </div>
          )}
          {props.showPhieu && (
            <div className="card"><h3>Phiếu tổng kết — in / chụp lưu hồ sơ</h3>
              <p><b>Tổng kết {week.label} — Lớp {state.classes.find(c => c.id === props.classId)?.name}</b></p>
              <p>(1) Tổng điểm cộng: {calc.plus}đ &nbsp; (2) Tổng điểm trừ: {calc.minus}đ</p>
              <p><b>3. Điểm thi đua của lớp [100 + (1) - (2)] = {calc.final}đ — Xếp loại: {calc.cls}</b></p>
              <p><b>Về học tập:</b></p>{hocTapLines(d).map((x, i) => <p key={i}>- {x}</p>)}
              <p><b>Về nề nếp:</b></p>{neNepLines(d).map((x, i) => <p key={i}>- {x}</p>)}
              <p>BAN THI ĐUA — {state.settings.signer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ManageTab({ state, setState, session, onLog, onExportJson, onImportJson, profiles, onProfilePatch, onProfileDelete, onRefreshProfiles }: {
  state: AppState; setState: (s: AppState) => void; session: { role: Role; name: string; id?: string; email?: string };
  onLog: (a: string, d: string) => void; onExportJson: () => void; onImportJson: (f: File) => void;
  profiles: Profile[]; onProfilePatch: (id: string, patch: Partial<Pick<Profile, 'role' | 'status' | 'reject_reason' | 'assigned_class_id' | 'assigned_week_id'>>) => void; onProfileDelete: (id: string) => void; onRefreshProfiles: () => void;
}) {
  const [weekLabel, setWeekLabel] = useState(''); const [weekRange, setWeekRange] = useState('');
  const [className, setClassName] = useState('');
  const [editingClassId, setEditingClassId] = useState(''); const [editingClassName, setEditingClassName] = useState(''); const [classNote, setClassNote] = useState('');
  const [bulkBase, setBulkBase] = useState('10B'); const [bulkFrom, setBulkFrom] = useState(1); const [bulkTo, setBulkTo] = useState(5);
  const [codoName, setCodoName] = useState(''); const [codoClass, setCodoClass] = useState(''); const [codoWeek, setCodoWeek] = useState(''); const [codoNote, setCodoNote] = useState('');
  const [dutyWeekId, setDutyWeekId] = useState(''); const [dutyNote, setDutyNote] = useState('');
  // Sao lưu & khôi phục (bảng app_state_history, từ migration-pro.sql).
  const [history, setHistory] = useState<HistoryVersion[]>([]);
  const [historyNote, setHistoryNote] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  async function loadHistory() {
    const list = await fetchHistory();
    setHistory(list); setHistoryLoaded(true);
    if (!list.length) setHistoryNote('Chưa có bản sao lưu nào trong Supabase — chạy file supabase/migration-pro.sql trong Dashboard (SQL Editor) để bật sao lưu tự động: mỗi lần lưu sẽ giữ lại 30 bản gần nhất.');
    else setHistoryNote('');
  }
  async function restoreVersion(id: string, at: string) {
    if (!window.confirm(`Khôi phục dữ liệu về bản sao lưu lúc ${at}? Dữ liệu hiện tại sẽ bị thay thế (bản hiện tại vẫn còn trong lịch sử sao lưu nếu đã bật).`)) return;
    const data = await fetchHistoryData(id);
    if (!data) { setHistoryNote('Không đọc được bản sao lưu này. Thử bản khác nhé.'); return; }
    setState(data);
    onLog('Khôi phục dữ liệu', `về bản ${at}`);
    setHistoryNote(`Đã khôi phục dữ liệu về bản ${at}.`);
  }
  // Mời GVCN: chọn lớp rồi chép link mời (form đăng ký mở sẵn đúng lớp).
  const [inviteClass, setInviteClass] = useState(''); const [inviteNote, setInviteNote] = useState('');
  function copyInvite() {
    if (!inviteClass) return;
    const clsName = state.classes.find(c => c.id === inviteClass)?.name ?? '';
    const link = `${window.location.origin}/?lop=${encodeURIComponent(clsName)}&vai-tro=chi-xem&dang-ky=1`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(() => setInviteNote(`Đã chép link mời GVCN lớp ${clsName}. Gửi link cho GVCN, họ đăng ký rồi bạn bấm Duyệt ở mục Tài khoản là xong.`)).catch(() => setInviteNote(`Không chép được tự động — link mời lớp ${clsName}: ${link}`));
    } else setInviteNote(`Link mời lớp ${clsName}: ${link}`);
  }
  const isAdmin = session.role === 'admin';
  if (!isAdmin) return <div className="card"><h2>Quản lý</h2><p>Chỉ Ban thi đua mới quản lý tuần, lớp, cờ đỏ và cài đặt.</p></div>;
  return (
    <div>
      <div className="card"><h2>Tài khoản</h2>
        {!isSupabaseConfigured && <p>Chưa cấu hình Supabase — quản lý tài khoản chỉ dùng được sau khi cấu hình Supabase (xem README).</p>}
        {isSupabaseConfigured && (
          <>
            <div className="row"><button className="btn ghost" type="button" onClick={onRefreshProfiles}>Làm mới danh sách</button></div>
            {profiles.length === 0 && <p>Chưa có tài khoản nào.</p>}
            {profiles.map(p => {
              const clsName = (p.role === 'codo' || p.role === 'viewer') ? state.classes.find(c => c.id === p.assigned_class_id)?.name : undefined;
              // Gợi ý lớp trực theo lịch cho tuần đã gán (hoặc tuần hiện tại).
              const dutyWk = p.role === 'codo' && clsName ? (p.assigned_week_id ? state.weeks.find(w => w.id === p.assigned_week_id) : state.weeks[state.weeks.length - 1]) : undefined;
              const dutyMon = dutyWk && clsName ? dutyMonitored(clsName, weekNumberOf(dutyWk, state.weeks.indexOf(dutyWk) + 1)) : null;
              return (
              <div key={p.id} className="card" style={{ marginTop: 10 }}>
                <p><b>{p.full_name}</b>{clsName ? ` — Lớp ${clsName}` : p.role === 'codo' ? <span style={{ color: '#9ca3af' }}> — Chưa gán lớp</span> : ''} — {p.email} {session.id === p.id && <span className="badge">Tài khoản của bạn</span>}</p>
                {dutyMon && dutyWk && <p>Theo lịch trực: {dutyWk.label}, cờ đỏ lớp {clsName} trực lớp <b>{dutyMon}</b>.</p>}
                <div className="row">
                  <div style={{ minWidth: 150 }}><label>Vai trò</label><select value={p.role} disabled={session.id === p.id} onChange={e => onProfilePatch(p.id, { role: e.target.value as Role })}><option value="admin">Ban thi đua</option><option value="codo">Cờ đỏ trực</option><option value="viewer">Chỉ xem</option></select></div>
                  <div style={{ minWidth: 150 }}><label>Trạng thái</label><span className={`badge ${p.status === 'active' ? 'approved' : p.status === 'pending' ? 'submitted' : 'returned'}`}>{p.status === 'active' ? 'Đang dùng' : p.status === 'pending' ? 'Chờ duyệt' : p.status === 'rejected' ? 'Đã từ chối' : 'Đã khóa'}</span></div>
                </div>
                {p.status === 'rejected' && p.reject_reason && <p>Lý do từ chối: {p.reject_reason}</p>}
                {(p.role === 'codo' || p.role === 'viewer') && (
                  <div className="row">
                    <div style={{ minWidth: 150 }}><label>{p.role === 'viewer' ? 'Lớp chủ nhiệm' : 'Gán lớp'}</label><select value={p.assigned_class_id ?? ''} onChange={e => onProfilePatch(p.id, { assigned_class_id: e.target.value || null })}><option value="">Chưa gán</option>{state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    {p.role === 'codo' && <div style={{ minWidth: 150 }}><label>Gán tuần</label><select value={p.assigned_week_id ?? ''} onChange={e => onProfilePatch(p.id, { assigned_week_id: e.target.value || null })}><option value="">Chưa gán</option>{state.weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>}
                  </div>
                )}
                <div className="row" style={{ marginTop: 8 }}>
                  {p.status === 'pending' && <button className="btn green" type="button" onClick={() => onProfilePatch(p.id, { status: 'active' })}>Duyệt</button>}
                  {p.status === 'pending' && <button className="btn grey" type="button" onClick={() => { const reason = window.prompt(`Từ chối tài khoản ${p.full_name} (${p.email})? Ghi rõ lý do để người đó biết:`, ''); if (reason === null) return; onProfilePatch(p.id, { status: 'rejected', reject_reason: reason.trim() || 'Không đủ điều kiện.' }); }}>Từ chối</button>}
                  {p.status === 'active' && session.id !== p.id && <button className="btn grey" type="button" onClick={() => onProfilePatch(p.id, { status: 'disabled' })}>Khóa tài khoản</button>}
                  {p.status === 'disabled' && <button className="btn green" type="button" onClick={() => onProfilePatch(p.id, { status: 'active' })}>Mở lại tài khoản</button>}
                  {p.status === 'rejected' && <button className="btn green" type="button" onClick={() => onProfilePatch(p.id, { status: 'active', reject_reason: null })}>Mở lại tài khoản</button>}
                  {session.id !== p.id && <button className="btn" type="button" onClick={() => onProfileDelete(p.id)}>Xóa tài khoản</button>}
                </div>
              </div>
              );
            })}
          </>
        )}
      </div>
      <div className="card"><h2>Mời giáo viên chủ nhiệm</h2>
        <p>Gửi link mời cho GVCN theo từng lớp: họ mở link là form đăng ký đã chọn sẵn vai trò Chỉ xem và đúng lớp đó. Họ đăng ký xong, bạn bấm Duyệt ở mục Tài khoản là xong — GVCN vào app sẽ thấy ngay thẻ “Lớp của tôi” với điểm, hạng và vi phạm của lớp mình.</p>
        <div className="row"><select value={inviteClass} onChange={e => setInviteClass(e.target.value)}><option value="">— Chọn lớp —</option>{state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn" type="button" disabled={!inviteClass} onClick={copyInvite}>Chép link mời GVCN</button></div>
        {inviteNote && <p>{inviteNote}</p>}
        <div style={{ marginTop: 10 }}>{state.classes.map(c => {
          const gvcn = profiles.find(p => p.role === 'viewer' && p.assigned_class_id === c.id);
          return <p key={c.id}>{c.name} — {gvcn ? <>GVCN: <b>{gvcn.full_name}</b> ({gvcn.status === 'active' ? 'đang dùng' : gvcn.status === 'pending' ? 'chờ duyệt' : 'đã khóa'})</> : <span style={{ color: '#9ca3af' }}>Chưa có GVCN</span>}</p>;
        })}</div>
      </div>
      <div className="card"><h2>Tuần</h2>
        <div className="row"><input type="text" placeholder="Vd: Tuần 4" value={weekLabel} onChange={e => setWeekLabel(e.target.value)} style={{ maxWidth: 200 }} /><input type="text" placeholder="Vd: 17/11 – 22/11" value={weekRange} onChange={e => setWeekRange(e.target.value)} style={{ maxWidth: 220 }} /><button className="btn" type="button" onClick={() => { if (!weekLabel.trim()) return; const w: Week = { id: uid(), label: weekLabel.trim(), dateRange: weekRange.trim() }; setState({ ...state, weeks: [...state.weeks, w] }); onLog('Tạo tuần', `${w.label} — ${monthLabel(monthBlockOf(w, state.weeks.length + 1))}`); setWeekLabel(''); setWeekRange(''); }}>Thêm tuần</button></div>
        {state.weeks.map((w, i) => <p key={w.id}>{w.label} {w.dateRange} — {monthLabel(monthBlockOf(w, i + 1))} {w.submittedAt ? `— Đã nộp ${w.submittedAt}` : '— Chưa chốt'} <button className="btn grey" type="button" onClick={() => { if (!window.confirm(`Xóa ${w.label} và toàn bộ phiếu của tuần này? Phân công trực của tuần này cũng bị xóa, tài khoản đang gán tuần này sẽ bị gỡ gán.`)) return; profiles.filter(p => p.assigned_week_id === w.id).forEach(p => onProfilePatch(p.id, { assigned_week_id: null })); setState({ ...state, weeks: state.weeks.filter(x => x.id !== w.id), scores: state.scores.filter(x => x.weekId !== w.id), roster: state.roster.filter(r => r.weekId !== w.id) }); onLog('Xóa tuần', w.label); }}>Xóa</button></p>)}
      </div>
      <div className="card"><h2>Lớp</h2>
        <div className="row"><input type="text" placeholder="Vd: 10B1" value={className} onChange={e => setClassName(e.target.value)} style={{ maxWidth: 200 }} /><button className="btn" type="button" onClick={() => { if (!className.trim()) return; const nm = className.trim().toUpperCase(); if (state.classes.some(c => c.name.toUpperCase() === nm)) { setClassNote(`Đã có lớp ${nm} rồi.`); return; } const c: ClassItem = { id: uid(), name: nm }; setState({ ...state, classes: [...state.classes, c] }); onLog('Thêm lớp', c.name); setClassName(''); setClassNote(`Đã thêm lớp ${nm}.`); }}>Thêm lớp</button></div>
        <div className="row"><input type="text" value={bulkBase} onChange={e => setBulkBase(e.target.value)} style={{ maxWidth: 100 }} /><input type="number" value={bulkFrom} onChange={e => setBulkFrom(Number(e.target.value))} style={{ maxWidth: 80 }} /><span>đến</span><input type="number" value={bulkTo} onChange={e => setBulkTo(Number(e.target.value))} style={{ maxWidth: 80 }} /><button className="btn ghost" type="button" onClick={() => { const news: ClassItem[] = []; for (let i = bulkFrom; i <= bulkTo; i++) { const nm = `${bulkBase}${i}`; if (!state.classes.some(c => c.name === nm)) news.push({ id: uid(), name: nm }); } setState({ ...state, classes: [...state.classes, ...news] }); onLog('Thêm cả khối lớp', news.map(c => c.name).join(', ')); }}>Thêm cả khối (vd 10B1–10B5)</button></div>
        <p>{state.classes.length === 0 ? 'Chưa có lớp nào.' : ''}</p>
        {state.classes.map(c => {
          const hasScores = state.scores.some(s => s.classId === c.id);
          const editing = editingClassId === c.id;
          return (
            <div key={c.id} className="row" style={{ alignItems: 'center' }}>
              {editing ? (<>
                <input type="text" value={editingClassName} onChange={e => setEditingClassName(e.target.value)} style={{ maxWidth: 160 }} />
                <button className="btn" type="button" onClick={() => {
                  const nm = editingClassName.trim().toUpperCase();
                  if (!nm) { setClassNote('Tên lớp không được để trống.'); return; }
                  if (state.classes.some(x => x.id !== c.id && x.name.toUpperCase() === nm)) { setClassNote(`Đã có lớp ${nm} rồi.`); return; }
                  setState({ ...state, classes: state.classes.map(x => x.id === c.id ? { ...x, name: nm } : x) });
                  onLog('Sửa tên lớp', `${c.name} → ${nm}`); setClassNote(`Đã đổi tên lớp ${c.name} thành ${nm}.`); setEditingClassId(''); setEditingClassName('');
                }}>Lưu</button>
                <button className="btn grey" type="button" onClick={() => { setEditingClassId(''); setEditingClassName(''); }}>Hủy</button>
              </>) : (<>
                <b>{c.name}</b>
                <button className="btn ghost" type="button" onClick={() => { setEditingClassId(c.id); setEditingClassName(c.name); setClassNote(''); }}>Sửa tên</button>
                {hasScores ? <span style={{ color: '#9ca3af' }}>đã có phiếu</span> : (
                  <button className="btn grey" type="button" onClick={() => {
                    if (!window.confirm(`Xóa lớp ${c.name}? Lớp chưa có phiếu nào nên xóa được. Tài khoản đang gán lớp này sẽ bị gỡ gán.`)) return;
                    profiles.filter(p => p.assigned_class_id === c.id).forEach(p => onProfilePatch(p.id, { assigned_class_id: null }));
                    setState({ ...state, classes: state.classes.filter(x => x.id !== c.id), roster: state.roster.filter(r => r.classId !== c.id) });
                    onLog('Xóa lớp', c.name); setClassNote(`Đã xóa lớp ${c.name}.`);
                  }}>Xóa</button>
                )}
              </>)}
            </div>
          );
        })}
        {classNote && <p>{classNote}</p>}
      </div>
      <div className="card"><h2>Cờ đỏ trực — phân công</h2>
        <div className="row"><input type="text" placeholder="Tên cờ đỏ" value={codoName} onChange={e => setCodoName(e.target.value)} style={{ maxWidth: 200 }} />
          <select value={codoClass} onChange={e => setCodoClass(e.target.value)} style={{ maxWidth: 160 }}><option value="">Chọn lớp</option>{state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={codoWeek} onChange={e => setCodoWeek(e.target.value)} style={{ maxWidth: 160 }}><option value="">Chọn tuần</option>{state.weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
          <button className="btn" type="button" onClick={() => { if (!codoName.trim() || !codoClass || !codoWeek) return; const nm = codoName.trim(); if (state.roster.some(r => r.name.toUpperCase() === nm.toUpperCase() && r.weekId === codoWeek)) { setCodoNote(`Đã có phân công cho ${nm} trong tuần này rồi.`); return; } if (state.roster.some(r => r.classId === codoClass && r.weekId === codoWeek && r.active)) { setCodoNote(`Lớp ${state.classes.find(c => c.id === codoClass)?.name} đã có cờ đỏ trực tuần này rồi.`); return; } setState({ ...state, roster: [...state.roster, { id: uid(), name: nm, classId: codoClass, weekId: codoWeek, active: true }] }); onLog('Phân công cờ đỏ', `${nm} — ${state.classes.find(c => c.id === codoClass)?.name}`); setCodoName(''); setCodoNote(`Đã phân công ${nm} trực lớp ${state.classes.find(c => c.id === codoClass)?.name}.`); }}>Thêm cờ đỏ</button></div>
        {codoNote && <p>{codoNote}</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <select value={dutyWeekId || state.weeks[state.weeks.length - 1]?.id || ''} onChange={e => setDutyWeekId(e.target.value)} style={{ maxWidth: 160 }}>{state.weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
          <button className="btn" type="button" onClick={() => {
            const wk = state.weeks.find(w => w.id === (dutyWeekId || state.weeks[state.weeks.length - 1]?.id));
            if (!wk) { setDutyNote('Chưa có tuần nào để gán.'); return; }
            const wn = weekNumberOf(wk, state.weeks.indexOf(wk) + 1);
            let assigned = 0; const skipped: string[] = [];
            const roster = [...state.roster];
            for (const p of profiles.filter(x => x.role === 'codo' && x.status === 'active')) {
              const home = state.classes.find(c => c.id === p.assigned_class_id)?.name;
              const mon = home ? dutyMonitored(home, wn) : null;
              const monId = mon ? state.classes.find(c => c.name.toUpperCase() === mon)?.id : undefined;
              if (!monId) { skipped.push(p.full_name); continue; }
              const ex = roster.findIndex(r => r.name === p.full_name && r.weekId === wk.id);
              if (ex >= 0) roster[ex] = { ...roster[ex], classId: monId, active: true };
              else roster.push({ id: uid(), name: p.full_name, classId: monId, weekId: wk.id, active: true });
              assigned++;
            }
            setState({ ...state, roster });
            onLog('Gán trực theo lịch', `${wk.label}: ${assigned} cờ đỏ${skipped.length ? ` — chưa gán được: ${skipped.join(', ')}` : ''}`);
            setDutyNote(`Đã gán ${assigned} cờ đỏ trực ${wk.label} theo lịch.${skipped.length ? ` Chưa gán được: ${skipped.join(', ')} (chưa có lớp).` : ''}`);
          }}>Gán cả tuần theo lịch trực</button>
        </div>
        {dutyNote && <p>{dutyNote}</p>}
        {state.roster.map(r => <p key={r.id}>{r.name} — Lớp {state.classes.find(c => c.id === r.classId)?.name} — {state.weeks.find(w => w.id === r.weekId)?.label} — {r.active ? 'Đang trực' : 'Đã tắt'} <button className="btn grey" type="button" onClick={() => setState({ ...state, roster: state.roster.map(x => x.id === r.id ? { ...x, active: !x.active } : x) })}>{r.active ? 'Tắt' : 'Bật'}</button></p>)}
        {state.roster.length === 0 && <p>Chưa phân công cờ đỏ nào.</p>}
      </div>
      <div className="card"><h2>Lịch trực cờ đỏ — Học kì 1, năm học 2026–2027</h2>
        <p>Cột là lớp của cờ đỏ, ô là lớp cờ đỏ đó trực trong tuần. Tuần hiện tại được tô đậm. Hai cột cuối là lớp trực cổng chào cờ buổi sáng / chiều.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Tuần</th>{DUTY_CLASSES.map(c => <th key={c}>{c}</th>)}<th>Sáng</th><th>Chiều</th></tr></thead>
          <tbody>
            {Array.from({ length: DUTY_WEEKS }, (_, i) => i + 1).map(wn => {
              const wk = state.weeks.find((w, i) => weekNumberOf(w, i + 1) === wn);
              const g = gateDuty(wn);
              const isCur = wk?.id === state.weeks[state.weeks.length - 1]?.id;
              return (
                <tr key={wn} style={isCur ? { background: '#fef2f2', fontWeight: 700 } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>Tuần {wn}{wk?.dateRange ? <><br /><span style={{ fontWeight: 400, color: '#64748b' }}>{wk.dateRange}</span></> : ''}</td>
                  {DUTY_CLASSES.map(c => <td key={c}>{dutyMonitored(c, wn)}</td>)}
                  <td>{g.sang}</td><td>{g.chieu}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
      <div className="card"><h2>Cài đặt hệ thống</h2>
        <label>Tên trường</label><input type="text" value={state.settings.school} onChange={e => setState({ ...state, settings: { ...state.settings, school: e.target.value } })} />
        <label>Số văn bản (vd 04/TĐ-HV)</label><input type="text" value={state.settings.docNo} onChange={e => setState({ ...state, settings: { ...state.settings, docNo: e.target.value } })} />
        <label>Người ký</label><input type="text" value={state.settings.signer} onChange={e => setState({ ...state, settings: { ...state.settings, signer: e.target.value } })} />
        <label>Nhận xét chung — Ưu điểm (để trống sẽ tự gợi ý)</label><textarea value={state.settings.generalPros} onChange={e => setState({ ...state, settings: { ...state.settings, generalPros: e.target.value } })} />
        <label>Nhận xét chung — Nhược điểm (để trống sẽ tự gợi ý)</label><textarea value={state.settings.generalCons} onChange={e => setState({ ...state, settings: { ...state.settings, generalCons: e.target.value } })} />
      </div>
      <div className="card"><h2>Sao lưu dữ liệu</h2><p>Dữ liệu dùng chung qua Supabase (và lưu dự phòng trên trình duyệt). Xuất file JSON để sao lưu, nhập lại khi cần khôi phục.</p>
        <div className="row"><button className="btn" type="button" onClick={onExportJson}>Xuất JSON sao lưu</button><label className="btn ghost" style={{ padding: '10px 14px' }}>Nhập JSON sao lưu<input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onImportJson(f); }} /></label></div>
      </div>
      {isSupabaseConfigured && (
        <div className="card"><h2>Sao lưu tự động (Supabase)</h2>
          <p>Mỗi lần dữ liệu chung được lưu, Supabase giữ lại một bản sao (tối đa 30 bản gần nhất). Lỡ nhập sai / xóa nhầm thì khôi phục lại bản trước đó.</p>
          <div className="row"><button className="btn" type="button" onClick={() => void loadHistory()}>Tải danh sách bản sao lưu</button></div>
          {historyNote && <p>{historyNote}</p>}
          {historyLoaded && history.length > 0 && (
            <div className="tablewrap slim"><table><thead><tr><th>Thời gian</th><th>Người lưu</th><th></th></tr></thead><tbody>
              {history.map(h => <tr key={h.id}><td>{h.updated_at}</td><td>{h.updated_by ?? '—'}</td><td><button className="btn ghost" type="button" onClick={() => void restoreVersion(h.id, h.updated_at)}>Khôi phục bản này</button></td></tr>)}
            </tbody></table></div>
          )}
        </div>
      )}
    </div>
  );
}
