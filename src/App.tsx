import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, ClassGroup, ClassItem, Details, ExtraLine, Role, Score, Week } from './lib';
import { calcScore, classAvg, classGroup, clsOf, currentMonth, downloadBlob, emptyDetails, emptyState, groupLabel, hocTapLines, monthLabel, monthOfWeek, neNepLines, nowStr, sectionSums, toCsv, uid, validateDetails } from './lib';
import { exportClassDocx, exportWeekDocx } from './docxExport';
import { LOGO_DATA_URI } from './logoData';
import AuthScreen from './AuthScreen';
import { deleteProfile, ensureProfile, fetchSharedState, isSupabaseConfigured, listProfiles, saveSharedState, supabase, updateProfile } from './supabase';
import type { Profile } from './supabase';

const LS_KEY = 'tong-thi-dua-v1';
const LS_SESSION = 'tong-thi-dua-session-v1';
const STATUS_LABEL: Record<string, string> = { draft: 'Nháp', submitted: 'Chờ duyệt', approved: 'Đã duyệt', returned: 'Bị trả lại' };

function loadState(): AppState {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { const p = JSON.parse(raw) as AppState; if (p.settings && Array.isArray(p.weeks)) return p; } } catch { /* ignore */ }
  return emptyState();
}

function Stepper({ label, pts, value, onChange, disabled }: { label: string; pts: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const timer = useRef<number | null>(null);
  const start = (dir: number) => { onChange(Math.max(0, value + dir)); timer.current = window.setInterval(() => onChange(Math.max(0, value + dir)), 120); };
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  return (
    <div className="field">
      <div className="nm">{label}<div className="pts">{pts}</div></div>
      <div className="stepper">
        <button type="button" disabled={disabled} onMouseDown={() => start(-1)} onMouseUp={stop} onMouseLeave={stop} onTouchStart={() => start(-1)} onTouchEnd={stop} aria-label="Giảm">−</button>
        <input type="number" min={0} value={value} disabled={disabled} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} aria-label={label} />
        <button type="button" disabled={disabled} onMouseDown={() => start(1)} onMouseUp={stop} onMouseLeave={stop} onTouchStart={() => start(1)} onTouchEnd={stop} aria-label="Tăng">+</button>
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
  const [state, setState] = useState<AppState>(loadState);
  const [session, setSession] = useState<{ role: Role; name: string; id?: string; email?: string } | null>(() => {
    if (isSupabaseConfigured) return null; // Chế độ Supabase: phiên do Supabase + hồ sơ quyết định, không dùng vai trò chọn tay.
    try { const raw = localStorage.getItem(LS_SESSION); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  // --- Supabase: tài khoản dùng chung ---
  const [authUser, setAuthUser] = useState<{ id: string; email: string; user_metadata?: Record<string, unknown> } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [profileErr, setProfileErr] = useState('');
  const [remoteLoaded, setRemoteLoaded] = useState(!isSupabaseConfigured);
  const remoteUpdatedAtRef = useRef<string | null>(null);
  const lastSavedAtRef = useRef<string | null>(null);
  const remoteLoadingRef = useRef(false);
  const [tab, setTab] = useState('tong-quan');
  const [weekId, setWeekId] = useState('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Details | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [showPhieu, setShowPhieu] = useState(false);
  const [rankGroup, setRankGroup] = useState<'all' | ClassGroup>('all');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  // Học sinh đang chờ duyệt: chọn lớp của mình ở màn hình chờ duyệt.
  const [pendingClassId, setPendingClassId] = useState('');
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingMsg, setPendingMsg] = useState('');
  const [pendingErr, setPendingErr] = useState('');

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(state)); }, [state]);
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

  // Theo dõi phiên Supabase (đăng nhập / đăng xuất / làm mới token).
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setAuthUser(u ? { id: u.id, email: u.email ?? '', user_metadata: (u.user_metadata ?? {}) as Record<string, unknown> } : null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      const u = sess?.user;
      // Đăng nhập tài khoản (mới): xóa thông báo của phiên trước
      // (vd: "Đã đăng xuất." sau khi đăng xuất) để không hiện sang tài khoản khác.
      if (event === 'SIGNED_IN' && u) { setMsg(''); setErrs([]); }
      setAuthUser(u ? { id: u.id, email: u.email ?? '', user_metadata: (u.user_metadata ?? {}) as Record<string, unknown> } : null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
  }, [authUser]);

  // Ban thi đua tải danh sách tài khoản để duyệt / quản lý.
  useEffect(() => {
    if (!isSupabaseConfigured || profile?.role !== 'admin') return;
    listProfiles().then(setProfiles).catch(() => { /* hiển thị trống, lỗi sẽ thấy khi thao tác */ });
  }, [profile]);

  // Tải dữ liệu dùng chung từ Supabase sau khi đăng nhập.
  // Tài khoản chưa duyệt chỉ tải về để xem danh sách lớp (điền thông tin
  // ở màn hình chờ duyệt), không đẩy dữ liệu máy này lên; chỉ tài khoản
  // đã duyệt mới đẩy lên khi chưa có dòng dữ liệu trên Supabase.
  useEffect(() => {
    if (!isSupabaseConfigured || !profile || remoteLoaded || remoteLoadingRef.current) return;
    remoteLoadingRef.current = true;
    fetchSharedState()
      .then(async row => {
        if (row.data) {
          setState(row.data);
          remoteUpdatedAtRef.current = row.updatedAt;
        } else if (profile.status === 'active') {
          const at = await saveSharedState(loadState(), profile.full_name);
          remoteUpdatedAtRef.current = at;
          lastSavedAtRef.current = at;
        }
      })
      .catch(() => setErrs(['Chưa tải được dữ liệu dùng chung từ Supabase — đang dùng dữ liệu trên máy này.']))
      .finally(() => { setRemoteLoaded(true); remoteLoadingRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, remoteLoaded]);

  // Ghi dữ liệu lên Supabase sau mỗi thay đổi (debounce ~1s, last-write-wins).
  // Trước khi ghi, đọc lại updated_at trên máy chủ: nếu có máy khác ghi mới
  // hơn kể từ lúc mình tải thì KHÔNG ghi đè, mà tải bản mới đó về.
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || profile?.status !== 'active') return;
    const timer = window.setTimeout(async () => {
      try {
        const remote = await fetchSharedState();
        if (remote.updatedAt && remoteUpdatedAtRef.current && remote.updatedAt > remoteUpdatedAtRef.current && remote.updatedAt !== lastSavedAtRef.current) {
          if (remote.data) {
            setState(remote.data);
            remoteUpdatedAtRef.current = remote.updatedAt;
          }
          return;
        }
        const at = await saveSharedState(state, profile.full_name);
        if (at) { remoteUpdatedAtRef.current = at; lastSavedAtRef.current = at; }
      } catch {
        setErrs(['Chưa đồng bộ được lên Supabase — dữ liệu vẫn lưu trên máy này.']);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, remoteLoaded, profile]);

  const week: Week | undefined = state.weeks.find(w => w.id === weekId) ?? state.weeks[state.weeks.length - 1];
  const effectiveWeekId = week?.id ?? '';
  const currentScore: Score | undefined = state.scores.find(s => s.weekId === effectiveWeekId && s.classId === classId);
  // Phân công của cờ đỏ: ưu tiên gán lớp/tuần trong hồ sơ Supabase,
  // nếu chưa gán thì dùng danh sách phân công cũ (roster) theo họ tên.
  const assignment = useMemo(() => {
    if (session?.role !== 'codo') return undefined;
    if (profile?.assigned_class_id && profile?.assigned_week_id) {
      return { id: 'profile', name: session.name, classId: profile.assigned_class_id, weekId: profile.assigned_week_id, active: true };
    }
    return state.roster.find(r => r.name === session.name && r.active);
  }, [session, profile, state.roster]);

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

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setRemoteLoaded(false);
    remoteUpdatedAtRef.current = null;
    lastSavedAtRef.current = null;
    setMsg('Đã đăng xuất.');
  }

  // Ban thi đua cập nhật tài khoản (duyệt / đổi vai trò / gán lớp-tuần / khóa / mở lại).
  async function patchProfile(id: string, patch: Partial<Pick<Profile, 'role' | 'status' | 'assigned_class_id' | 'assigned_week_id'>>) {
    if (!supabase) { setErrs(['Chưa cấu hình Supabase nên chưa quản lý được tài khoản.']); return; }
    try {
      await updateProfile(id, patch);
      setProfiles(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
      const p = profiles.find(x => x.id === id);
      update(s => s, 'Quản lý tài khoản', `${p?.full_name ?? ''} (${p?.email ?? ''})`);
      setMsg('Đã cập nhật tài khoản.');
    } catch {
      setErrs(['Không cập nhật được tài khoản. Kiểm tra lại Supabase (đã chạy schema.sql chưa).']);
    }
  }

  // Học sinh đang chờ duyệt tự lưu lớp của mình (màn hình chờ duyệt).
  async function savePendingClass() {
    if (!profile) return;
    const cid = pendingClassId || profile.assigned_class_id || '';
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
  // Không xóa được tài khoản của chính mình. Phiếu đã nhập vẫn giữ lại.
  async function removeProfile(id: string) {
    if (!supabase) { setErrs(['Chưa cấu hình Supabase nên chưa quản lý được tài khoản.']); return; }
    const p = profiles.find(x => x.id === id);
    if (!p || session?.id === id) return;
    if (!window.confirm(`Xóa tài khoản ${p.full_name} (${p.email})? Người này sẽ không đăng nhập vào hệ thống được nữa. Phiếu đã nhập vẫn giữ lại.`)) return;
    try {
      await deleteProfile(id);
      setProfiles(prev => prev.filter(x => x.id !== id));
      update(s => s, 'Xóa tài khoản', `${p.full_name} (${p.email})`);
      setMsg('Đã xóa tài khoản.');
    } catch {
      setErrs(['Không xóa được tài khoản. Kiểm tra lại Supabase (đã chạy dòng chính sách xóa trong schema.sql chưa).']);
    }
  }

  function update(fn: (s: AppState) => AppState, logAction?: string, logDetail?: string) {
    setState(prev => {
      const next = fn(prev);
      if (logAction) next.logs = [...next.logs, { id: uid(), time: nowStr(), actor: session?.name ?? 'Hệ thống', role: roleLabel, action: logAction, detail: logDetail ?? '' }];
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
    setMsg(status === 'submitted' ? `Đã lưu & nộp phiếu lớp ${clsName}: ${c.final}đ, loại ${c.cls}.` : `Đã lưu nháp phiếu lớp ${clsName}.`);
  }
  function approveScore() {
    if (!currentScore || session?.role !== 'admin') return;
    const clsName = state.classes.find(c => c.id === currentScore.classId)?.name ?? '';
    update(prev => ({ ...prev, scores: prev.scores.map(s => s.id === currentScore.id ? { ...s, status: 'approved', approvedBy: session?.name, approvedAt: nowStr() } : s) }), 'Duyệt phiếu', `${clsName} — ${week?.label}`);
    setMsg(`Đã duyệt phiếu lớp ${clsName}.`); setDraft(currentScore.details);
  }
  function returnScore() {
    if (!currentScore || session?.role !== 'admin' || !returnReason.trim()) { setErrs(['Trả lại phiếu phải ghi rõ lý do.']); return; }
    const clsName = state.classes.find(c => c.id === currentScore.classId)?.name ?? '';
    update(prev => ({ ...prev, scores: prev.scores.map(s => s.id === currentScore.id ? { ...s, status: 'returned', returnReason: returnReason.trim() } : s) }), 'Trả lại phiếu', `${clsName} — Lý do: ${returnReason.trim()}`);
    setMsg(`Đã trả lại phiếu lớp ${clsName}.`); setReturnReason(''); setDraft(currentScore.details);
  }
  function reopenScore() {
    if (!currentScore || session?.role !== 'admin') return;
    update(prev => ({ ...prev, scores: prev.scores.map(s => s.id === currentScore.id ? { ...s, status: 'draft', returnReason: undefined } : s) }), 'Mở lại phiếu', `${state.classes.find(c => c.id === currentScore.classId)?.name}`);
    setMsg('Đã mở lại phiếu để sửa.');
  }
  function closeWeek() {
    if (!week || session?.role !== 'admin') return;
    const missing = state.classes.filter(c => !state.scores.some(s => s.weekId === week.id && s.classId === c.id && s.status === 'approved'));
    if (missing.length) { setErrs([`Chưa chốt được tuần: còn ${missing.length} lớp chưa có phiếu đã duyệt (${missing.map(c => c.name).join(', ')}).`]); return; }
    setErrs([]);
    update(prev => ({ ...prev, weeks: prev.weeks.map(w => w.id === week.id ? { ...w, submittedAt: nowStr(), submittedBy: session?.name } : w) }), 'Nộp & chốt tuần', week.label);
    setMsg(`Đã nộp & chốt ${week.label}.`);
  }
  function reopenWeek() {
    if (!week || session?.role !== 'admin') return;
    update(prev => ({ ...prev, weeks: prev.weeks.map(w => w.id === week.id ? { ...w, submittedAt: null, submittedBy: null } : w) }), 'Mở lại tuần', week.label);
    setMsg(`Đã mở lại ${week.label}.`);
  }
  function copyPrevWeek() {
    if (!draft || !classId || state.weeks.length < 2) return;
    const idx = state.weeks.findIndex(w => w.id === effectiveWeekId);
    const prevWeek = state.weeks[idx - 1];
    if (!prevWeek) { setMsg('Không có tuần trước để chép.'); return; }
    const prevScore = state.scores.find(s => s.weekId === prevWeek.id && s.classId === classId);
    if (!prevScore) { setMsg(`Lớp này chưa có phiếu ở ${prevWeek.label}.`); return; }
    setDraft(prevScore.details); setDirty(true); setMsg(`Đã chép số liệu từ ${prevWeek.label}. Nhớ kiểm tra rồi Lưu & nộp.`);
  }
  async function doExportDocxWeek() {
    if (!week) return;
    try { const blob = await exportWeekDocx(state, week, false); downloadBlob(blob, `TONG_HOP_THI_DUA_${week.label.replace(/\s+/g, '_')}.docx`); update(s => s, 'Xuất file .docx', week.label); setMsg('Đã tải file .docx tổng hợp tuần.'); }
    catch { setErrs(['Không xuất được file .docx. Thử lại sau.']); }
  }
  async function doExportDocxClass() {
    if (!currentScore) return;
    try { const blob = await exportClassDocx(state, currentScore); downloadBlob(blob, `PHIEU_${state.classes.find(c => c.id === currentScore.classId)?.name}_${week?.label.replace(/\s+/g, '_')}.docx`); setMsg('Đã tải file .docx phiếu lớp.'); }
    catch { setErrs(['Không xuất được file .docx phiếu lớp.']); }
  }
  function exportCsv() {
    if (!week) return;
    const rows = state.scores.filter(s => s.weekId === week.id && s.status === 'approved')
      .sort((a, b) => calcScore(b.details).final - calcScore(a.details).final)
      .map((s, i) => { const c = calcScore(s.details); return [String(i + 1), state.classes.find(cl => cl.id === s.classId)?.name ?? '', hocTapLines(s.details).join('; '), neNepLines(s.details).join('; '), `${c.final}đ-${c.cls}`, STATUS_LABEL[s.status]]; });
    downloadBlob(new Blob([toCsv([['TT', 'Lớp', 'Học tập', 'Nề nếp', 'Tổng điểm - Xếp loại', 'Trạng thái'], ...rows])], { type: 'text/csv;charset=utf-8' }), `XEP_HANG_${week.label.replace(/\s+/g, '_')}.csv`);
    update(s => s, 'Xuất file CSV', week.label);
  }
  function exportJson() {
    downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'tong-thi-dua-sao-luu.json');
    setMsg('Đã tải file sao lưu JSON. Giữ file này để khôi phục dữ liệu khi cần.');
  }
  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try { const p = JSON.parse(String(reader.result)) as AppState; if (!p.settings || !Array.isArray(p.weeks)) throw new Error('bad'); setState(p); setMsg('Đã nhập dữ liệu sao lưu thành công.'); }
      catch { setErrs(['File sao lưu không đúng định dạng.']); }
    };
    reader.readAsText(file);
  }
  function copyZalo() {
    if (!week) return;
    const rows = state.scores.filter(s => s.weekId === week.id && s.status === 'approved').sort((a, b) => calcScore(b.details).final - calcScore(a.details).final);
    const text = `TỔNG HỢP THI ĐUA ${week.label.toUpperCase()}\n` + rows.map((s, i) => `${i + 1}. ${state.classes.find(c => c.id === s.classId)?.name}: ${calcScore(s.details).final}đ-${calcScore(s.details).cls}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => setMsg('Đã chép bảng xếp hạng để gửi Zalo.')).catch(() => setErrs(['Không chép được, trình duyệt chặn clipboard.']));
  }

  const approvedScores = useMemo(() => week ? state.scores.filter(s => s.weekId === week.id && s.status === 'approved').sort((a, b) => calcScore(b.details).final - calcScore(a.details).final) : [], [state.scores, week]);
  const rankedScores = useMemo(() => rankGroup === 'all' ? approvedScores : approvedScores.filter(s => classGroup(state.classes.find(c => c.id === s.classId)?.name ?? '') === rankGroup), [approvedScores, rankGroup, state.classes]);
  const pendingScores = useMemo(() => week ? state.scores.filter(s => s.weekId === week.id && s.status === 'submitted') : [], [state.scores, week]);
  const filteredClasses = state.classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const visibleClasses = session?.role === 'codo' && assignment ? state.classes.filter(c => c.id === assignment.classId) : filteredClasses;

  if (!session) {
    // --- Chế độ Supabase: đăng nhập bằng email + mật khẩu ---
    if (isSupabaseConfigured) {
      if (!authReady) {
        return (<div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header><main className="wrap"><div className="card"><p>Đang kiểm tra phiên đăng nhập…</p></div></main></div>);
      }
      if (authUser && profile && (profile.status === 'pending' || profile.status === 'disabled')) {
        return (
          <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
          <main className="wrap"><div className="card"><h2>{profile.status === 'pending' ? 'Tài khoản đang chờ Ban thi đua duyệt' : 'Tài khoản đã bị khóa'}</h2>
          <p>Xin chào <b>{profile.full_name}</b> ({profile.email}). {profile.status === 'pending' ? 'Tài khoản của bạn đang chờ Ban thi đua duyệt. Sau khi được duyệt, bạn đăng nhập lại là vào được hệ thống.' : 'Tài khoản của bạn đã bị Ban thi đua khóa. Bạn liên hệ Ban thi đua để được mở lại.'}</p>
          <div className="row"><button className="btn grey" type="button" onClick={handleSignOut}>Đăng xuất</button></div></div>
          {profile.status === 'pending' && profile.role === 'codo' && (
            <div className="card"><h2>Hoàn thiện thông tin của bạn</h2>
            <p>Trong lúc chờ duyệt, bạn chọn sẵn lớp mình đang học để Ban thi đua khỏi phải hỏi lại nhé. Tuần trực thì Ban thi đua sẽ gán cho bạn khi duyệt.</p>
            <label>Lớp của bạn</label>
            {state.classes.length === 0 ? (
              <p>Chưa có lớp nào trong hệ thống — Ban thi đua sẽ gán lớp cho bạn sau khi duyệt.</p>
            ) : (
              <select value={pendingClassId || profile.assigned_class_id || ''} onChange={e => setPendingClassId(e.target.value)}>
                <option value="">— Chọn lớp —</option>
                {state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {state.classes.length > 0 && (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" type="button" disabled={pendingBusy} onClick={savePendingClass}>{pendingBusy ? 'Đang lưu…' : 'Lưu lớp của tôi'}</button>
              </div>
            )}
            {pendingMsg && <div className="ok">{pendingMsg}</div>}
            {pendingErr && <div className="err">{pendingErr}</div>}
            </div>
          )}
          </main></div>
        );
      }
      if (authUser && !profile) {
        return (<div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header><main className="wrap"><div className="card"><p>Đang tải hồ sơ tài khoản…</p>{profileErr && <div className="err">{profileErr}</div>}<div className="row"><button className="btn grey" type="button" onClick={handleSignOut}>Đăng xuất</button></div></div></main></div>);
      }
      return (
        <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
        <main className="wrap"><AuthScreen />{profileErr && <div className="err">{profileErr}</div>}{msg && <div className="ok">{msg}</div>}</main></div>
      );
    }
    // --- Chế độ cũ (chưa cấu hình Supabase): chọn vai trò, dữ liệu trên máy này ---
    return (
      <div><header className="top"><div className="top-inner"><div className="brand"><img src={LOGO_DATA_URI} alt="Logo Đoàn trường THPT Hùng Vương" className="logo" /><div className="brand-text"><p className="school">ĐOÀN TRƯỜNG THPT HÙNG VƯƠNG - QUẢNG PHÚ</p><h1>HỆ THỐNG THI ĐUA CỜ ĐỎ</h1></div></div></div></header>
      <main className="wrap"><div className="card"><h2>Chọn vai trò để vào hệ thống</h2><p>Ban thi đua quản lý toàn bộ. Cờ đỏ chỉ nhập lớp được phân công. Chỉ xem không được nhập hay sửa.</p>
      <p><b>Chưa cấu hình Supabase — đang dùng chế độ trên máy này.</b> Dữ liệu và vai trò chỉ lưu trên trình duyệt này; muốn đăng nhập dùng chung cho mọi máy, cấu hình Supabase theo hướng dẫn trong README.</p>
      <div className="rolecard">
        <button type="button" onClick={() => setSession({ role: 'admin', name: state.settings.signer })}><b>Ban thi đua</b><br />{state.settings.signer} — toàn quyền: tạo tuần/lớp, phân công cờ đỏ, duyệt, chốt tuần, xuất file.</button>
        <button type="button" onClick={() => { const names = state.roster.filter(r => r.active).map(r => r.name); if (!names.length) { setMsg('Chưa có cờ đỏ nào được phân công. Nhờ Ban thi đua thêm ở tab Quản lý.'); return; } const n = window.prompt('Nhập đúng tên cờ đỏ của bạn:\n' + names.join(', ')); if (n && names.includes(n.trim())) setSession({ role: 'codo', name: n.trim() }); else if (n) setMsg('Tên này không có trong danh sách phân công.'); }}><b>Cờ đỏ trực</b><br />Chọn đúng tên được phân công, hệ thống tự mở lớp của bạn để nhập trực tiếp.</button>
        <button type="button" onClick={() => setSession({ role: 'viewer', name: 'Khách xem' })}><b>Chỉ xem (GVCN / BGH)</b><br />Chỉ xem xếp hạng, phiếu và tổng hợp, không nhập, không sửa.</button>
      </div>{msg && <div className="warn">{msg}</div>}</div></main></div>
    );
  }

  const tabs: [string, string][] = [['tong-quan', 'Tổng quan'], ['nhap-diem', 'Nhập điểm'], ['xep-hang', 'Xếp hạng'], ['tong-hop', 'Tổng hợp'], ['quan-ly', 'Quản lý'], ['lich-su', 'Lịch sử']];
  return (
    <div>
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
          <span className="chip rolebadge">{roleLabel}</span>
          <span className="chip"><span className="who">{session.name}</span></span>
          <button type="button" className="btn logout" onClick={handleSignOut}>{isSupabaseConfigured ? 'Đăng xuất' : 'Đổi vai trò'}</button>
        </div>
      </div></header>
      <main className="wrap">
        <div className="tabs">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => switchTab(k)}>{l}</button>)}</div>
        {msg && <div className="ok">{msg}</div>}
        {errs.length > 0 && <div className="err">{errs.map((e, i) => <div key={i}>• {e}</div>)}</div>}
        {session.role === 'codo' && assignment && <div className="warn">Bạn đang nhập cho lớp {state.classes.find(c => c.id === assignment.classId)?.name} — {state.weeks.find(w => w.id === assignment.weekId)?.label}. Chỉ nhập và nộp được lớp này.</div>}
        {currentScore?.status === 'returned' && <div className="err">Phiếu bị trả lại — lý do: {currentScore.returnReason}. Sửa lại rồi nộp lại nhé.</div>}

        {tab === 'tong-quan' && <Overview state={state} week={week} />}
        {tab === 'nhap-diem' && draft && (
          <ScoreForm state={state} week={week} draft={draft} calc={calc} canEdit={canEdit} classId={classId} setClassId={switchClass} weekId={effectiveWeekId} setWeekId={(id: string) => { if (confirmDirty()) setWeekId(id); }} search={search} setSearch={setSearch} classes={visibleClasses} currentScore={currentScore} setD={setD} dirty={dirty} onSaveDraft={() => saveScore('draft')} onSubmit={() => saveScore('submitted')} onApprove={approveScore} onReturn={returnScore} returnReason={returnReason} setReturnReason={setReturnReason} onReopen={reopenScore} onCopyPrev={copyPrevWeek} onShowPhieu={() => setShowPhieu(true)} showPhieu={showPhieu} onExportClass={doExportDocxClass} sessionRole={session.role} />
        )}
        {tab === 'xep-hang' && week && (
          <div className="card"><h2>Xếp hạng — {week.label} {week.submittedAt ? <span className="badge approved">Đã nộp {week.submittedAt}</span> : <span className="badge draft">Chưa chốt tuần</span>}</h2>
            <p>Chỉ phiếu <b>đã duyệt</b> mới vào xếp hạng chính thức. Còn {pendingScores.length} phiếu chờ duyệt, {state.classes.length - approvedScores.length} lớp chưa có phiếu duyệt.</p>
            <div className="row"><span><b>Khối:</b></span>{(['all', 'tu-nhien', 'xa-hoi'] as const).map(g => <button key={g} type="button" className={rankGroup === g ? 'btn' : 'btn ghost'} onClick={() => setRankGroup(g)}>{g === 'all' ? 'Tất cả các khối' : groupLabel(g)}</button>)}</div>
            {rankedScores.length >= 3 && <div className="podium" style={{ marginTop: 10 }}>{rankedScores.slice(0, 3).map((s, i) => <div key={s.id} className={`p${i + 1}`}><b>{i + 1}. {state.classes.find(c => c.id === s.classId)?.name}</b><br /><span style={{ fontSize: 22 }}>{calcScore(s.details).final}đ-{calcScore(s.details).cls}</span></div>)}</div>}
            <div className="row" style={{ marginTop: 10 }}><button className="btn" type="button" onClick={doExportDocxWeek}>Xuất Word (.docx)</button><button className="btn ghost" type="button" onClick={exportCsv}>Tải CSV</button><button className="btn ghost" type="button" onClick={copyZalo}>Chép gửi Zalo</button>
            {session.role === 'admin' && (week.submittedAt ? <button className="btn grey" type="button" onClick={reopenWeek}>Mở lại tuần</button> : <button className="btn green" type="button" onClick={closeWeek}>Nộp &amp; chốt tuần này</button>)}</div>
            <div className="tablewrap"><table><thead><tr><th>Hạng</th><th>Lớp</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Trạng thái</th></tr></thead><tbody>
              {rankedScores.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td><b>{state.classes.find(c => c.id === s.classId)?.name}</b></td><td>{calcScore(s.details).final}đ</td><td><span className={`badge ${calcScore(s.details).cls}`}>{calcScore(s.details).cls}</span></td><td>{s.submittedBy ?? '—'}<br /><small>{s.submittedAt ?? ''}</small></td><td><span className="badge approved">Đã duyệt</span></td></tr>)}
              {rankedScores.length === 0 && <tr><td colSpan={6}>Chưa có lớp nào được duyệt trong tuần này{rankGroup === 'all' ? '' : ` ở ${groupLabel(rankGroup)}`}.</td></tr>}
            </tbody></table></div></div>
        )}
        {tab === 'tong-hop' && <SummaryTab state={state} />}
        {tab === 'quan-ly' && <ManageTab state={state} setState={setState} session={session} onLog={(a: string, d: string) => update(s => s, a, d)} onExportJson={exportJson} onImportJson={importJson} profiles={profiles} onProfilePatch={patchProfile} onProfileDelete={removeProfile} onRefreshProfiles={() => { if (isSupabaseConfigured) listProfiles().then(setProfiles).catch(() => undefined); }} />}
        {tab === 'lich-su' && (
          <div className="card"><h2>Lịch sử hoạt động</h2>{session.role !== 'admin' && <p>Vai trò Chỉ xem / Cờ đỏ không xem được nhật ký chi tiết.</p>}
          {session.role === 'admin' && (state.logs.length === 0 ? <p>Chưa có hoạt động nào.</p> : <>
            <div className="tablewrap log-table-wrap"><table className="log-table"><thead><tr><th>Thời gian</th><th>Người làm</th><th>Vai trò</th><th>Việc làm</th><th>Chi tiết</th></tr></thead><tbody>{[...state.logs].reverse().map(l => <tr key={l.id}><td>{l.time}</td><td>{l.actor}</td><td>{l.role}</td><td>{l.action}</td><td>{l.detail}</td></tr>)}</tbody></table></div>
            <div className="log-list">{[...state.logs].reverse().map(l => <div key={l.id} className="log-item"><b>{l.action}</b>{l.detail ? ` — ${l.detail}` : ''}<div className="meta">{l.actor} • {l.role} • {l.time}</div></div>)}</div>
          </>)}
          </div>
        )}
      </main>
    </div>
  );
}

function Overview({ state, week }: { state: AppState; week?: Week }) {
  const total = state.classes.length;
  const approved = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'approved').length : 0;
  const submitted = week ? state.scores.filter(s => s.weekId === week.id && s.status === 'submitted').length : 0;
  const missing = state.classes.filter(c => !week || !state.scores.some(s => s.weekId === week.id && s.classId === c.id));
  const anomalies = week ? state.scores.filter(s => s.weekId === week.id && (calcScore(s.details).final > 150 || calcScore(s.details).final < 50)) : [];
  return (
    <div>
      <div className="kpi">
        <div><b>{state.weeks.length}</b>Tuần</div><div><b>{total}</b>Lớp</div>
        <div><b>{approved}/{total}</b>Đã duyệt</div><div><b>{submitted}</b>Chờ duyệt</div>
      </div>
      <div className="card"><h2>Quy trình làm việc</h2>
        <div className="steps"><span>1. Nháp</span><i>→</i><span>2. Cờ đỏ nộp</span><i>→</i><span>3. Ban thi đua duyệt</span><i>→</i><span>4. Chốt tuần</span></div>
        <p>Chỉ phiếu đã duyệt mới vào xếp hạng chính thức. Trả lại phải kèm lý do.</p>
        {week && <p>Tuần hiện tại: <b>{week.label}</b> {week.dateRange} {week.submittedAt ? `— Đã nộp ${week.submittedAt}` : '— Chưa chốt'}</p>}</div>
      <div className="card"><h2>Lớp cần nhắc</h2>{missing.length === 0 ? <p>Tất cả các lớp đã có phiếu.</p> : <p>{missing.map(c => <span key={c.id} className="chip-mini">{c.name}</span>)}</p>}</div>
      {anomalies.length > 0 && <div className="card"><h2>Cảnh báo bất thường</h2>{anomalies.map(s => <p key={s.id}>Lớp {state.classes.find(c => c.id === s.classId)?.name}: {calcScore(s.details).final}đ — kiểm tra lại số liệu trước khi duyệt.</p>)}</div>}
    </div>
  );
}

function SummaryTab({ state }: { state: AppState }) {
  const [mode, setMode] = useState<'week' | 'month' | 'group'>('week');
  // Các tháng có tuần, xếp theo thời gian (mới nhất cuối).
  const months = useMemo(() => {
    const map = new Map<string, Week[]>();
    state.weeks.forEach(w => { const m = monthOfWeek(w); if (!m) return; const arr = map.get(m) ?? []; arr.push(w); map.set(m, arr); });
    return [...map.entries()].sort((a, b) => { const [am, ay] = a[0].split('/').map(Number); const [bm, by] = b[0].split('/').map(Number); return ay - by || am - bm; });
  }, [state.weeks]);
  const [monthSel, setMonthSel] = useState('');
  const selMonth = monthSel || (months.length ? months[months.length - 1][0] : '');
  const monthWeeks = months.find(([m]) => m === selMonth)?.[1] ?? [];
  const avg = (classId: string, weekIds?: string[]) => classAvg(state, classId, weekIds ?? state.weeks.map(w => w.id));
  const ranked = [...state.classes].map(c => ({ c, a: avg(c.id) })).sort((x, y) => (y.a ?? -1) - (x.a ?? -1));
  const monthRows = [...state.classes].map(c => ({ c, a: avg(c.id, monthWeeks.map(w => w.id)) })).sort((x, y) => (y.a ?? -1) - (x.a ?? -1));
  const groupRows = (g: ClassGroup | null) => [...state.classes].filter(c => classGroup(c.name) === g).map(c => ({ c, a: avg(c.id) })).sort((x, y) => (y.a ?? -1) - (x.a ?? -1));
  const groupTable = (title: string, rows: { c: ClassItem; a: number | null }[]) => (
    <div className="card"><h2>{title}</h2>
      {rows.length === 0 ? <p>Chưa có lớp nào trong khối này.</p> : <div className="tablewrap slim"><table><thead><tr><th>Hạng</th><th>Lớp</th><th>Điểm TB</th><th>Loại</th></tr></thead><tbody>
        {rows.map(({ c, a }, i) => <tr key={c.id}><td>{a === null ? '—' : i + 1}</td><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td><td>{a === null ? '—' : <span className={`badge ${clsOf(a)}`}>{clsOf(a)}</span>}</td></tr>)}
      </tbody></table></div>}
    </div>
  );
  return (
    <div>
      <div className="tabs">
        <button type="button" className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Theo tuần</button>
        <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Theo tháng</button>
        <button type="button" className={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}>Theo khối</button>
      </div>
      {mode === 'week' && (
        <div className="card"><h2>Tổng hợp theo điểm trung bình qua các tuần</h2><p>Chỉ tính phiếu đã duyệt.</p>
          <div className="tablewrap"><table><thead><tr><th>Lớp</th><th>Điểm TB</th>{state.weeks.map(w => <th key={w.id}>{w.label}</th>)}</tr></thead><tbody>
            {ranked.map(({ c, a }) => <tr key={c.id}><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td>{state.weeks.map(w => { const s = state.scores.find(x => x.weekId === w.id && x.classId === c.id && x.status === 'approved'); return <td key={w.id}>{s ? `${calcScore(s.details).final}đ-${calcScore(s.details).cls}` : '—'}</td>; })}</tr>)}
          </tbody></table></div></div>
      )}
      {mode === 'month' && (
        <div className="card"><h2>Tổng hợp theo tháng</h2><p>Điểm trung bình của các phiếu đã duyệt trong các tuần thuộc tháng đã chọn.</p>
          {months.length === 0 ? <p>Chưa có tuần nào xác định được tháng. Thêm tháng khi tạo tuần ở tab Quản lý, hoặc nhập khoảng ngày có tháng/năm.</p> : <>
            <div className="row"><label style={{ margin: 0 }}>Tháng</label><select value={selMonth} onChange={e => setMonthSel(e.target.value)} style={{ maxWidth: 200 }}>{months.map(([m]) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select><span>{monthWeeks.map(w => w.label).join(', ')}</span></div>
            <div className="tablewrap"><table><thead><tr><th>Hạng</th><th>Lớp</th><th>Điểm TB</th><th>Loại</th>{monthWeeks.map(w => <th key={w.id}>{w.label}</th>)}</tr></thead><tbody>
              {monthRows.map(({ c, a }, i) => <tr key={c.id}><td>{a === null ? '—' : i + 1}</td><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td><td>{a === null ? '—' : <span className={`badge ${clsOf(a)}`}>{clsOf(a)}</span>}</td>{monthWeeks.map(w => { const s = state.scores.find(x => x.weekId === w.id && x.classId === c.id && x.status === 'approved'); return <td key={w.id}>{s ? `${calcScore(s.details).final}đ-${calcScore(s.details).cls}` : '—'}</td>; })}</tr>)}
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
  const pm = (plus: number, minus: number) => [plus ? `+${plus}đ` : '', minus ? `−${minus}đ` : ''].filter(Boolean).join(' • ') || '0đ';
  const f = (key: keyof Details, label: string, pts: string) => <Stepper label={label} pts={pts} value={d[key] as number} onChange={v => props.setD(key, v as never)} disabled={!canEdit} />;
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
          <div className="row"><button className="btn ghost" type="button" onClick={props.onCopyPrev}>Chép số liệu tuần trước</button><button className="btn ghost" type="button" onClick={props.onShowPhieu}>Xem phiếu tổng kết</button>{props.currentScore && <button className="btn ghost" type="button" onClick={props.onExportClass}>Xuất .docx phiếu này</button>}</div>
          <div className="grid2">
            <div>
              <Section title="Giờ học" sum={`Tổng ${calc.totalHours} giờ${calc.is100Tot ? ' • +20đ' : ''}${sec.hoursMinus ? ` • −${sec.hoursMinus}đ` : ''}`}>
              {f('hoursTot', 'Giờ Tốt', '')}
              {f('hoursKha', 'Giờ Khá', '-1đ/giờ')}
              {f('hoursTb', 'Giờ Trung bình', '-3đ/giờ')}
              {f('hoursYeu', 'Giờ Yếu', '-5đ/giờ')}
              <p>Tổng giờ: {calc.totalHours} giờ.</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, marginTop: 6 }}><input type="checkbox" checked={calc.is100Tot} disabled={!canEdit} onChange={e => props.setD('allGood', e.target.checked)} style={{ width: 22, height: 22 }} /> 100% giờ Tốt (+20đ)</label>
              {calc.is100Tot && (d.hoursKha + d.hoursTb + d.hoursYeu > 0) && <p>Lưu ý: đã tích 100% giờ Tốt nhưng vẫn có giờ Khá/Trung bình/Yếu — kiểm tra lại nhé.</p>}
              </Section>
              <Section title="Về học tập" sum={pm(sec.hocTapPlus, sec.hocTapMinus)}>
              {f('goodHigh', 'Tổng điểm tốt (≥5)', '+1đ/điểm')}
              {f('goodLow', 'Tổng điểm tốt (<5)', '-1đ/điểm')}
              {f('studyViol', 'Vi phạm học tập', '-1đ/lượt: không học bài, không soạn bài, không mang tài liệu')}
              {f('cheating', 'Gian lận trong thi', '-10đ/lượt')}
              {f('bonusYouth', 'Công trình thanh niên', '+20đ/lần')}
              {f('bonusSweep', 'Quét sân', '+10đ/lần')}
              {f('bonusNtvt', 'NTVT', '+10đ/lần')}
              </Section>
            </div>
            <div>
              <Section title="Về nề nếp" sum={pm(sec.neNepPlus, sec.neNepMinus)}>
              {f('absentTotal', 'Vắng học (tổng)', 'K phép -5đ/lượt')}
              {f('absentPermit', 'Trong đó: có phép', '')}
              {f('absentNoPermit', 'Trong đó: không phép', '-5đ/lượt')}
              {f('late', 'Đi muộn, sinh hoạt 15p tự ý ra ngoài', '-2đ/lượt')}
              {f('noisy', 'Lớp ồn trong sinh hoạt 15p', '-5đ/lượt')}
              {f('privateWork', 'Làm việc riêng, không nghiêm túc, ngủ gục', '-2đ/lượt')}
              {f('lateDuty', 'Trực nhật muộn', '-2đ/lượt')}
              {f('dirty', 'Lớp bẩn', '-5đ/lượt')}
              {f('food', 'Ăn/mang đồ ăn vào lớp', '-2đ/lượt')}
              {f('dress', 'Mang dép lê, không đeo thẻ HS', '-1đ/lượt')}
              {f('skip', 'Bỏ tiết', '-5đ/lượt')}
              {f('dishonest', 'Không trung thực, nói tục, chửi thề', '-5đ/lượt')}
              {f('parking', 'Để xe sai quy định, nẹt bô', '-5đ/lượt')}
              {f('phone', 'Dùng điện thoại trong giờ học', '-10đ/lượt')}
              {f('traffic', 'Vi phạm ATGT', '-10đ/lượt')}
              {f('fight', 'Đánh nhau, vô lễ với GV', '-20đ/lượt')}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, marginTop: 6 }}><input type="checkbox" checked={calc.noAbsentLate} disabled={!canEdit} onChange={e => props.setD('noAbsLate', e.target.checked)} style={{ width: 22, height: 22 }} /> 100% không vắng, không đi muộn (+10đ)</label>
              {calc.noAbsentLate && (d.absentTotal > 0 || d.late > 0) && <p>Lưu ý: đã tích 100% không vắng, không đi muộn nhưng vẫn có vắng/đi muộn — kiểm tra lại nhé.</p>}
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
          <label>Tên HS vi phạm (bắt buộc khi có vi phạm)</label>
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
              <div className="row"><button className="btn green" type="button" onClick={props.onApprove}>Duyệt phiếu</button><button className="btn grey" type="button" onClick={props.onReopen}>Mở lại để sửa</button></div>
              <label>Lý do trả lại (bắt buộc khi trả)</label><input type="text" value={props.returnReason} onChange={e => props.setReturnReason(e.target.value)} placeholder="Vd: Thiếu tên HS đi muộn" />
              <div className="row" style={{ marginTop: 8 }}><button className="btn" type="button" onClick={props.onReturn}>Trả lại phiếu</button></div>
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
  profiles: Profile[]; onProfilePatch: (id: string, patch: Partial<Pick<Profile, 'role' | 'status' | 'assigned_class_id' | 'assigned_week_id'>>) => void; onProfileDelete: (id: string) => void; onRefreshProfiles: () => void;
}) {
  const [weekLabel, setWeekLabel] = useState(''); const [weekRange, setWeekRange] = useState(''); const [weekMonth, setWeekMonth] = useState(currentMonth);
  const [className, setClassName] = useState('');
  const [bulkBase, setBulkBase] = useState('10B'); const [bulkFrom, setBulkFrom] = useState(1); const [bulkTo, setBulkTo] = useState(5);
  const [codoName, setCodoName] = useState(''); const [codoClass, setCodoClass] = useState(''); const [codoWeek, setCodoWeek] = useState('');
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
              const clsName = p.role === 'codo' ? state.classes.find(c => c.id === p.assigned_class_id)?.name : undefined;
              return (
              <div key={p.id} className="card" style={{ marginTop: 10 }}>
                <p><b>{p.full_name}</b>{clsName ? ` — Lớp ${clsName}` : p.role === 'codo' ? <span style={{ color: '#9ca3af' }}> — Chưa gán lớp</span> : ''} — {p.email} {session.id === p.id && <span className="badge">Tài khoản của bạn</span>}</p>
                <div className="row">
                  <div style={{ minWidth: 150 }}><label>Vai trò</label><select value={p.role} disabled={session.id === p.id} onChange={e => onProfilePatch(p.id, { role: e.target.value as Role })}><option value="admin">Ban thi đua</option><option value="codo">Cờ đỏ trực</option><option value="viewer">Chỉ xem</option></select></div>
                  <div style={{ minWidth: 150 }}><label>Trạng thái</label><span className={`badge ${p.status === 'active' ? 'approved' : p.status === 'pending' ? 'submitted' : 'returned'}`}>{p.status === 'active' ? 'Đang dùng' : p.status === 'pending' ? 'Chờ duyệt' : 'Đã khóa'}</span></div>
                </div>
                {p.role === 'codo' && (
                  <div className="row">
                    <div style={{ minWidth: 150 }}><label>Gán lớp</label><select value={p.assigned_class_id ?? ''} onChange={e => onProfilePatch(p.id, { assigned_class_id: e.target.value || null })}><option value="">Chưa gán</option>{state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div style={{ minWidth: 150 }}><label>Gán tuần</label><select value={p.assigned_week_id ?? ''} onChange={e => onProfilePatch(p.id, { assigned_week_id: e.target.value || null })}><option value="">Chưa gán</option>{state.weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
                  </div>
                )}
                <div className="row" style={{ marginTop: 8 }}>
                  {p.status === 'pending' && <button className="btn green" type="button" onClick={() => onProfilePatch(p.id, { status: 'active' })}>Duyệt</button>}
                  {p.status === 'active' && session.id !== p.id && <button className="btn grey" type="button" onClick={() => onProfilePatch(p.id, { status: 'disabled' })}>Khóa tài khoản</button>}
                  {p.status === 'disabled' && <button className="btn green" type="button" onClick={() => onProfilePatch(p.id, { status: 'active' })}>Mở lại tài khoản</button>}
                  {session.id !== p.id && <button className="btn" type="button" onClick={() => onProfileDelete(p.id)}>Xóa tài khoản</button>}
                </div>
              </div>
              );
            })}
          </>
        )}
      </div>
      <div className="card"><h2>Tuần</h2>
        <div className="row"><input type="text" placeholder="Vd: Tuần 4" value={weekLabel} onChange={e => setWeekLabel(e.target.value)} style={{ maxWidth: 200 }} /><input type="text" placeholder="Vd: 17/11 – 22/11" value={weekRange} onChange={e => setWeekRange(e.target.value)} style={{ maxWidth: 220 }} /><input type="text" placeholder="Tháng (vd 11/2026)" value={weekMonth} onChange={e => setWeekMonth(e.target.value)} style={{ maxWidth: 160 }} /><button className="btn" type="button" onClick={() => { if (!weekLabel.trim()) return; const m = weekMonth.trim(); const w: Week = { id: uid(), label: weekLabel.trim(), dateRange: weekRange.trim(), ...(/^(0[1-9]|1[0-2])\/\d{4}$/.test(m) ? { month: m } : {}) }; setState({ ...state, weeks: [...state.weeks, w] }); onLog('Tạo tuần', `${w.label} — Tháng ${monthOfWeek(w) ?? 'chưa rõ tháng'}`); setWeekLabel(''); setWeekRange(''); setWeekMonth(currentMonth()); }}>Thêm tuần</button></div>
        {state.weeks.map(w => <p key={w.id}>{w.label} {w.dateRange} — Tháng {monthOfWeek(w) ?? 'Chưa rõ tháng'} {w.submittedAt ? `— Đã nộp ${w.submittedAt}` : '— Chưa chốt'} <button className="btn grey" type="button" onClick={() => { if (!window.confirm(`Xóa ${w.label} và toàn bộ phiếu của tuần này?`)) return; setState({ ...state, weeks: state.weeks.filter(x => x.id !== w.id), scores: state.scores.filter(x => x.weekId !== w.id) }); onLog('Xóa tuần', w.label); }}>Xóa</button></p>)}
      </div>
      <div className="card"><h2>Lớp</h2>
        <div className="row"><input type="text" placeholder="Vd: 10B1" value={className} onChange={e => setClassName(e.target.value)} style={{ maxWidth: 200 }} /><button className="btn" type="button" onClick={() => { if (!className.trim()) return; const c: ClassItem = { id: uid(), name: className.trim().toUpperCase() }; setState({ ...state, classes: [...state.classes, c] }); onLog('Thêm lớp', c.name); setClassName(''); }}>Thêm lớp</button></div>
        <div className="row"><input type="text" value={bulkBase} onChange={e => setBulkBase(e.target.value)} style={{ maxWidth: 100 }} /><input type="number" value={bulkFrom} onChange={e => setBulkFrom(Number(e.target.value))} style={{ maxWidth: 80 }} /><span>đến</span><input type="number" value={bulkTo} onChange={e => setBulkTo(Number(e.target.value))} style={{ maxWidth: 80 }} /><button className="btn ghost" type="button" onClick={() => { const news: ClassItem[] = []; for (let i = bulkFrom; i <= bulkTo; i++) { const nm = `${bulkBase}${i}`; if (!state.classes.some(c => c.name === nm)) news.push({ id: uid(), name: nm }); } setState({ ...state, classes: [...state.classes, ...news] }); onLog('Thêm cả khối lớp', news.map(c => c.name).join(', ')); }}>Thêm cả khối (vd 10B1–10B5)</button></div>
        <p>{state.classes.map(c => c.name).join(', ') || 'Chưa có lớp nào.'}</p>
      </div>
      <div className="card"><h2>Cờ đỏ trực — phân công</h2>
        <div className="row"><input type="text" placeholder="Tên cờ đỏ" value={codoName} onChange={e => setCodoName(e.target.value)} style={{ maxWidth: 200 }} />
          <select value={codoClass} onChange={e => setCodoClass(e.target.value)} style={{ maxWidth: 160 }}><option value="">Chọn lớp</option>{state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={codoWeek} onChange={e => setCodoWeek(e.target.value)} style={{ maxWidth: 160 }}><option value="">Chọn tuần</option>{state.weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
          <button className="btn" type="button" onClick={() => { if (!codoName.trim() || !codoClass || !codoWeek) return; setState({ ...state, roster: [...state.roster, { id: uid(), name: codoName.trim(), classId: codoClass, weekId: codoWeek, active: true }] }); onLog('Phân công cờ đỏ', `${codoName.trim()} — ${state.classes.find(c => c.id === codoClass)?.name}`); setCodoName(''); }}>Thêm cờ đỏ</button></div>
        {state.roster.map(r => <p key={r.id}>{r.name} — Lớp {state.classes.find(c => c.id === r.classId)?.name} — {state.weeks.find(w => w.id === r.weekId)?.label} — {r.active ? 'Đang trực' : 'Đã tắt'} <button className="btn grey" type="button" onClick={() => setState({ ...state, roster: state.roster.map(x => x.id === r.id ? { ...x, active: !x.active } : x) })}>{r.active ? 'Tắt' : 'Bật'}</button></p>)}
        {state.roster.length === 0 && <p>Chưa phân công cờ đỏ nào.</p>}
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
    </div>
  );
}
