import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, ClassItem, Details, Role, Score, Week } from './lib';
import { calcScore, downloadBlob, emptyDetails, emptyState, hocTapLines, neNepLines, nowStr, toCsv, uid, validateDetails } from './lib';
import { exportClassDocx, exportWeekDocx } from './docxExport';

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

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [session, setSession] = useState<{ role: Role; name: string } | null>(() => {
    try { const raw = localStorage.getItem(LS_SESSION); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
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

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { if (session) localStorage.setItem(LS_SESSION, JSON.stringify(session)); else localStorage.removeItem(LS_SESSION); }, [session]);

  const week: Week | undefined = state.weeks.find(w => w.id === weekId) ?? state.weeks[state.weeks.length - 1];
  const effectiveWeekId = week?.id ?? '';
  const currentScore: Score | undefined = state.scores.find(s => s.weekId === effectiveWeekId && s.classId === classId);
  const assignment = session?.role === 'codo' ? state.roster.find(r => r.name === session.name && r.active) : undefined;

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
    const errors = status === 'submitted' ? validateDetails(draft, state.settings.standardHours) : [];
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
  const pendingScores = useMemo(() => week ? state.scores.filter(s => s.weekId === week.id && s.status === 'submitted') : [], [state.scores, week]);
  const filteredClasses = state.classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const visibleClasses = session?.role === 'codo' && assignment ? state.classes.filter(c => c.id === assignment.classId) : filteredClasses;

  if (!session) {
    return (
      <div><header className="top"><h1>HỆ THỐNG TỔNG THI ĐUA</h1><p>{state.settings.school} — {state.settings.dept}</p></header>
      <main className="wrap"><div className="card"><h2>Chọn vai trò để vào hệ thống</h2><p>Ban thi đua quản lý toàn bộ. Cờ đỏ chỉ nhập lớp được phân công. Chỉ xem không được nhập hay sửa.</p>
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
      <header className="top"><h1>HỆ THỐNG TỔNG THI ĐUA</h1><p>{state.settings.school} — {state.settings.dept} • {week ? week.label : 'Chưa có tuần'} • Vai trò: {roleLabel} — {session.name} • <button type="button" className="btn grey" onClick={() => setSession(null)}>Đổi vai trò</button></p></header>
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
            {approvedScores.length >= 3 && <div className="podium">{approvedScores.slice(0, 3).map((s, i) => <div key={s.id} className={`p${i + 1}`}><b>{i + 1}. {state.classes.find(c => c.id === s.classId)?.name}</b><br /><span style={{ fontSize: 22 }}>{calcScore(s.details).final}đ-{calcScore(s.details).cls}</span></div>)}</div>}
            <div className="row" style={{ marginTop: 10 }}><button className="btn" type="button" onClick={doExportDocxWeek}>Xuất Word (.docx)</button><button className="btn ghost" type="button" onClick={exportCsv}>Tải CSV</button><button className="btn ghost" type="button" onClick={copyZalo}>Chép gửi Zalo</button>
            {session.role === 'admin' && (week.submittedAt ? <button className="btn grey" type="button" onClick={reopenWeek}>Mở lại tuần</button> : <button className="btn green" type="button" onClick={closeWeek}>Nộp &amp; chốt tuần này</button>)}</div>
            <table><thead><tr><th>Hạng</th><th>Lớp</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Trạng thái</th></tr></thead><tbody>
              {approvedScores.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td><b>{state.classes.find(c => c.id === s.classId)?.name}</b></td><td>{calcScore(s.details).final}đ</td><td><span className={`badge ${calcScore(s.details).cls}`}>{calcScore(s.details).cls}</span></td><td>{s.submittedBy ?? '—'}<br /><small>{s.submittedAt ?? ''}</small></td><td><span className="badge approved">Đã duyệt</span></td></tr>)}
              {approvedScores.length === 0 && <tr><td colSpan={6}>Chưa có lớp nào được duyệt trong tuần này.</td></tr>}
            </tbody></table></div>
        )}
        {tab === 'tong-hop' && <SummaryTab state={state} />}
        {tab === 'quan-ly' && <ManageTab state={state} setState={setState} session={session} onLog={(a: string, d: string) => update(s => s, a, d)} onExportJson={exportJson} onImportJson={importJson} />}
        {tab === 'lich-su' && (
          <div className="card"><h2>Lịch sử hoạt động</h2>{session.role !== 'admin' && <p>Vai trò Chỉ xem / Cờ đỏ không xem được nhật ký chi tiết.</p>}
          {session.role === 'admin' && (state.logs.length === 0 ? <p>Chưa có hoạt động nào.</p> : <table><thead><tr><th>Thời gian</th><th>Người làm</th><th>Vai trò</th><th>Việc làm</th><th>Chi tiết</th></tr></thead><tbody>{[...state.logs].reverse().map(l => <tr key={l.id}><td>{l.time}</td><td>{l.actor}</td><td>{l.role}</td><td>{l.action}</td><td>{l.detail}</td></tr>)}</tbody></table>)}
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
      <div className="card"><h2>Quy trình làm việc</h2><p>1. Nháp → 2. Cờ đỏ nộp → 3. Ban thi đua duyệt / trả lại kèm lý do → 4. Nộp &amp; chốt tuần. Chỉ phiếu đã duyệt mới vào xếp hạng chính thức.</p>
      {week && <p>Tuần hiện tại: <b>{week.label}</b> {week.dateRange} {week.submittedAt ? `— Đã nộp ${week.submittedAt}` : '— Chưa chốt'}</p>}</div>
      <div className="card"><h2>Lớp cần nhắc</h2>{missing.length === 0 ? <p>Tất cả các lớp đã có phiếu.</p> : <p>{missing.map(c => c.name).join(', ')}</p>}</div>
      {anomalies.length > 0 && <div className="card"><h2>Cảnh báo bất thường</h2>{anomalies.map(s => <p key={s.id}>Lớp {state.classes.find(c => c.id === s.classId)?.name}: {calcScore(s.details).final}đ — kiểm tra lại số liệu trước khi duyệt.</p>)}</div>}
    </div>
  );
}

function SummaryTab({ state }: { state: AppState }) {
  const avg = (classId: string) => { const list = state.scores.filter(s => s.classId === classId && s.status === 'approved'); if (!list.length) return null; return list.reduce((a, s) => a + calcScore(s.details).final, 0) / list.length; };
  const ranked = [...state.classes].map(c => ({ c, a: avg(c.id) })).sort((x, y) => (y.a ?? -1) - (x.a ?? -1));
  return (
    <div className="card"><h2>Tổng hợp theo điểm trung bình qua các tuần</h2><p>Chỉ tính phiếu đã duyệt.</p>
      <table><thead><tr><th>Lớp</th><th>Điểm TB</th>{state.weeks.map(w => <th key={w.id}>{w.label}</th>)}</tr></thead><tbody>
        {ranked.map(({ c, a }) => <tr key={c.id}><td><b>{c.name}</b></td><td>{a === null ? '—' : `${a.toFixed(1)}đ`}</td>{state.weeks.map(w => { const s = state.scores.find(x => x.weekId === w.id && x.classId === c.id && x.status === 'approved'); return <td key={w.id}>{s ? `${calcScore(s.details).final}đ-${calcScore(s.details).cls}` : '—'}</td>; })}</tr>)}
      </tbody></table></div>
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
  const { state, week, draft, calc, canEdit } = props;
  const d = draft;
  const f = (key: keyof Details, label: string, pts: string) => <Stepper label={label} pts={pts} value={d[key] as number} onChange={v => props.setD(key, v as never)} disabled={!canEdit} />;
  return (
    <div>
      <div className="card">
        <div className="row">
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
              <h3>Giờ học</h3>
              {f('hoursTot', 'Giờ Tốt', '100% giờ Tốt thì +20đ')}
              {f('hoursKha', 'Giờ Khá', '-1đ/giờ')}
              {f('hoursTb', 'Giờ Trung bình', '-3đ/giờ')}
              {f('hoursYeu', 'Giờ Yếu', '-5đ/giờ')}
              <p>Tổng giờ: {calc.totalHours} / chuẩn {state.settings.standardHours} giờ. {calc.is100Tot && 'Đạt 100% giờ Tốt (+20đ).'}</p>
              <h3>Về học tập</h3>
              {f('goodHigh', 'Tổng điểm tốt (≥5)', '+1đ/điểm')}
              {f('goodLow', 'Tổng điểm tốt (<5)', '-1đ/điểm')}
              {f('studyViol', 'Vi phạm học tập', '-1đ/lượt: không học bài, không soạn bài, không mang tài liệu')}
              {f('cheating', 'Gian lận trong thi', '-10đ/lượt')}
              {f('bonusYouth', 'Công trình thanh niên', '+20đ/lần')}
              {f('bonusSweep', 'Quét sân', '+10đ/lần')}
              {f('bonusNtvt', 'NTVT', '+10đ/lần')}
            </div>
            <div>
              <h3>Về nề nếp</h3>
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
            </div>
          </div>
          <label>Tên HS vi phạm (bắt buộc khi có vi phạm)</label>
          <input type="text" placeholder="Vd: Lan Anh, Sang, Ngân…" value={d.names} disabled={!canEdit} onChange={e => props.setD('names', e.target.value)} />
          <label>Ý kiến của lớp theo dõi</label>
          <textarea value={d.opinionClass} disabled={!canEdit} onChange={e => props.setD('opinionClass', e.target.value)} />
          <label>Ý kiến của cờ đỏ</label>
          <textarea value={d.opinionCodo} disabled={!canEdit} onChange={e => props.setD('opinionCodo', e.target.value)} />
          {!canEdit && <div className="warn">Phiếu này bạn không được sửa (xem phân quyền / phiếu đã nộp hoặc đã duyệt / tuần đã chốt).</div>}
          <div className="scorebar"><span>(1) Cộng: <b>+{calc.plus}đ</b></span><span>(2) Trừ: <b>-{calc.minus}đ</b></span><span>Điểm thi đua: <b>{calc.final}đ</b></span><span className={`badge ${calc.cls}`}>Loại {calc.cls}</span><span style={{ flex: 1 }} />
            <button className="btn ghost" type="button" disabled={!canEdit} onClick={props.onSaveDraft}>Lưu nháp</button>
            <button className="btn" type="button" disabled={!canEdit} onClick={props.onSubmit}>Lưu &amp; nộp phiếu từng lớp</button>
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

function ManageTab({ state, setState, session, onLog, onExportJson, onImportJson }: {
  state: AppState; setState: (s: AppState) => void; session: { role: Role; name: string };
  onLog: (a: string, d: string) => void; onExportJson: () => void; onImportJson: (f: File) => void;
}) {
  const [weekLabel, setWeekLabel] = useState(''); const [weekRange, setWeekRange] = useState('');
  const [className, setClassName] = useState('');
  const [bulkBase, setBulkBase] = useState('10B'); const [bulkFrom, setBulkFrom] = useState(1); const [bulkTo, setBulkTo] = useState(5);
  const [codoName, setCodoName] = useState(''); const [codoClass, setCodoClass] = useState(''); const [codoWeek, setCodoWeek] = useState('');
  const isAdmin = session.role === 'admin';
  if (!isAdmin) return <div className="card"><h2>Quản lý</h2><p>Chỉ Ban thi đua mới quản lý tuần, lớp, cờ đỏ và cài đặt.</p></div>;
  return (
    <div>
      <div className="card"><h2>Tuần</h2>
        <div className="row"><input type="text" placeholder="Vd: Tuần 4" value={weekLabel} onChange={e => setWeekLabel(e.target.value)} style={{ maxWidth: 200 }} /><input type="text" placeholder="Vd: 17/11 – 22/11" value={weekRange} onChange={e => setWeekRange(e.target.value)} style={{ maxWidth: 220 }} /><button className="btn" type="button" onClick={() => { if (!weekLabel.trim()) return; const w: Week = { id: uid(), label: weekLabel.trim(), dateRange: weekRange.trim() }; setState({ ...state, weeks: [...state.weeks, w] }); onLog('Tạo tuần', w.label); setWeekLabel(''); setWeekRange(''); }}>Thêm tuần</button></div>
        {state.weeks.map(w => <p key={w.id}>{w.label} {w.dateRange} {w.submittedAt ? `— Đã nộp ${w.submittedAt}` : '— Chưa chốt'} <button className="btn grey" type="button" onClick={() => { if (!window.confirm(`Xóa ${w.label} và toàn bộ phiếu của tuần này?`)) return; setState({ ...state, weeks: state.weeks.filter(x => x.id !== w.id), scores: state.scores.filter(x => x.weekId !== w.id) }); onLog('Xóa tuần', w.label); }}>Xóa</button></p>)}
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
        <label>Giờ học chuẩn / tuần</label><input type="number" value={state.settings.standardHours} onChange={e => setState({ ...state, settings: { ...state.settings, standardHours: Number(e.target.value) || 0 } })} />
        <label>Nhận xét chung — Ưu điểm (để trống sẽ tự gợi ý)</label><textarea value={state.settings.generalPros} onChange={e => setState({ ...state, settings: { ...state.settings, generalPros: e.target.value } })} />
        <label>Nhận xét chung — Nhược điểm (để trống sẽ tự gợi ý)</label><textarea value={state.settings.generalCons} onChange={e => setState({ ...state, settings: { ...state.settings, generalCons: e.target.value } })} />
      </div>
      <div className="card"><h2>Sao lưu dữ liệu</h2><p>Dữ liệu lưu trên trình duyệt (localStorage). Xuất file JSON để sao lưu, nhập lại khi đổi máy.</p>
        <div className="row"><button className="btn" type="button" onClick={onExportJson}>Xuất JSON sao lưu</button><label className="btn ghost" style={{ padding: '10px 14px' }}>Nhập JSON sao lưu<input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onImportJson(f); }} /></label></div>
      </div>
    </div>
  );
}
