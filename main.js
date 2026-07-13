/* globals THREE, MERIDIANS, AcuModel, MODEL_GLB_BASE64 */
(function () {
  "use strict";

  var container = document.getElementById("scene");
  var tooltip = document.getElementById("tooltip");
  var panelContent = document.getElementById("panel-content");
  var legendList = document.getElementById("legend-list");
  var statusEl = document.getElementById("status");

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
    statusEl.textContent = "Loading model…";
    var fail = function (err) {
      console.error("Model load failed, using fallback figure:", err);
      buildFigure();
      buildMeridians(null);
      statusEl.textContent = "(simplified figure — model failed to load)";
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
  }

  function setSelected(mid, code) {
    selected = { mid: mid, code: code };
    applyHighlight();
  }

  // ----------------------------------------------------------------- panel

  function colorHex(m) {
    return "#" + m.color.toString(16).padStart(6, "0");
  }

  function chipRow(m, activeCode) {
    return '<div class="chips">' + allPoints(m).map(function (p) {
      var cls = "chip" + (p.code === activeCode ? " chip-active" : "");
      return '<button class="' + cls + '" data-mid="' + m.id + '" data-code="' + p.code + '">' + p.code + "</button>";
    }).join("") + "</div>";
  }

  function meridianHeader(m) {
    return '<div class="m-head">' +
      '<span class="dot" style="background:' + colorHex(m) + '"></span>' +
      "<h2>" + m.name + " <small>(" + m.id + ")</small></h2></div>" +
      '<p class="m-sub">' + m.fullName + " · " + m.element + " element · " +
      m.totalPoints + " points</p>";
  }

  function showMeridian(m) {
    panelContent.innerHTML = meridianHeader(m) +
      "<p>" + m.description + "</p>" +
      '<h3>Points <span class="hint">(click one)</span></h3>' + chipRow(m, null);
  }

  function showPoint(m, p) {
    panelContent.innerHTML = meridianHeader(m) +
      '<p class="m-desc">' + m.description + "</p>" +
      '<div class="point-card" style="border-color:' + colorHex(m) + '">' +
      "<h3>" + p.code + " — " + p.name + "</h3>" +
      '<p class="p-en">“' + p.en + "”</p>" +
      "<p>" + p.desc + "</p></div>" +
      "<h3>Other points on this meridian</h3>" + chipRow(m, p.code);
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
    li.dataset.mid = m.id;
    li.innerHTML = '<span class="dot" style="background:' + colorHex(m) + '"></span>' +
      "<b>" + m.id + "</b> " + m.name;
    li.addEventListener("mouseenter", function () { legendId = m.id; applyHighlight(); });
    li.addEventListener("mouseleave", function () { legendId = null; applyHighlight(); });
    li.addEventListener("click", function () { showMeridian(m); });
    legendList.appendChild(li);
  });

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
      tooltip.innerHTML = '<span class="dot" style="background:' + colorHex(m) + '"></span>' +
        "<b>" + m.name + " meridian</b> (" + m.id + ", " + m.totalPoints + " points)<br>" +
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

  start();

  (function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  })();
})();
