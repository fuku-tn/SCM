/* Bước Dashboard: tải template .pbix của bạn + màn hình review bố cục (trang, biểu đồ, Top N, góp ý, duyệt) trước khi chạy chặng 4 */
const ROLE_COL = { kpi: '#C8A96B', trend: '#4C78A8', compare: '#2F9A70', share: '#9B6BB5', filter: '#8D959E', detail: '#B07A4A', other: '#B8BDC4' };
const ROLE_VN = { kpi: 'Thẻ KPI', trend: 'Xu hướng', compare: 'So sánh', share: 'Tỷ trọng', filter: 'Bộ lọc', detail: 'Chi tiết', other: 'Khác' };
const TYPE_VN = {
  clusteredColumnChart: 'Column', clusteredBarChart: 'Bar', stackedColumnChart: 'Stacked column', stackedBarChart: 'Stacked bar', lineChart: 'Line', areaChart: 'Area', pieChart: 'Pie', donutChart: 'Donut',
  cardVisual: 'KPI card', card: 'KPI card', kpi: 'KPI', slicer: 'Slicer', advancedSlicerVisual: 'Slicer', listSlicer: 'Slicer', textSlicer: 'Slicer', tableEx: 'Table', pivotTable: 'Matrix', treemap: 'Treemap',
  lineClusteredColumnComboChart: 'Combo', waterfallChart: 'Waterfall', scatterChart: 'Scatter', funnel: 'Funnel',
};
const tyName = (t) => TYPE_VN[t] || t || '—';

