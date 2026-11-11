/* Cảnh 3D "Transporter" cho hero trang chủ — three.js (MIT, vendor/three.module.min.js), toàn bộ hình khối dựng bằng code (không dùng model/ảnh bên ngoài). */
import * as THREE from '/vendor/three.module.min.js';

const C = { white: 0xf7f3ee, cream: 0xe9e1d6, orange: 0xf26a1b, orange2: 0xff8a47, dark: 0x2b2622, road: 0x4a423b, box: 0xd9a872, boxD: 0xb98650, green: 0x5f8a3c, green2: 0x7aa64f, glass: 0x27313a };

function logoTexture(text, color, bg, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color; g.font = '800 78px Quicksand, "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const t = text.replace('.', ''); const tw = g.measureText(t + '.').width; const x0 = w / 2 - tw / 2; g.textAlign = 'left';
  g.fillText(t, x0, h / 2 + 4); const w1 = g.measureText(t).width; g.fillStyle = '#F26A1B'; if (text.endsWith('.')) g.fillText('.', x0 + w1, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

function build(scene) {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, ...o });
  const box = (w, h, d, color, x = 0, y = 0, z = 0, parent = scene, o = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  // nền
  box(19, 0.5, 13, C.cream, 0, -0.5, 0); box(18.6, 0.3, 12.6, C.white, 0, 0, 0);
  // đường / băng chuyền
  box(18.6, 0.06, 2.3, C.road, 0, 0.3, 3.7);
  box(18.6, 0.075, 0.12, C.orange, 0, 0.3, 2.45); box(18.6, 0.075, 0.12, C.orange, 0, 0.3, 4.95);
  for (let i = -8; i <= 8; i += 2) box(0.8, 0.07, 0.1, C.white, i, 0.3, 3.7, scene, { opacity: 0.7, transparent: true });
  // kho
  const wh = new THREE.Group(); wh.position.set(-3.2, 0.3, -1.6); scene.add(wh);
  box(7, 5, 5.6, C.white, 0, 0, 0, wh);
  box(7.2, 0.25, 5.8, C.cream, 0, 5, 0, wh);                                            // mái
  box(4.6, 0.12, 2.6, C.dark, 0.2, 5.22, -0.3, wh);                                      // máng trên mái
  const door = box(3.8, 3.2, 0.12, C.orange, -0.3, 0, 2.85, wh, { emissive: C.orange, emissiveIntensity: 0.12 });
  box(4.2, 0.18, 0.3, C.white, -0.3, 3.2, 2.9, wh); box(0.18, 3.3, 0.3, C.white, -2.5, 0, 2.9, wh); box(0.18, 3.3, 0.3, C.white, 1.9, 0, 2.9, wh);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: logoTexture('transporter.', '#14110F'), transparent: true }));
  logo.position.set(-0.3, 4.1, 2.83); wh.add(logo);
  box(0.4, 5.4, 3.2, C.orange, 3.9, 0, -0.9, wh);                                         // tấm cam
  // thùng trong kho
  box(1, 1, 1, C.box, -1.2, 0, 2.2, wh); box(1.1, 1.1, 1.1, C.boxD, -0.1, 0, 2.1, wh); box(0.9, 0.9, 0.9, C.box, -0.6, 1.1, 2.2, wh); box(1, 1, 1, C.box, 0.9, 0, 2.3, wh);
  // container phía sau
  box(4.2, 1.5, 1.6, C.dark, 4.2, 0, -4.4); box(4.2, 1.5, 1.6, C.orange, 4.2, 1.5, -4.4); box(4.2, 1.5, 1.6, C.cream, -4.8, 0, -5, scene);
  // cây + chậu
  const tree = (x, z, s = 1) => { const g = new THREE.Group(); g.position.set(x, 0.3, z); g.scale.setScalar(s); scene.add(g);
    box(1.5, 0.55, 1.5, C.white, 0, 0, 0, g); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8), mat(0x7a5a3a)); t.position.y = 1; t.castShadow = true; g.add(t);
    const l1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), mat(C.green, { flatShading: true })); l1.position.y = 2.1; l1.castShadow = true; g.add(l1);
    const l2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), mat(C.green2, { flatShading: true })); l2.position.set(-0.3, 2.6, 0.2); g.add(l2); };
  tree(2.1, 2.3, 0.9); tree(7.6, -1.2, 1.05); tree(-8, 1.2, 0.85);
  // biển chỉ đường
  [['Faster', 0], ['Safer', 1], ['Closer', 2]].forEach(([t, i]) => { const b = box(1.5, 0.42, 0.14, C.white, 7.4, 1.9 - i * 0.55, 1.2, scene); b.rotation.y = -0.4; });
  box(0.1, 2.4, 0.1, C.cream, 6.8, 0, 1.3);
  // thùng ven đường
  box(1.2, 1.2, 1.2, C.box, 7.6, 0.3, 5.4); box(1, 1, 1, C.boxD, 6.2, 0.3, 5.7); box(0.9, 0.9, 0.9, C.box, 7.0, 1.5, 5.5);
  // thùng chạy trên băng chuyền
  const belt = []; for (let i = 0; i < 3; i++) { const b = box(0.9, 0.9, 0.9, i % 2 ? C.box : C.boxD, -8 + i * 3, 0.36, 3.7); belt.push(b); }

  // xe van (nhìn từ +x là đầu xe)
  const van = new THREE.Group(); scene.add(van);
  box(3.4, 1.7, 1.7, C.white, -0.5, 0.5, 0, van); box(1.3, 1.15, 1.7, C.white, 1.85, 0.5, 0, van);
  const wind = box(0.08, 0.65, 1.45, C.glass, 2.52, 1.02, 0, van, { roughness: 0.15, metalness: 0.4 });
  box(0.9, 0.5, 1.74, C.glass, 1.9, 1.1, 0, van, { roughness: 0.2 });
  box(3.5, 0.28, 1.74, C.orange, -0.5, 0.75, 0, van); box(1.3, 0.28, 1.74, C.orange, 1.85, 0.75, 0, van);
  box(0.12, 0.3, 1.5, C.dark, 2.55, 0.5, 0, van);
  const lg = (z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: logoTexture('transporter', '#F26A1B', '#FFFFFF', 512, 128), transparent: false })); p.position.set(-0.55, 1.6, z); p.rotation.y = ry; van.add(p); };
  lg(0.86, 0); lg(-0.86, Math.PI);
  const wheel = (x, z) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), mat(0x1c1815)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.55, z); w.castShadow = true; van.add(w);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), mat(0xbdb5ab)); h.rotation.x = Math.PI / 2; h.position.set(x, 0.55, z); van.add(h); };
  wheel(-1.4, 0.8); wheel(-1.4, -0.8); wheel(1.9, 0.8); wheel(1.9, -0.8);
  van.position.set(-9, 0.36, 3.7);
  return { van, belt };
}

