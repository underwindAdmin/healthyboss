/* globals THREE, MERIDIANS, AcuModel, MODEL_GLB_BASE64 */
(function () {
  "use strict";

  var container = document.getElementById("scene");
  var tooltip = document.getElementById("tooltip");
  var panelContent = document.getElementById("panel-content");
 var legendList = document.getElementById("legend-list");
 var statusEl = document.getElementById("status");

  // ------------------------------------------------------------ i18n

  var lang = (function () {
    try { return localStorage.getItem("acupoints-lang") || "en"; } catch (e) { return "en"; }
  })();

  // -------------------------------------------------------- splash hide (Capacitor)

  // minimum splash display: 5 seconds
  let _splashStart = Date.now();
  const MIN_SPLASH_MS = 10000;

  function hideSplash() {
    const elapsed = Date.now() - _splashStart;
    const delay = Math.max(0, MIN_SPLASH_MS - elapsed);
    const doHide = function() {
      try {
        if (typeof Capacitor !== "undefined" && Capacitor.Plugins && Capacitor.Plugins.SplashScreen) {
          Capacitor.Plugins.SplashScreen.hide();
        }
      } catch(e) {
        // not running inside Capacitor (e.g. dev server) — safe to ignore
      }
    };
    if (delay > 0) {
      setTimeout(doHide, delay);
    } else {
      doHide();
    }
  }

  // called from native skip button
  window.__skipSplash = function() {
    // force minimum time elapsed so hideSplash fires immediately
    _splashStart = Date.now() - MIN_SPLASH_MS - 1;
    hideSplash();
  };

  function t(en, cn) { return lang === "cn" ? cn : en; }

  var CN_UI = {
    welcomeTitle: "欢迎",
    welcomeP1: "这是一个交互式图鉴，在三维人体模型上展示了十四正经及其全部361个穴位。",
    welcomeP2: "将鼠标悬停在身体上的彩色线条上，可高亮显示一条经络并查看其穴位代码。点击穴位（小球体）可在此处阅读详细内容，点击经络线可查看该经络的总览。",
    welcomeP3: "你也可以将鼠标悬停在左侧图例上定位经络，点击图例可阅读其描述。",
    hint: "仅供参考学习——不作为治疗指南。",
    loadModel: "正在加载模型…",
    loadFallback: "（简化模型——模型加载失败）",
    dragHint: "拖拽旋转 · 滚轮缩放 · 悬停经络 · 点击穴位",
    updateCheck: "↻ 检查更新",
    updateChecking: "检查中…",
    updateLatest: "已是最新 ✓",
    updateNew: "发现新版本",
    updateDownloading: "下载中…",
    updateRestart: "重启更新?",
    updateFailed: "更新失败",
    updateUnsupported: "当前环境不支持热更新",
    updateVersion: "当前版本",
    updateNow: "现在下载更新吗？",
    pointsLabel: "穴",
    meridian: "经",
    pointsSection: "穴位",
    clickOne: "（点击查看）",
    otherPoints: "本经其他穴位",
  };

  var ELEMENT_CN = {
    Metal: "金",
    Wood: "木",
    Water: "水",
    Fire: "火",
    Earth: "土",
    Extraordinary: "奇经",
  };
  function elementLabel(m) {
    return lang === "cn" ? (ELEMENT_CN[m.element] || m.element) : m.element + " element";
  }

 // ---------------------------------------------------------------- scene

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101216);

  var camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  camera.position.set(0, 0, 2.7);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 0.85));
  var key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 2.5, 3);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x8899bb, 0.45);
  rim.position.set(-2, 1, -3);
  scene.add(rim);

  // The pivot rotates; the inner group shifts the body so its center sits
  // at the pivot origin, making rotation feel centered on the figure.
  var pivot = new THREE.Group();
  var body = new THREE.Group();
  body.position.y = -0.9;
  pivot.add(body);
  scene.add(pivot);

  var skin = new THREE.MeshStandardMaterial({ color: 0xb59a83, roughness: 0.75, metalness: 0.0 });

  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.005;
  body.add(ground);

  // ------------------------------------------- fallback procedural figure

  function addMesh(geo, x, y, z, sx, sy, sz) {
    var m = new THREE.Mesh(geo, skin);
    m.position.set(x, y, z);
    if (sx !== undefined) m.scale.set(sx, sy, sz);
    body.add(m);
    return m;
  }

  function addLimb(ax, ay, az, bx, by, bz, r1, r2) {
    var a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    var dir = new THREE.Vector3().subVectors(b, a);
    var len = dir.length();
    var m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 16), skin);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    body.add(m);
    return m;
  }

  // Only used if the GLB fails to load; roughly matches the model's frame.
  function buildFigure() {
    var sphere = new THREE.SphereGeometry(1, 24, 18);
    addMesh(sphere, 0, 1.66, 0, 0.105, 0.13, 0.11);
    addLimb(0, 1.46, 0, 0, 1.58, 0, 0.05, 0.045);
    var chest = new THREE.CapsuleGeometry(0.155, 0.35, 8, 20);
    addMesh(chest, 0, 1.2, 0).scale.set(1, 1, 0.62);
    addMesh(sphere, 0, 0.97, 0, 0.155, 0.11, 0.096);
    [1, -1].forEach(function (s) {
      addMesh(sphere, s * 0.17, 1.44, -0.03, 0.06, 0.06, 0.06);
      addLimb(s * 0.152, 1.438, -0.05, s * 0.235, 1.172, -0.05, 0.048, 0.04);
      addMesh(sphere, s * 0.235, 1.172, -0.05, 0.042, 0.042, 0.042);
      addLimb(s * 0.235, 1.172, -0.05, s * 0.32, 0.902, -0.05, 0.04, 0.028);
      addMesh(sphere, s * 0.355, 0.80, -0.03, 0.04, 0.07, 0.025);
      addLimb(s * 0.082, 0.97, 0.005, s * 0.082, 0.53, 0.008, 0.075, 0.055);
      addMesh(sphere, s * 0.082, 0.53, 0.008, 0.056, 0.056, 0.056);
      addLimb(s * 0.082, 0.53, 0.008, s * 0.082, 0.084, -0.022, 0.052, 0.033);
      addMesh(sphere, s * 0.085, 0.045, 0.07, 0.045, 0.032, 0.12);
    });
  }

  // ------------------------------------------------------------- meridians

  var BASE_TUBE_GLOW = 0.5, BASE_POINT_GLOW = 0.7;
  var POINT_R = 0.0075, POINT_R_HOVER = 0.011, POINT_R_SELECTED = 0.014;
  var LIFT = 0.006; // raise snapped positions off the skin by this much

  var visuals = {};        // meridian id -> {tubes:[], points:[]}
  var hitMeshes = [];      // invisible, larger raycast targets
  var pointMeshes = {};    // "mid|code" -> [visible point meshes]

  var sphereGeo = new THREE.SphereGeometry(1, 14, 12);
  var hitSphereGeo = new THREE.SphereGeometry(0.012, 8, 6);
  var invisibleMat = new THREE.MeshBasicMaterial({ visible: false });

  function branchesOf(m) { return m.branches || [m.path]; }

  function allPoints(m) {
    var pts = [];
    branchesOf(m).forEach(function (br) {
      br.forEach(function (p) { if (p.code) pts.push(p); });
    });
    pts.sort(function (a, b) {
      return parseInt(a.code.split("-")[1], 10) - parseInt(b.code.split("-")[1], 10);
    });
    return pts;
  }

  function pointByCode(m, code) {
    var brs = branchesOf(m);
    for (var i = 0; i < brs.length; i++)
      for (var j = 0; j < brs[i].length; j++)
        if (brs[i][j].code === code) return brs[i][j];
    return null;
  }

  function buildMeridians(snap) {
    MERIDIANS.forEach(function (m) {
      visuals[m.id] = { tubes: [], points: [] };
      var sides = m.bilateral ? [1, -1] : [1];
      sides.forEach(function (side) {
        branchesOf(m).forEach(function (branch) {
          var pts = branch.map(function (p) {
            var v = new THREE.Vector3(side * p.pos[0], p.pos[1], p.pos[2]);
            if (snap) {
              var s = snap(v, 0.15);
              if (s) v = s.point.clone().addScaledVector(s.normal, LIFT);
            }
            return v;
          });
          var curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
          var segs = Math.max(60, pts.length * 8);

          var tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, segs, 0.005, 8),
            new THREE.MeshStandardMaterial({
              color: m.color, emissive: m.color,
              emissiveIntensity: BASE_TUBE_GLOW, roughness: 0.4
            })
          );
          body.add(tube);
          visuals[m.id].tubes.push(tube);

          var hitTube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.floor(segs / 2), 0.015, 6), invisibleMat);
          hitTube.userData = { kind: "meridian", mid: m.id };
          body.add(hitTube);
          hitMeshes.push(hitTube);

          branch.forEach(function (p, i) {
            if (!p.code) return;
            var dot = new THREE.Mesh(
              sphereGeo,
              new THREE.MeshStandardMaterial({
                color: m.color, emissive: m.color,
                emissiveIntensity: BASE_POINT_GLOW, roughness: 0.35
              })
            );
            dot.position.copy(pts[i]);
            dot.scale.setScalar(POINT_R);
            body.add(dot);
            visuals[m.id].points.push(dot);
            var k = m.id + "|" + p.code;
            (pointMeshes[k] = pointMeshes[k] || []).push(dot);

            var hit = new THREE.Mesh(hitSphereGeo, invisibleMat);
            hit.position.copy(pts[i]);
            hit.userData = { kind: "point", mid: m.id, code: p.code };
            body.add(hit);
            hitMeshes.push(hit);
          });
        });
      });
    });
  }

  var meridianById = {};
  MERIDIANS.forEach(function (m) { meridianById[m.id] = m; });

  // ----------------------------------------------------------- load model

  function start() {
    statusEl.textContent = t("Loading model…", CN_UI.loadModel);
    var fail = function (err) {
      console.error("Model load failed, using fallback figure:", err);
      buildFigure();
      buildMeridians(null);
      hideSplash();
      statusEl.textContent = t("(simplified figure — model failed to load)", CN_UI.loadFallback);
    };
    try {
      // The GLB is embedded as base64 (assets/xbot-data.js) and parsed
      // directly, so the page also works when opened from file://.
      var bin = atob(MODEL_GLB_BASE64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      new THREE.GLTFLoader().parse(bytes.buffer, "", function (gltf) {
        var prep = AcuModel.prepare(gltf.scene, skin);
        body.add(prep.group);
        buildMeridians(prep.snap);
        hideSplash();
        statusEl.textContent = "";
      }, fail);
    } catch (err) { fail(err); }
  }

  // ------------------------------------------------------- highlight state

  var hoverId = null;      // meridian under the cursor
  var legendId = null;     // meridian hovered in the legend
  var selected = null;     // {mid, code}

  function applyHighlight() {
    var active = hoverId || legendId;
    MERIDIANS.forEach(function (m) {
      var on = m.id === active;
      var v = visuals[m.id];
      if (!v) return;
      v.tubes.forEach(function (t) {
        t.material.emissiveIntensity = on ? 1.6 : (active ? 0.22 : BASE_TUBE_GLOW);
      });
      v.points.forEach(function (p) {
        p.material.emissiveIntensity = on ? 1.4 : (active ? 0.3 : BASE_POINT_GLOW);
        p.scale.setScalar(on ? POINT_R_HOVER : POINT_R);
      });
    });
    if (selected) {
      (pointMeshes[selected.mid + "|" + selected.code] || []).forEach(function (p) {
        p.scale.setScalar(POINT_R_SELECTED);
        p.material.emissiveIntensity = 1.8;
      });
    }
    legendList.querySelectorAll("li").forEach(function (li) {
      li.classList.toggle("active", li.dataset.mid === active);
    });
    if (mstrip) {
      mstrip.querySelectorAll(".mstrip-item").forEach(function (b) {
        b.classList.toggle("active", b.dataset.mid === active);
      });
    }
  }

  function setSelected(mid, code) {
    selected = { mid: mid, code: code };
    applyHighlight();
  }

  // ----------------------------------------------------------------- panel

  function cssColor(m) { return MERIDIAN_CSS_COLORS[m.id] || "#5b8cff"; } function colorHex(m) {
    return "#" + m.color.toString(16).padStart(6, "0");
  }

  function chipRow(m, activeCode) {
    return '<div class="chips">' + allPoints(m).map(function (p) {
      var cls = "chip" + (p.code === activeCode ? " chip-active" : "");
      return '<button class="' + cls + '" data-mid="' + m.id + '" data-code="' + p.code + '">' + p.code + "</button>";
    }).join("") + "</div>";
  }

 function meridianHeader(m) {
    var label = t(m.name, m.nameCN);
    var full = t(m.fullName, m.fullNameCN);
    var elem = elementLabel(m);
    var ptsLabel = t("points", CN_UI.pointsLabel);
    var desc = t(m.description, m.descriptionCN);
    return '<div class="m-head">' +
      '<span class="dot" style="background:' + colorHex(m) + '"></span>' +
      "<h2>" + label + " <small>(" + m.id + ")</small></h2></div>" +
      '<p class="m-sub">' + full + " · " + elem + " · " +
      m.totalPoints + " " + ptsLabel + "</p>";
 }

 function showMeridian(m) {
    panelContent.innerHTML = meridianHeader(m) +
      "<p>" + t(m.description, m.descriptionCN) + "</p>" +
      "<h3>" + t("Points", CN_UI.pointsSection) + ' <span class="hint">' + t("(click one)", CN_UI.clickOne) + "</span></h3>" + chipRow(m, null);
  }

  function showPoint(m, p) {
    panelContent.innerHTML = meridianHeader(m) +
      '<p class="m-desc">' + t(m.description, m.descriptionCN) + "</p>" +
      '<div class="point-card" style="border-color:' + colorHex(m) + '">' +
      "<h3>" + p.code + " — " + t(p.name, (p.nameCN || p.name)) + "</h3>" +
      '<p class="p-en">“' + t(p.en, (p.nameCN || p.name)) + "”</p>" +
      "<p>" + t(p.desc, p.descCN || p.desc) + "</p></div>" +
      "<h3>" + t("Other points on this meridian", CN_UI.otherPoints) + "</h3>" + chipRow(m, p.code);
  }

  panelContent.addEventListener("click", function (e) {
    var btn = e.target.closest("button.chip");
    if (!btn) return;
    var m = meridianById[btn.dataset.mid];
    var p = pointByCode(m, btn.dataset.code);
    if (m && p) { showPoint(m, p); setSelected(m.id, p.code); }
  });

  // ---------------------------------------------------------------- legend

  MERIDIANS.forEach(function (m) {
    var li = document.createElement("li");
    li.dataset.mid = m.id; li.style.setProperty("--mc", cssColor(m));
    var setLabel = function () {
      li.innerHTML = '<span class="dot" style="background:' + colorHex(m) + '"></span>' +
        "<b>" + m.id + "</b> " + t(m.name, m.nameCN);
    };
    setLabel();
    li.addEventListener("mouseenter", function () { legendId = m.id; applyHighlight(); });
    li.addEventListener("mouseleave", function () { legendId = null; applyHighlight(); });
    li.addEventListener("click", function () { showMeridian(m); });
    legendList.appendChild(li);
    li._setLabel = setLabel;
  });

  function refreshLegend() {
    legendList.querySelectorAll("li").forEach(function (li) { if (li._setLabel) li._setLabel(); });
  }

  // Mobile meridian strip (Style A only; hidden in classic via CSS)
  var mstrip = document.createElement("nav");
  mstrip.id = "mstrip";
  MERIDIANS.forEach(function (m) {
    var b = document.createElement("button");
    b.className = "mstrip-item";
    b.dataset.mid = m.id; b.style.setProperty("--mc", cssColor(m));
    b.innerHTML = '<span class="dot" style="background:' + colorHex(m) + '"></span><b>' + m.id + "</b>";
    b.addEventListener("click", function () { showMeridian(m); legendId = m.id; applyHighlight(); });
    mstrip.appendChild(b);
  });
  container.appendChild(mstrip);

  // ------------------------------------------------------------ picking

  var raycaster = new THREE.Raycaster();
  var pointerNdc = new THREE.Vector2();

  function pick(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    var hits = raycaster.intersectObjects(hitMeshes, false);
    if (!hits.length) return null;
    // Prefer a point over the meridian tube when both are under the cursor.
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].object.userData.kind === "point" &&
          hits[i].distance - hits[0].distance < 0.03) return hits[i].object.userData;
    }
    return hits[0].object.userData;
  }

  // --------------------------------------------------- pointer interaction

  // Pointer events cover mouse and touch. One pointer drags (rotate/pan),
  // two pointers pinch-zoom, a short press-and-release selects.
  var pointers = new Map();
  var dragging = false, downX = 0, downY = 0, pinchDist = 0, pinchZ = 0;

  function pointerDistance() {
    var pts = Array.from(pointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  renderer.domElement.addEventListener("pointerdown", function (e) {
    renderer.domElement.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = false;
      downX = e.clientX; downY = e.clientY;
    } else if (pointers.size === 2) {
      dragging = true; // a pinch is never a click
      tooltip.style.display = "none";
      pinchDist = pointerDistance();
      pinchZ = camera.position.z;
    }
  });

  renderer.domElement.addEventListener("pointermove", function (e) {
    var p = pointers.get(e.pointerId);
    if (p) {
      if (pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var d = pointerDistance();
        if (d > 0 && pinchDist > 0) {
          camera.position.z = Math.max(0.5, Math.min(5, pinchZ * pinchDist / d));
        }
        return;
      }
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) dragging = true;
      if (dragging) {
        pivot.rotation.y += (e.clientX - p.x) * 0.011;
        // vertical drag pans the camera, scaled so the body follows the cursor
        var perPixel = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / renderer.domElement.clientHeight;
        camera.position.y = Math.max(-1.1, Math.min(1.1, camera.position.y + (e.clientY - p.y) * perPixel));
        tooltip.style.display = "none";
      }
      p.x = e.clientX; p.y = e.clientY;
      return;
    }

    // no pressed pointer: mouse hover
    var hit = pick(e.clientX, e.clientY);
    var newHover = hit ? hit.mid : null;
    if (newHover !== hoverId) { hoverId = newHover; applyHighlight(); }
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";

    if (hit) {
      var m = meridianById[hit.mid];
      var codes = allPoints(m).map(function (pt) {
        return hit.kind === "point" && pt.code === hit.code
          ? "<b>" + pt.code + "</b>" : pt.code;
      }).join(" · ");
      var mname = t(m.name, m.nameCN);
      var merWord = lang === "cn" ? "" : "meridian";
      var ptsWord = t("points", CN_UI.pointsLabel);
      tooltip.innerHTML = '<span class="dot" style="background:' + colorHex(m) + '"></span>' +
        "<b>" + mname + " " + merWord + "</b> (" + m.id + ", " + m.totalPoints + " " + ptsWord + ")<br>" +
        '<span class="codes">' + codes + "</span>";
      tooltip.style.display = "block";
      var tx = Math.min(e.clientX + 16, window.innerWidth - tooltip.offsetWidth - 8);
      var ty = Math.min(e.clientY + 16, window.innerHeight - tooltip.offsetHeight - 8);
      tooltip.style.left = tx + "px";
      tooltip.style.top = ty + "px";
    } else {
      tooltip.style.display = "none";
    }
  });

  function endPointer(e) {
    var had = pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!had || pointers.size > 0) return;
    if (dragging) { dragging = false; return; }
    if (e.type === "pointercancel") return;
    var hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    var m = meridianById[hit.mid];
    if (hit.kind === "point") {
      showPoint(m, pointByCode(m, hit.code));
      setSelected(hit.mid, hit.code);
    } else {
      showMeridian(m);
    }
  }
  renderer.domElement.addEventListener("pointerup", endPointer);
  renderer.domElement.addEventListener("pointercancel", endPointer);

  renderer.domElement.addEventListener("pointerleave", function () {
    if (hoverId) { hoverId = null; applyHighlight(); }
    tooltip.style.display = "none";
  });

  renderer.domElement.addEventListener("wheel", function (e) {
    e.preventDefault();
    // trackpad pinch gestures report ctrlKey — zoom those much faster
    var rate = e.ctrlKey ? 0.012 : 0.0012;
    camera.position.z = Math.max(0.5, Math.min(5, camera.position.z * (1 + e.deltaY * rate)));
  }, { passive: false });

  // ---------------------------------------------------------------- render

  function resize() {
    var w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);
  resize();

  // ----------------------------------------------------- language toggle

  var dragHintEl = document.querySelector("#titlebar p");

  function setLang(l) {
    lang = l;
    try { localStorage.setItem("acupoints-lang", l); } catch (e) {}
    // Update titlebar hint
    if (dragHintEl) dragHintEl.textContent = t("Drag to rotate · Scroll to zoom · Hover a meridian · Click a point", CN_UI.dragHint);
    if (typeof refreshUpdBtn === "function" && !updBusy) refreshUpdBtn();
    // Update welcome panel if still showing default
    var h2 = panelContent.querySelector(".m-head h2");
    if (h2 && !h2.querySelector("small")) {
      showWelcome();
    }
    // Refresh legend labels
    refreshLegend();
    // If a meridian is showing, re-render it
    var currentH2 = panelContent.querySelector(".m-head h2");
    if (currentH2) {
      var smallEl = currentH2.querySelector("small");
      if (smallEl) {
        var mid = smallEl.textContent.replace(/[()]/g, "");
        var curM = meridianById[mid];
        if (curM && selected) {
          var curP = pointByCode(curM, selected.code);
          if (curP) showPoint(curM, curP);
          else showMeridian(curM);
        } else if (curM) {
          showMeridian(curM);
        }
      }
    }
  }

  function showWelcome() {
    panelContent.innerHTML =
      '<div class="welcome-hero" aria-hidden="true"></div>' +
      '<div class="m-head"><h2>' + t("Welcome", CN_UI.welcomeTitle) + "</h2></div>" +
      "<p>" + t("This is an interactive atlas of the 14 principal acupuncture meridians and all 361 of their points, drawn on a 3D human model.", CN_UI.welcomeP1) + "</p>" +
      "<p>" + t("Hover over a colored line on the body to highlight a meridian and see its point codes. Click a point (the small spheres) to read about it here, or click the line itself for an overview of the meridian.", CN_UI.welcomeP2) + "</p>" +
      "<p>" + t("You can also hover the legend on the left to locate a meridian, and click it to read its description.", CN_UI.welcomeP3) + "</p>" +
      '<p class="hint">' + t("Educational reference only — not a guide for treatment.", CN_UI.hint) + "</p>";
    panelContent.innerHTML += '<p class="hint" id="version-marker" style="opacity:0.5;margin-top:12px;">' + versionLabel() + '</p>';
  }

  // Create language toggle buttons
  var langGroup = document.createElement("span");
  langGroup.id = "lang-group";
  document.getElementById("scene").appendChild(langGroup);

  // gear icon button — opens settings panel (replaces old cn/en/update buttons)
  var gearBtn = document.createElement("button");
  gearBtn.className = "lang-btn";
  gearBtn.setAttribute("aria-label", "Settings");
  gearBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  gearBtn.addEventListener("click", function () {
    var p = buildSettingsPanel();
    p.toggle();
  });
  langGroup.appendChild(gearBtn);

  // ------------------------------------------------------------ UI theme

  function getUI() {
    try {
      var q = new URLSearchParams(window.location.search).get("ui");
      if (q === "a" || q === "classic") return q;
      return localStorage.getItem("acupoints-ui") || "classic";
    } catch (e) { return "classic"; }
  }

  function setUI(u, persist) {
    document.body.setAttribute("data-ui", u);
    if (persist) { try { localStorage.setItem("acupoints-ui", u); } catch (e) {} }
    scene.background.set(u === "a" ? 0x0c0e11 : 0x101216);
    uiBtn.classList.toggle("ui-on", u === "a");
    uiBtn.title = u === "a"
      ? t("Switch to classic UI", "\u5207\u56de\u7ecf\u5178\u754c\u9762")
      : t("Try the new UI (Style A)", "\u4f53\u9a8c\u65b0\u754c\u9762 (A)");
  }

  var uiBtn = document.createElement("button");
  uiBtn.id = "ui-toggle";
  uiBtn.className = "lang-btn ui-btn";
  uiBtn.setAttribute("aria-label", "Toggle UI style");
  uiBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><circle cx="19" cy="17.5" r="2.2"/></svg>';
  uiBtn.addEventListener("click", function () {
    setUI(document.body.getAttribute("data-ui") === "a" ? "classic" : "a", true);
  });
  langGroup.appendChild(uiBtn);
  setUI(getUI(), false);
  // ------------------------------------------------------------ OTA update (Capgo)

  var APP_WEB_VERSION = "1.5.9";
  // Real-time manifest sources (no CDN cache). jsDelivr @main has a 12h cache
  // and github.io is unreachable without VPN in China, so use cache-free mirrors.
  var UPDATE_MANIFEST_URLS = [
    "https://rawcdn.githack.com/underwindAdmin/healthyboss/main/version.json",
    "https://gh-proxy.com/https://raw.githubusercontent.com/underwindAdmin/healthyboss/main/version.json"
  ];

  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (e) {
      clearTimeout(timer);
      if (e && e.name === "AbortError") throw new Error("timeout " + ms / 1000 + "s");
      throw e;
    });
  }

  function fetchManifest() {
    // Query ALL sources in parallel and take the highest version:
    // stale CDN copies return HTTP 200 with an old manifest, so
    // fallback-on-failure alone is not enough. 10s timeout per source
    // prevents a blackholed connection from hanging the check.
    var attempts = UPDATE_MANIFEST_URLS.map(function (url) {
      // "?t=" busts the 1-year browser cache header served by rawcdn
      return fetchWithTimeout(url + "?t=" + Date.now(), 10000).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json().then(function (m) {
          if (!m.version || !m.zipUrl) throw new Error("Malformed manifest");
          return m;
        });
      });
    });
    return Promise.allSettled(attempts).then(function (results) {
      var valid = [], errors = [];
      results.forEach(function (r, i) {
        if (r.status === "fulfilled") valid.push(r.value);
        else errors.push(r.reason && r.reason.message ? r.reason.message : String(r.reason));
      });
      if (!valid.length) throw new Error(errors.join(" | ") || "All sources failed");
      valid.sort(function (a, b) { return compareVersions(b.version, a.version); });
      return valid[0];
    });
  }

  function getUpdater() {
    try {
      if (typeof Capacitor !== "undefined" && Capacitor.Plugins && Capacitor.Plugins.CapacitorUpdater)
        return Capacitor.Plugins.CapacitorUpdater;
    } catch (e) {}
    return null;
  }

  (function notifyReady() {
    var up = getUpdater();
    if (up && up.notifyAppReady) { up.notifyAppReady().catch(function () {}); }
  })();

  // ── silent background update check ──
  var updateCheckDone = false;
  var pendingUpdateVersion = null;

  function checkForUpdateSilently() {
    if (updateCheckDone) return;
    updateCheckDone = true;
    fetchManifest().then(function (m) {
      if (compareVersions(m.version, APP_WEB_VERSION) > 0) {
        pendingUpdateVersion = m.version;
        gearBtn.classList.add("gear-badge");
      }
    }).catch(function () {
      updateCheckDone = false; // allow retry next time
    });
  }

  // try once after startup, then retry on settings open if needed
  setTimeout(checkForUpdateSilently, 2500);

  // ── OTA check logic (extracted so both old updBtn and new settings panel can call it) ──
  function doCheckUpdate(onStatus) {
    // user has seen the notification → clear badge immediately
    // (set() reloads the WebView so clearing at the end would not execute)
    pendingUpdateVersion = null;
    gearBtn.classList.remove("gear-badge");
    var hint = document.getElementById("si-update-hint");
    if (hint) hint.style.display = "none";
    onStatus(t("Checking…", CN_UI.updateChecking));
    return fetchManifest().then(function (manifest) {
      if (compareVersions(manifest.version, APP_WEB_VERSION) <= 0) {
        onStatus(t("Already up to date", CN_UI.updateLatest) + " (v" + manifest.version + ")");
        return;
      }
      var notes = lang === "cn" ? (manifest.notesCn || manifest.notes || "") : (manifest.notes || "");
      var msg = t("New version ", CN_UI.updateNew) + manifest.version;
      if (notes) msg += "\n\n" + notes;
      msg += "\n\n" + t("Download now?", CN_UI.updateNow);
      if (!window.confirm(msg)) { onStatus(""); return; }
      var zipUrls = manifest.zipUrls || [manifest.zipUrl];
      var bundle = null, dlErrors = [];
      function resolve(b) {
        bundle = b;
        if (!bundle) throw new Error("download: " + dlErrors.join(" | "));
        if (window.confirm(t("Download complete. Restart to apply?", CN_UI.updateRestart))) {
          getUpdater().set(bundle);
        } else { onStatus(""); }
      }
      function tryNext(i) {
        if (i >= zipUrls.length || bundle) { return resolve(bundle); }
        dlPercent = -1;
        onStatus(t("Downloading…", CN_UI.updateDownloading) + (zipUrls.length > 1 ? " (" + (i + 1) + "/" + zipUrls.length + ")" : ""));
        return getUpdater().download({ version: manifest.version, url: zipUrls[i] }).then(function (b) {
          resolve(b);
        }).catch(function (de) {
          dlErrors.push(de && de.message ? de.message : String(de));
          return tryNext(i + 1);
        });
      }
      return tryNext(0);
    }).catch(function (e) {
      var errMsg = (e && e.message) ? e.message : String(e);
      onStatus(t("Update failed", CN_UI.updateFailed) + " (" + UPDATE_MANIFEST_URLS.length + " sources): " + errMsg);
    });
  }

  // ── Settings panel ──
  var settingsPanel = null, settingsOverlay = null;

  function buildSettingsPanel() {
    if (settingsPanel) {
      return { toggle: function () {
        var open = settingsPanel.classList.toggle("open");
        settingsOverlay.classList.toggle("open", open);
        if (open) {
          var vi = document.getElementById("si-version");
          if (vi) vi.innerHTML = '<span class="si-icon">&#x1F4E6;</span><span class="si-label">' + versionLabel() + '</span>';
        }
      }};
    }
    var overlay = document.createElement("div");
    overlay.className = "settings-overlay";
    overlay.id = "settings-overlay";
    var panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.id = "settings-panel";

    var closeBtn = document.createElement("button");
    closeBtn.className = "settings-close";
    closeBtn.innerHTML = "&#x2715;";
    panel.appendChild(closeBtn);

    // language switcher rows
    var cnItem = document.createElement("div");
    cnItem.className = "settings-item" + (lang === "cn" ? " active" : "");
    cnItem.innerHTML = '<span class="si-icon">&#x1F310;</span><span class="si-label">' + t("中文", "Chinese") + '</span>';
    cnItem.id = "si-lang-cn";
    cnItem.addEventListener("click", function () {
      if (lang !== "cn") { setLang("cn"); updateSettingsPanelLang(); }
    });
    panel.appendChild(cnItem);

    var enItem = document.createElement("div");
    enItem.className = "settings-item" + (lang === "en" ? " active" : "");
    enItem.innerHTML = '<span class="si-icon">&#x1F310;</span><span class="si-label">English</span>';
    enItem.id = "si-lang-en";
    enItem.addEventListener("click", function () {
      if (lang !== "en") { setLang("en"); updateSettingsPanelLang(); }
    });
    panel.appendChild(enItem);

    var div0 = document.createElement("hr");
    div0.className = "settings-divider";
    panel.appendChild(div0);

    // version display
    var verItem = document.createElement("div");
    verItem.className = "settings-item si-static";
    verItem.id = "si-version";
    verItem.innerHTML = '<span class="si-icon">&#x1F4E6;</span><span class="si-label">' + versionLabel() + '</span>';
    panel.appendChild(verItem);

    // update hint (hidden unless pendingUpdateVersion is set)
    var hintItem = document.createElement("div");
    hintItem.className = "settings-item si-static";
    hintItem.id = "si-update-hint";
    hintItem.style.display = "none";
    hintItem.innerHTML = '<span class="si-icon">&#x1F195;</span><span class="si-label" id="si-update-hint-text"></span>';
    panel.appendChild(hintItem);

    var div1 = document.createElement("hr");
    div1.className = "settings-divider";
    panel.appendChild(div1);

    // check update button
    var updItem = document.createElement("div");
    updItem.className = "settings-item";
    updItem.id = "si-update";
    updBusy = false;
    updItem.textContent = "";
    function updStatus(msg) {
      updItem.innerHTML = '<span class="si-icon">&#x1F504;</span><span class="si-label">' + (msg || t("↻ Check update", CN_UI.updateCheck)) + '</span>';
    }
    updStatus();
    updItem.addEventListener("click", function () {
      if (updBusy) return;
      updBusy = true;
      doCheckUpdate(updStatus).finally(function () { updBusy = false; });
    });
    panel.appendChild(updItem);

    var div2 = document.createElement("hr");
    div2.className = "settings-divider";
    panel.appendChild(div2);

    // about row
    var aboutItem = document.createElement("div");
    aboutItem.className = "settings-item si-about";
    aboutItem.id = "si-about";
    aboutItem.textContent = t("acupoints3D · 3D Acupoint Visualization", "acupoints3D · 3D 人体穴位可视化工具");
    panel.appendChild(aboutItem);

    function toggle() {
      var open = panel.classList.toggle("open");
      overlay.classList.toggle("open", open);
      if (open) {
        // refresh version on each open
        var vi = document.getElementById("si-version");
        if (vi) vi.innerHTML = '<span class="si-icon">&#x1F4E6;</span><span class="si-label">' + versionLabel() + '</span>';
        // retry silent check if it failed earlier
        if (!updateCheckDone) checkForUpdateSilently();
        // show pending update if known
        if (pendingUpdateVersion) {
          var hi = document.getElementById("si-update-hint");
          if (hi) hi.style.display = "";
          var ht = document.getElementById("si-update-hint-text");
          if (ht) ht.textContent = t("New version available: v", "新版本可用：v") + pendingUpdateVersion;
        }
      }
    }
    overlay.addEventListener("click", toggle);
    closeBtn.addEventListener("click", toggle);

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    settingsPanel = panel;
    settingsOverlay = overlay;
    return { toggle: toggle };
  }

  function updateSettingsPanelLang() {
    var cn = document.getElementById("si-lang-cn");
    var en = document.getElementById("si-lang-en");
    if (cn) { cn.className = "settings-item" + (lang === "cn" ? " active" : ""); }
    if (en) { en.className = "settings-item" + (lang === "en" ? " active" : ""); }
    var about = document.getElementById("si-about");
    if (about) about.textContent = t("acupoints3D · 3D Acupoint Visualization", "acupoints3D · 3D 人体穴位可视化工具");
  }

  function compareVersions(a, b) {
    var pa = String(a).split("."), pb = String(b).split(".");
    for (var i = 0; i < 3; i++) {
      var na = parseInt(pa[i] || "0", 10), nb = parseInt(pb[i] || "0", 10);
      if (na !== nb) return na > nb ? 1 : -1;
    }
    return 0;
  }

  var bundleSource = null; // "builtin" | "ota" | null (unknown, e.g. browser)

  function versionLabel() {
    var s = "v" + APP_WEB_VERSION;
    if (bundleSource === "ota") s += " · OTA";
    else if (bundleSource === "builtin") s += " · " + t("built-in", "内置");
    return s;
  }

  function applyBundleSource(b) {
    bundleSource = (b && b.id && b.id !== "builtin") ? "ota" : "builtin";
    var el = document.getElementById("version-marker");
    if (el) el.textContent = versionLabel();
    updBtn.title = t("Current version", CN_UI.updateVersion) + " " + versionLabel();
  }

  (function detectBundleSource() {
    var up = getUpdater();
    if (up && up.current) { up.current().then(applyBundleSource).catch(function () {}); }
  })();

  var updBtn = document.createElement("button");
  updBtn.className = "lang-btn upd-btn";
  updBtn.title = t("Current version", CN_UI.updateVersion) + " " + APP_WEB_VERSION;
  updBtn.setAttribute("aria-label", "Check for update");

  var updBusy = false;
  var flashTimer = null;
  var dlPercent = -1;

  (function listenDownloadProgress() {
    var up = getUpdater();
    if (up && up.addListener) {
      try {
        up.addListener("download", function (info) {
          if (info && typeof info.percent === "number") {
            dlPercent = Math.round(info.percent);
            if (updBusy) {
              var pct = t("Downloading…", CN_UI.updateDownloading) + " " + dlPercent + "%";
              refreshUpdBtn(pct);
              var si = document.getElementById("si-update");
              if (si) si.innerHTML = '<span class="si-icon">&#x1F504;</span><span class="si-label">' + pct + '</span>';
            }
          }
        });
      } catch (e) {}
    }
  })();

  function refreshUpdBtn(msg) {
    updBtn.textContent = msg || t("↻ Update", CN_UI.updateCheck);
  }

  function flash(msg, ms) {
    refreshUpdBtn(msg);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { refreshUpdBtn(); }, ms || 3500);
  }

  updBtn.addEventListener("click", function () {
    if (updBusy) return;
    var up = getUpdater();
    if (!up) { flash(t("Update requires the installed app", CN_UI.updateUnsupported)); return; }
    updBusy = true;
    doCheckUpdate(function (status) {
      if (status) { status.length > 30 ? flash(status, 8000) : refreshUpdBtn(status); }
      else refreshUpdBtn();
    }).finally(function () { updBusy = false; });
  });

  langGroup.appendChild(updBtn);
  refreshUpdBtn();


  function updateLangBtns(l) {
    cnBtn.className = "lang-btn" + (l === "cn" ? " lang-active" : "");
    enBtn.className = "lang-btn" + (l === "en" ? " lang-active" : "");
  }

  // Apply initial language
  setLang(lang);
  showWelcome();

  start();

  (function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  })();

  // ------------------------------------------------------------- layer toggles

  var layerToggles = document.getElementById("layer-toggles");
  if (layerToggles) {
    var layerState = {
      body:      localStorage.getItem("acupoints-layer-body")      !== "off",
      meridians: localStorage.getItem("acupoints-layer-meridians") !== "off",
      points:    localStorage.getItem("acupoints-layer-points")    !== "off"
    };

    function applyLayerState() {
      body.traverse(function (o) {
        if (o.isMesh && !o.userData) {
          o.material.transparent = true;
          o.material.opacity = layerState.body ? 1.0 : 0.18;
          o.material.needsUpdate = true;
        }
      });
      MERIDIANS.forEach(function (m) {
        var v = visuals[m.id];
        if (!v) return;
        v.tubes.forEach(function (t) { t.visible = layerState.meridians; });
        v.points.forEach(function (p) { p.visible = layerState.points; });
      });
      layerToggles.querySelectorAll(".layer-btn").forEach(function (btn) {
        btn.classList.toggle("active", layerState[btn.dataset.layer]);
      });
    }

    layerToggles.addEventListener("click", function (e) {
      var btn = e.target.closest(".layer-btn");
      if (!btn) return;
      var layer = btn.dataset.layer;
      layerState[layer] = !layerState[layer];
      try { localStorage.setItem("acupoints-layer-" + layer, layerState[layer] ? "on" : "off"); } catch (e2) {}
      applyLayerState();
    });

    // Delay so body group is ready
    setTimeout(applyLayerState, 800);
  }

})();