// ---------- 4.1: template .pbix của người dùng ----------
function drawPbix() {
  const host = $('#dz-pbix'); if (!host) return;
  dz(host, {
    slot: 'pbix', exts: ['pbix'], maxMB: 100, title: 'Kéo thả file template .pbix vào đây hoặc bấm để chọn', hint: 'Định dạng PBIR · nhỏ hơn 100MB', minBusy: 900, busyText: 'Đang tải và đọc template…',
    get: () => A.pbix, set: (v) => { A.pbix = v; drawPbixView(); },
    meta: (c) => (c.template ? `${fsize(c.size)} · ${c.template.pages.length} trang · ${c.template.dataVisuals} biểu đồ dữ liệu` : fsize(c.size)),
    onChange: () => { A.plan = null; A.planApproved = false; drawPlanBox(); refresh(); },
  });
  drawPbixView();
}
function drawPbixView() {
  const host = $('#pbix-view'); if (!host) return;
  const t = A.pbix && !A.pbix.busy && A.pbix.template; if (!t) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="pbix-info"><div class="tpl-prev"><img src="/api/runs/${A.runId}/pbix/wireframe.svg?v=${encodeURIComponent(A.pbix.name + A.pbix.size)}" alt="Sơ đồ bố cục ${esc(t.name)}"></div>
    <div class="pbix-pages"><b>${esc(t.name)}</b><span class="sub" style="margin:2px 0 8px">${t.pages.length} trang · ${t.dataVisuals} biểu đồ dữ liệu · ${t.sizeMB} MB</span>
    ${t.pages.map((p) => `<div class="pbix-pg"><span>Trang ${p.no} · ${esc(p.name)}</span><b>${p.dataVisuals} biểu đồ</b></div>`).join('')}
    ${t.pages.every((p) => !p.dataVisuals) ? '<div class="err-box" style="margin-top:8px">Template không có biểu đồ dữ liệu nào để gắn dữ liệu.</div>' : ''}</div></div>`;
}

// ---------- 4.3: ô trạng thái bố cục ----------
function planCounts(p) {
  let v = 0; p.pages.forEach((pg) => pg.visuals.forEach((x) => { if (!x.remove && x.slot) v++; }));
  return { pages: p.pages.length, visuals: v, warns: (p.warnings || []).length };
}
function drawPlanBox() {
  const host = $('#plan-box'); if (!host) return;
  const prereq = !tplId() ? 'Chọn hoặc tải template ở mục 4.1 trước.' : !A.data ? 'Cần dữ liệu — tải file CSV / Excel ở bước 3 trước.' : !A.metrics.length || !A.dimensions.length ? 'Cần chọn Key Metrics và Dimension ở bước 2 trước.' : '';
  const modelSel = `<select id="plan-model" title="Model dùng để đề xuất bố cục" style="width:auto;padding:6px 28px 6px 12px;font-size:13px">${META.models.map((m) => `<option value="${m.id}" ${m.id === A.planModel ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>`;
  if (prereq) { host.innerHTML = `<div class="sub" style="margin:0">${esc(prereq)}</div>`; return; }
  if (!A.plan) {
    host.innerHTML = `<p class="sub" style="margin:0 0 10px">BIE đề xuất số trang và biểu đồ cho từng trang (bám các trang của template, nhân bản trang khi cần nhiều trang hơn), kèm lý do và giới hạn số giá trị hiển thị. Bạn xem, sửa loại biểu đồ, góp ý rồi duyệt.</p>
      <div class="plan-act"><button class="btn acc" id="plan-gen" type="button">✦ Đề xuất bố cục</button>${modelSel}<span id="plan-busy"></span></div>`;
    $('#plan-gen').onclick = async () => {
      const b = $('#plan-gen'); b.disabled = true; $('#plan-busy').innerHTML = '<span class="spin"></span> AI đang đề xuất bố cục…';
      try { await genPlan(''); drawPlanBox(); refresh(); openPlan(); } catch (e) { toast(e.message); b.disabled = false; $('#plan-busy').textContent = ''; }
    };
  } else {
    const c = planCounts(A.plan), stale = planStale();
    host.innerHTML = `<div class="plan-sum"><span class="pill ${stale ? 'err' : A.planApproved ? 'ok' : ''}">${stale ? 'Không còn khớp' : A.planApproved ? '✓ Đã duyệt' : 'Bản nháp — chưa duyệt'}</span>
        <b>${c.pages} trang · ${c.visuals} biểu đồ</b>${c.warns ? `<span class="pill mut">${c.warns} lưu ý</span>` : ''}${A.plan.via === 'rules' ? '<span class="pill mut">theo quy tắc (AI không trả được bố cục)</span>' : ''}</div>
      <p class="sub" style="margin:8px 0 10px">${esc(A.plan.storyline || '')}</p>
      ${stale ? '<div class="err-box" style="margin-bottom:10px">Bạn đã đổi chỉ số / chiều / template / ngôn ngữ sau khi duyệt — hãy đề xuất lại bố cục. Nếu chạy ngay, bố cục cũ sẽ bị bỏ và chặng 4 tự thiết kế.</div>' : ''}
      <div class="plan-act"><button class="btn acc" id="plan-open" type="button">Xem &amp; chỉnh bố cục</button><button class="btn ghost" id="plan-regen" type="button">↻ Đề xuất lại</button>${modelSel}<span id="plan-busy"></span></div>`;
    $('#plan-open').onclick = () => openPlan();
    $('#plan-regen').onclick = async () => {
      const b = $('#plan-regen'); b.disabled = true; $('#plan-busy').innerHTML = '<span class="spin"></span> AI đang đề xuất lại…';
      try { await genPlan(''); drawPlanBox(); refresh(); openPlan(); } catch (e) { toast(e.message); b.disabled = false; $('#plan-busy').textContent = ''; }
    };
  }
  const ms = $('#plan-model'); if (ms) ms.onchange = (e) => (A.planModel = e.target.value);
}
async function genPlan(feedback, prev) {
  const id = await ensureRun();
  const j = await jsend(`/api/runs/${id}/plan`, 'POST', { form: buildForm(), model: A.planModel, feedback: feedback || '', plan: feedback ? prev || A.plan : undefined });
  A.plan = j.plan; A.planKey = planKeyNow(); A.planApproved = false; return j.plan;
}

// ---------- màn hình review ----------
function wireframe(p) {
  const W = p.width || 1280, H = p.height || 720, sw = Math.max(2, Math.round(W / 400)), fs = Math.round(W / 38);
  const rects = [];
  p.unusedSlots.forEach((s) => rects.push(`<rect x="${s.geom.x}" y="${s.geom.y}" width="${s.geom.w}" height="${s.geom.h}" rx="${sw * 2}" fill="none" stroke="#9aa0a8" stroke-width="${sw}" stroke-dasharray="${sw * 3} ${sw * 2}"/>`));
  (p.otherSlots || []).forEach((s) => rects.push(`<rect x="${s.geom.x}" y="${s.geom.y}" width="${s.geom.w}" height="${s.geom.h}" rx="${sw * 2}" fill="none" stroke="#c4c8ce" stroke-width="${sw}" stroke-dasharray="${sw} ${sw * 2}"/>`));
  let n = 0;
  p.visuals.forEach((v) => {
    if (!v.slot || !v.geom) return; n++;
    const c = ROLE_COL[v.role] || '#999', g = v.geom;
    rects.push(v.remove
      ? `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${sw * 2}" fill="none" stroke="#9aa0a8" stroke-width="${sw}" stroke-dasharray="${sw * 3} ${sw * 2}"/><text x="${g.x + g.w / 2}" y="${g.y + g.h / 2 + fs / 3}" text-anchor="middle" font-size="${fs}" fill="#9aa0a8">${n} ✕</text>`
      : `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${sw * 2}" fill="${c}" fill-opacity=".30" stroke="${c}" stroke-width="${sw}"/><text x="${g.x + g.w / 2}" y="${g.y + g.h / 2 + fs / 3}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="currentColor">${n}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sơ đồ bố cục trang ${esc(p.title)}"><rect width="${W}" height="${H}" fill="rgba(128,128,128,.08)" rx="${sw * 3}"/>${rects.join('')}</svg>`;
}

function openPlan() {
  closeModal();
  if (!A.plan) return;
  let W = JSON.parse(JSON.stringify(A.plan)), busy = '';
  const orig = JSON.stringify(A.plan);
  const bg = document.createElement('div'); bg.className = 'modal-bg'; document.body.appendChild(bg);
  const close = () => { if (JSON.stringify(W) !== orig) { A.plan = W; A.planApproved = false; } closeModal(); drawPlanBox(); refresh(); };
  const body = () => bg.querySelector('.modal-b');
  const draw = () => {
    const keep = body() ? body().scrollTop : 0;
    const c = planCounts(W);
    bg.innerHTML = `<div class="modal warn plan-modal" role="dialog" aria-modal="true" aria-labelledby="pl-t">
      <div class="modal-h"><div><span class="pill">Review bố cục dashboard</span><h3 id="pl-t">${c.pages} trang · ${c.visuals} biểu đồ — template “${esc(W.template.name)}”</h3></div><button class="icon-btn" data-x aria-label="Đóng">✕</button></div>
      <div class="modal-b">
        <div class="pl-story"><b>Câu chuyện:</b> ${esc(W.storyline || '—')}</div>
        <div class="pl-legend">${Object.entries(ROLE_VN).filter(([k]) => k !== 'other').map(([k, v]) => `<span><i style="background:${ROLE_COL[k]}"></i>${v}</span>`).join('')}<span><i class="dash"></i>Ô template không dùng</span></div>
        ${(W.warnings || []).length || (W.notes || []).length ? `<details class="pl-warn" ${(W.warnings || []).length ? 'open' : ''}><summary>${(W.warnings || []).length} lưu ý${(W.notes || []).length ? ' · ' + W.notes.length + ' ghi chú' : ''}</summary><ul>${(W.warnings || []).map((w) => `<li>${esc(w)}</li>`).join('')}${(W.notes || []).map((w) => `<li class="mut">${esc(w)}</li>`).join('')}</ul></details>` : ''}
        ${W.pages.map((p, pi) => pageHtml(p, pi)).join('')}
        <div class="pl-fb"><label for="pl-fb">Góp ý chung cho AI <small>— VD: thêm một trang về khách hàng; trang 2 dùng biểu đồ cột thay vì donut; bớt chỉ số lợi nhuận…</small></label>
          <textarea id="pl-fb" rows="3" placeholder="Gõ góp ý rồi bấm “Cập nhật theo góp ý”. Góp ý ghi riêng ở từng biểu đồ (cột “Góp ý”) cũng được gửi kèm."></textarea></div>
      </div>
      <div class="modal-f"><span class="sub" style="margin:0 auto 0 0">${busy ? `<span class="spin"></span> ${esc(busy)}` : 'Sửa loại biểu đồ / Top N / bỏ ô ngay trong bảng; bấm Duyệt khi hài lòng.'}</span>
        <button class="btn ghost" data-close ${busy ? 'disabled' : ''}>Đóng (giữ bản nháp)</button>
        <button class="btn" data-regen ${busy ? 'disabled' : ''}>↻ Cập nhật theo góp ý</button>
        <button class="btn acc" data-ok ${busy ? 'disabled' : ''}>✓ Duyệt bố cục này</button></div></div>`;
    body().scrollTop = keep;
  };
  function pageHtml(p, pi) {
    const vis = p.visuals.filter((v) => v.slot); let n = 0;
    return `<section class="pl-page"><div class="pl-ph"><span class="pl-id">${esc(p.id)}</span><input data-p="${pi}" data-f="ptitle" value="${esc(p.title)}" aria-label="Tiêu đề trang"><span class="pill mut">Trang template ${p.from} · ${esc(p.fromName)}</span>${p.clone ? '<span class="pill">Bản nhân bản</span>' : ''}<button class="icon-btn sm" data-del="${pi}" title="Bỏ trang này" aria-label="Bỏ trang ${esc(p.title)}">✕</button></div>
      <input class="pl-msg" data-p="${pi}" data-f="pmsg" value="${esc(p.message)}" placeholder="Thông điệp của trang" aria-label="Thông điệp trang">
      <div class="pl-body"><div class="pl-wf">${wireframe(p)}</div>
        <div class="pl-tbl"><table><thead><tr><th>#</th><th>Loại biểu đồ</th><th>Tiêu đề</th><th>Chỉ số × Chiều</th><th>Top N</th><th>Góp ý của bạn</th><th>Bỏ</th></tr></thead><tbody>
        ${vis.map((v) => { const i = p.visuals.indexOf(v); n++; return `<tr class="${v.remove ? 'off' : ''}"><td><i class="dot" style="background:${ROLE_COL[v.role] || '#999'}"></i>${n}</td>
          <td>${(v.typeOptions || []).length > 1 ? `<select data-p="${pi}" data-v="${i}" data-f="type">${v.typeOptions.map((t) => `<option value="${t}" ${t === v.type ? 'selected' : ''}>${tyName(t)}</option>`).join('')}</select>` : `<span class="ty-fixed" title="Loại cố định theo ô của template">${tyName(v.type)}</span>`}</td>
          <td><input data-p="${pi}" data-v="${i}" data-f="title" value="${esc(v.title)}" aria-label="Tiêu đề biểu đồ ${n}"></td>
          <td><span class="mx">${esc(v.measure || '—')}${v.dimension ? ' × <b>' + esc(v.dimension) + '</b>' : ''}</span>${v.distinct ? ` <small class="mut">${fmt(v.distinct)} giá trị</small>` : ''}${v.guard ? `<div class="gd ${esc(v.guard.level)}">${esc(v.guard.text)}</div>` : ''}${v.reason ? `<div class="rs">${esc(v.reason)}</div>` : ''}</td>
          <td>${v.role === 'kpi' || v.role === 'detail' || v.role === 'filter' || v.role === 'trend' ? '<span class="mut">—</span>' : `<input type="number" min="1" max="100" class="topn" data-p="${pi}" data-v="${i}" data-f="topN" value="${v.topN || ''}" placeholder="tất cả" aria-label="Top N biểu đồ ${n}">`}</td>
          <td><input data-p="${pi}" data-v="${i}" data-f="note" value="${esc(v.note || '')}" placeholder="VD: nên dùng bar ngang" aria-label="Góp ý biểu đồ ${n}"></td>
          <td><input type="checkbox" data-p="${pi}" data-v="${i}" data-f="remove" ${v.remove ? 'checked' : ''} aria-label="Bỏ biểu đồ ${n}"></td></tr>`; }).join('')}
        </tbody></table>
        ${p.visuals.some((v) => !v.slot) ? `<div class="sub" style="margin:6px 0 0">Không có ô phù hợp trong template cho: ${esc(p.visuals.filter((v) => !v.slot).map((v) => v.title || v.id).join('; '))}</div>` : ''}</div></div></section>`;
  }
  const recheck = async () => {
    try { const j = await jsend(`/api/runs/${A.runId}/plan/check`, 'POST', { form: buildForm(), plan: W }); W = j.plan; } catch (e) { toast(e.message); }
    draw();
  };
  bg.onchange = (e) => {
    const t = e.target, f = t.dataset.f; if (f === undefined || t.dataset.p === undefined) return;
    const p = W.pages[+t.dataset.p]; if (!p) return;
    if (f === 'ptitle') { p.title = t.value; return; }
    if (f === 'pmsg') { p.message = t.value; return; }
    const v = p.visuals[+t.dataset.v]; if (!v) return;
    if (f === 'type') v.type = t.value; else if (f === 'title') { v.title = t.value; return; } else if (f === 'note') { v.note = t.value; return; }
    else if (f === 'topN') v.topN = t.value ? Math.max(1, Math.floor(+t.value)) : null; else if (f === 'remove') v.remove = t.checked;
    recheck();
  };
  bg.onclick = async (e) => {
    if (e.target === bg || e.target.closest('[data-x]') || e.target.closest('[data-close]')) return close();
    const del = e.target.closest('[data-del]');
    if (del) { if (W.pages.length <= 1) return toast('Cần giữ ít nhất 1 trang'); W.pages.splice(+del.dataset.del, 1); return recheck(); }
    if (e.target.closest('[data-regen]')) {
      const fb = (bg.querySelector('#pl-fb').value || '').trim();
      const notes = W.pages.flatMap((p) => p.visuals.filter((v) => v.note).map((v) => `${p.id} “${v.title}”: ${v.note}`));
      if (!fb && !notes.length) return toast('Hãy gõ góp ý chung hoặc ghi góp ý ở một biểu đồ trước');
      busy = 'AI đang cập nhật bố cục theo góp ý…'; draw();
      try { const np = await genPlan([fb, notes.length ? 'Góp ý theo từng biểu đồ:\n' + notes.join('\n') : ''].filter(Boolean).join('\n\n'), W); W = np; } catch (er) { toast(er.message); }
      busy = ''; draw(); return;
    }
    if (e.target.closest('[data-ok]')) {
      busy = 'Đang lưu…'; draw();
      try { const j = await jsend(`/api/runs/${A.runId}/plan`, 'PUT', { form: buildForm(), plan: W }); A.plan = j.plan; A.planApproved = true; A.planKey = planKeyNow(); closeModal(); drawPlanBox(); refresh(); toast('Đã duyệt bố cục — chặng 4 sẽ bám đúng bố cục này'); }
      catch (er) { busy = ''; toast(er.message); draw(); }
    }
  };
  document.onkeydown = (e) => { if (e.key === 'Escape') close(); };
  draw();
}