function mount(host) {
  if (!host || host.__tp3d) return; host.__tp3d = true;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = 'tp-scene'; host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0d5b8, 2.2));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.9); sun.position.set(-9, 16, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 50 }); sun.shadow.bias = -0.0004; sun.shadow.radius = 4; scene.add(sun);
  const { van, belt } = build(scene);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const center = new THREE.Vector3(0, 1.6, 0); cam.position.set(18, 15, 18); cam.lookAt(center);
  const fit = () => { const w = host.clientWidth || 600, h = Math.round(Math.max(380, Math.min(w * 0.85, 580))); const a = w / h, s = 8.6; cam.left = -s * a; cam.right = s * a; cam.top = s; cam.bottom = -s; cam.updateProjectionMatrix(); renderer.setSize(w, h, false); renderer.domElement.style.height = h + 'px'; };
  fit(); const ro = new ResizeObserver(() => { fit(); renderer.render(scene, cam); }); ro.observe(host);
  const still = document.documentElement.classList.contains('lite') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  van.position.x = still ? 2 : -9;
  let t0 = performance.now(), dir = 1, turn = 0, pause = 0;
  const loop = (now) => {
    if (!host.isConnected) { ro.disconnect(); renderer.dispose(); return; }
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (!document.hidden) {
      if (pause > 0) pause -= dt;
      else if (turn > 0) { turn -= dt; van.rotation.y += Math.PI * dt / 0.7; if (turn <= 0) van.rotation.y = dir > 0 ? 0 : Math.PI; }
      else {
        van.position.x += dir * dt * (Math.abs(van.position.x - 1) < 4 ? 1.6 : 3.2);
        if (dir > 0 && van.position.x > 8.5) { dir = -1; turn = 0.7; pause = 0.3; van.position.z = 3.7; }
        else if (dir < 0 && van.position.x < -8.5) { dir = 1; turn = 0.7; pause = 0.3; }
      }
      belt.forEach((b) => { b.position.x += dt * 1.1; if (b.position.x > 8.6) b.position.x = -8.6; });
      renderer.render(scene, cam);
    }
    requestAnimationFrame(loop);
  };
  renderer.render(scene, cam);
  if (!still) requestAnimationFrame(loop);
}
window.__tp3d = mount;
{ const h = document.querySelector('.tp-art'); if (h) mount(h); }
