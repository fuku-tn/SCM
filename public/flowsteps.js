/* Workflow: các bước nhỏ (flow con) bên trong mỗi chặng. Dữ liệu thật do server ghi vào run.stages[i].steps;
   run cũ chưa có thì suy ra từ trạng thái chặng. */
const FS_IN = [['read', 'Tải file dữ liệu'], ['profile', 'Profile cột & kiểu']];
const FS_OUT = [['collect', 'Gom kết quả 4 chặng'], ['export', 'Xuất PBIP / zip']];
const FS_ICON = {
  pending: '<i class="fs-c">○</i>', running: '<span class="spin"></span>', done: '<i class="fs-c">✓</i>', error: '<i class="fs-c">!</i>',
  skipped: '<i class="fs-c">–</i>', waiting: '<i class="fs-c">⚠</i>',
};
/** danh sách bước của node thứ i (0 = đầu vào, 1..4 = 4 chặng, N-1 = output) */
function flowStepsFor(r, i, N) {
  if (i === 0) return FS_IN.map(([id, label]) => ({ id, label, status: r ? 'done' : 'pending' }));
  if (i === N - 1) return FS_OUT.map(([id, label]) => ({ id, label, status: r && r.status === 'done' ? 'done' : 'pending' }));
  const st = r && r.stages && r.stages[i - 1];
  if (st && st.steps && st.steps.length) return st.steps;
  const defs = ((typeof META !== 'undefined' && META.steps && META.steps[i - 1]) || []).filter((d) => d.id !== 'eval' && d.id !== 'plan' && (d.id !== 'version' || (r && r.form && (r.form.versions || []).length)));
  const s = (st && st.status) || 'pending';
  return defs.map((d, k) => ({ id: d.id, label: d.label, status: s === 'done' ? 'done' : s === 'running' ? (k === 0 ? 'running' : 'pending') : s === 'error' ? (k === defs.length - 1 ? 'error' : 'done') : 'pending' }));
}
/** cập nhật tại chỗ (không dựng lại) để hiệu ứng CSS không bị chớp mỗi giây */
function flowSyncSubs(el, steps, now) {
  const box = el.querySelector('.fsubs'); if (!box) return;
  const have = new Map([...box.children].map((c) => [c.dataset.id, c]));
  const ids = steps.map((s) => s.id);
  have.forEach((c, k) => { if (!ids.includes(k)) c.remove(); });
  steps.forEach((t, idx) => {
    let c = have.get(t.id);
    if (!c) { c = document.createElement('div'); c.dataset.id = t.id; c.innerHTML = '<span class="fs-i"></span><span class="fs-t"></span><small class="fs-x"></small>'; }
    if (box.children[idx] !== c) box.insertBefore(c, box.children[idx] || null);
    const cls = 'fsub ' + t.status; if (c.className !== cls) c.className = cls;
    const ic = c.querySelector('.fs-i'); if (ic.dataset.s !== t.status) { ic.innerHTML = FS_ICON[t.status] || FS_ICON.pending; ic.dataset.s = t.status; }
    const tt = c.querySelector('.fs-t'); if (tt.textContent !== t.label) tt.textContent = t.label;
    let x = '';
    if (t.status === 'running' && t.startedAt) x = Math.max(0, Math.floor((now - t.startedAt) / 1000)) + 's';
    else if ((t.status === 'done' || t.status === 'error') && t.startedAt && t.endedAt) x = ((t.endedAt - t.startedAt) / 1000).toFixed(t.endedAt - t.startedAt < 10000 ? 1 : 0) + 's' + (t.note ? ' · ' + t.note : '');
    else if (t.note) x = t.note;
    const xe = c.querySelector('.fs-x'); if (xe.textContent !== x) xe.textContent = x;
    c.title = t.label + ' — ' + ({ pending: 'chờ', running: 'đang chạy', done: 'xong', error: 'lỗi', skipped: 'bỏ qua', waiting: 'chờ dữ liệu' }[t.status] || t.status) + (t.note ? ' (' + t.note + ')' : '');
  });
}
