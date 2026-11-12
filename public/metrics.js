/* Chọn Key Metrics từ DANH MỤC CHỈ SỐ BI (documents/Business Intelligence Metrics.xlsx → knowledge-base/metrics-catalog.json)
   Lĩnh vực → nhóm → chỉ số, kèm mô tả, công thức, mức quan trọng, link tham khảo và "khớp dữ liệu" (công thức có dùng được cột trong file của bạn). */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const FIT = { high: ['✓ Khớp dữ liệu', 'fit-high', 'Công thức dùng được các cột trong file dữ liệu của bạn'], partial: ['◐ Khớp một phần', 'fit-part', 'Một số thành phần của công thức có trong dữ liệu, một số còn thiếu'], none: ['Chưa thấy cột phù hợp', 'fit-none', 'Chưa thấy cột nào dùng được cho công thức này trong dữ liệu — có thể cần bổ sung dữ liệu'] };
  const DKEY = 'bie-metdom';
  let CAT = null, catKey = '';

  async function load(A) {
    const q = new URLSearchParams(); if (A.runId && A.data) q.set('run', A.runId); if (A.aud.department) q.set('dept', A.aud.department); if (A.aud.position) q.set('pos', A.aud.position);
    const key = q.toString(); if (CAT && catKey === key) return CAT;
    const r = await fetch('/api/metrics-catalog?' + key, { cache: 'no-store' }); if (!r.ok) throw new Error('Không tải được danh mục chỉ số');
    CAT = await r.json(); catKey = key; return CAT;
  }

  function mount(host, getA, onChange) {
    if (!host) return;
    const draw = () => {
      const A = getA(), set = new Set(A.metrics.map(norm));
      host.innerHTML = `<div class="catbar"><button type="button" class="btn acc sm" data-open>📚 Chọn từ danh mục chỉ số BI</button>
        <span class="sub" style="margin:0">297 chỉ số chuẩn theo lĩnh vực — có mô tả, công thức và mức quan trọng${set.size ? ` · đang chọn <b>${set.size}</b>` : ''}</span></div>`;
      host.querySelector('[data-open]').onclick = () => open(getA, () => { onChange(); draw(); });
    };
    draw(); return draw;
  }

  async function open(getA, changed) {
    const A = getA();
    const bg = document.createElement('div'); bg.className = 'modal-bg'; document.body.appendChild(bg);
    bg.innerHTML = '<div class="modal metmodal"><div class="modal-b" style="padding:40px;text-align:center"><span class="spin"></span> Đang tải danh mục chỉ số…</div></div>';
    let cat; try { cat = await load(A); } catch (e) { bg.innerHTML = `<div class="modal"><div class="modal-b"><div class="err-box">${esc(e.message)}</div></div><div class="modal-f"><button class="btn ghost" data-x>Đóng</button></div></div>`; bg.onclick = (ev) => { if (ev.target === bg || ev.target.closest('[data-x]')) bg.remove(); }; return; }
    let dom = (() => { try { return localStorage.getItem(DKEY); } catch { return null; } })();
    if (cat.suggestDomain) dom = cat.suggestDomain; else if (!dom) dom = 'supply-chain';   // web SCM: mặc định mở lĩnh vực Chuỗi cung ứng
    if (!cat.domains.some((d) => d.id === dom)) dom = cat.domains[0].id;
    const st = { q: '', imp: false, fit: false };
    const close = () => { document.onkeydown = null; bg.remove(); changed(); };

    const selected = () => new Set(getA().metrics.map(norm));
    const countIn = (d) => { const s = selected(); return d.categories.reduce((n, c) => n + c.metrics.filter((m) => s.has(norm(m.name))).length, 0); };
    const total = (d) => d.categories.reduce((n, c) => n + c.metrics.length, 0);
    const pass = (m) => (!st.imp || m.importance === 'High') && (!st.fit || m.fit === 'high' || m.fit === 'partial') && (!st.q || norm(m.name + ' ' + m.description + ' ' + m.formula).includes(norm(st.q)));
    const toggle = (name) => { const A2 = getA(), k = norm(name), i = A2.metrics.findIndex((x) => norm(x) === k); if (i >= 0) A2.metrics.splice(i, 1); else A2.metrics.push(name); changed(); };

    function row(m, s) {
      const on = s.has(norm(m.name)), f = cat.hasData && m.fit ? FIT[m.fit] : null;
      return `<label class="mrow ${on ? 'on' : ''}"><input type="checkbox" data-n="${esc(m.name)}" ${on ? 'checked' : ''}>
        <span class="mb"><span class="mt"><b>${esc(m.name)}</b><i class="imp ${m.importance === 'High' ? 'hi' : ''}">${esc(m.importance)}</i>${f ? `<i class="fit ${f[1]}" title="${esc(f[2])}">${f[0]}</i>` : ''}${m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener" title="Xem giải thích" onclick="event.stopPropagation()">↗</a>` : ''}</span>
        <span class="mdesc">${esc(m.description)}</span><code class="mf">${esc(m.formula)}</code></span></label>`;
    }
    function render() {
      const s = selected(), D = cat.domains.find((d) => d.id === dom);
      let body = '';
      if (st.q.trim()) {
        const hits = cat.domains.flatMap((d) => d.categories.flatMap((c) => c.metrics.filter(pass).map((m) => ({ d, c, m }))));
        body = hits.length ? hits.map(({ d, c, m }) => `<div class="mcatn">${esc(d.label)} · ${esc(c.name)}</div>${row(m, s)}`).join('') : '<div class="sub">Không có chỉ số nào khớp.</div>';
      } else {
        body = D.categories.map((c) => { const ms = c.metrics.filter(pass); return ms.length ? `<div class="mcatn">${esc(c.name)} <small>${ms.length}</small></div>${ms.map((m) => row(m, s)).join('')}` : ''; }).join('') || '<div class="sub">Không có chỉ số nào khớp bộ lọc.</div>';
      }
      const n = getA().metrics.length;
      bg.innerHTML = `<div class="modal metmodal" role="dialog" aria-modal="true" aria-label="Danh mục chỉ số BI"><div class="modal-h"><div><span class="pill">Key Metrics</span><h3>Danh mục chỉ số BI</h3></div><button class="icon-btn" data-x aria-label="Đóng">✕</button></div>
        <div class="modal-b metbody">
          <div class="mtools"><input type="search" data-q placeholder="Tìm chỉ số (tên, mô tả, công thức)…" value="${esc(st.q)}">
            <button type="button" class="chip ${st.imp ? 'on' : ''}" data-imp>★ Quan trọng (High)</button>
            ${cat.hasData ? `<button type="button" class="chip ${st.fit ? 'on' : ''}" data-fit title="Chỉ hiện chỉ số có thể tính từ cột trong dữ liệu của bạn">✓ Khớp dữ liệu</button>` : '<span class="sub" style="margin:0">Tải dữ liệu ở bước Import Data để thấy chỉ số nào tính được.</span>'}
            <button type="button" class="btn ghost sm" data-quick title="Chọn tối đa 8 chỉ số High (ưu tiên khớp dữ liệu) của lĩnh vực đang xem">⚡ Chọn nhanh</button></div>
          <div class="mgrid"><nav class="mdoms">${cat.domains.map((d) => `<button type="button" class="mdom ${d.id === dom && !st.q.trim() ? 'on' : ''}" data-d="${d.id}"><span>${esc(d.label)}</span><small>${countIn(d) ? `<b>${countIn(d)}</b>/` : ''}${total(d)}</small></button>`).join('')}</nav>
          <div class="mlist">${!st.q.trim() && cat.suggestDomain === dom ? '<div class="sub" style="margin:0 0 6px">✦ Gợi ý lĩnh vực theo phòng ban/vị trí người xem.</div>' : ''}${body}</div></div>
        </div>
        <div class="modal-f"><span class="sub" style="margin:0 auto 0 0">Đang chọn <b>${n}</b> chỉ số${n > 12 ? ' — nhiều chỉ số sẽ làm dashboard rối, nên chọn gọn' : ''}. Mỗi trang dashboard chỉ hiện 4–6 thẻ KPI.</span><button class="btn acc" data-x>Xong</button></div></div>`;
      const q = bg.querySelector('[data-q]');
      q.oninput = () => { st.q = q.value; const pos = q.selectionStart; render(); const q2 = bg.querySelector('[data-q]'); q2.focus(); q2.setSelectionRange(pos, pos); };
      bg.querySelector('[data-imp]').onclick = () => { st.imp = !st.imp; render(); };
      const bf = bg.querySelector('[data-fit]'); if (bf) bf.onclick = () => { st.fit = !st.fit; render(); };
      bg.querySelector('[data-quick]').onclick = () => {
        const D2 = cat.domains.find((d) => d.id === dom), s2 = selected();
        const pool = D2.categories.flatMap((c) => c.metrics).filter((m) => m.importance === 'High' && !s2.has(norm(m.name))).sort((a, b) => (cat.hasData ? ({ high: 0, partial: 1, none: 2 }[a.fit] ?? 2) - ({ high: 0, partial: 1, none: 2 }[b.fit] ?? 2) : 0));
        pool.slice(0, 8).forEach((m) => getA().metrics.push(m.name)); changed(); render();
      };
      bg.querySelectorAll('.mdom').forEach((b) => (b.onclick = () => { dom = b.dataset.d; st.q = ''; try { localStorage.setItem(DKEY, dom); } catch {} render(); }));
      bg.querySelectorAll('.mrow input').forEach((c) => (c.onchange = () => { toggle(c.dataset.n); const sc = bg.querySelector('.mlist').scrollTop; render(); bg.querySelector('.mlist').scrollTop = sc; }));
    }
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') close(); };
    render();
  }
  window.MetricsPicker = { mount, norm };
})();
