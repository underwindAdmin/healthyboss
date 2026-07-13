/*
 * Model pipeline: pose the rigged humanoid GLB into anatomical position,
 * bake the skinned meshes into static world-space geometry, and provide
 * a closest-point-on-surface snapper so meridian points and curves can be
 * glued to the actual model surface regardless of its exact proportions.
 *
 * Classic script: attaches AcuModel to the global scope. Also usable from
 * Node (with global.THREE set) for offline validation.
 */
/* globals THREE */
(function (root) {
  "use strict";

  var AcuModel = {};

  // Rotate a bone by quaternion q expressed in WORLD space.
  function applyWorldDelta(bone, q) {
    var pq = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(pq);
    var local = pq.clone().invert().multiply(q).multiply(pq);
    bone.quaternion.premultiply(local);
    bone.updateMatrixWorld(true);
  }

  // Where the point data expects the wrists to sit (x is mirrored per side).
  var WRIST_TARGET = { x: 0.32, y: 0.90 };

  function findBone(bones, names) {
    for (var i = 0; i < names.length; i++) {
      var hit = bones.find(function (b) { return b.name.toLowerCase() === names[i]; });
      if (hit) return hit;
    }
    return null;
  }

  // Humanoid rigs bind in T-pose (arms along +/-X). Bring each arm down so
  // the wrist lands where the point data expects it, then twist the forearm
  // until the thumb points laterally — i.e. palms forward, the anatomical
  // position the data is authored for. Works with Mixamo and UE-style rigs.
  AcuModel.pose = function (scene) {
    var bones = [];
    scene.traverse(function (o) { if (o.isBone) bones.push(o); });
    scene.updateMatrixWorld(true);

    [{ s: 1, mixamo: "left", ue: "_l" }, { s: -1, mixamo: "right", ue: "_r" }].forEach(function (side) {
      var s = side.s;
      var arm = findBone(bones, ["mixamorig" + side.mixamo + "arm", "upperarm" + side.ue]);
      var fore = findBone(bones, ["mixamorig" + side.mixamo + "forearm", "lowerarm" + side.ue]);
      var hand = findBone(bones, ["mixamorig" + side.mixamo + "hand", "hand" + side.ue]);
      var thumb = bones.find(function (b) {
        var n = b.name.toLowerCase();
        return n.indexOf("thumb") >= 0 && (n.indexOf(side.mixamo) >= 0 || n.slice(-2) === side.ue) &&
               (n.indexOf("1") >= 0 || n.indexOf("01") >= 0);
      });
      if (!arm || !hand) return;

      var sp = new THREE.Vector3(), hp = new THREE.Vector3();
      arm.getWorldPosition(sp);
      hand.getWorldPosition(hp);
      var current = hp.clone().sub(sp).normalize();
      var desired = new THREE.Vector3(s * WRIST_TARGET.x - sp.x, WRIST_TARGET.y - sp.y, 0).normalize();
      applyWorldDelta(arm, new THREE.Quaternion().setFromUnitVectors(current, desired));
      scene.updateMatrixWorld(true);

      // Twist the forearm about the arm axis until the thumb's direction
      // (perpendicular to the arm) points laterally.
      var twistBone = fore || hand;
      if (thumb && twistBone) {
        var tp = new THREE.Vector3();
        thumb.getWorldPosition(tp);
        hand.getWorldPosition(hp);
        var t = tp.sub(hp);
        t.addScaledVector(desired, -t.dot(desired)).normalize();
        var target = new THREE.Vector3(s, 0, 0);
        target.addScaledVector(desired, -target.dot(desired)).normalize();
        var angle = Math.atan2(new THREE.Vector3().crossVectors(t, target).dot(desired), t.dot(target));
        applyWorldDelta(twistBone, new THREE.Quaternion().setFromAxisAngle(desired, angle));
      }
    });
    scene.updateMatrixWorld(true);
  };

  // Apply the current skeleton pose to every skinned mesh, producing plain
  // world-space BufferGeometries (position + index + smooth normals).
  AcuModel.bake = function (scene) {
    scene.updateMatrixWorld(true);
    var geoms = [];
    scene.traverse(function (o) {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      var count = o.geometry.attributes.position.count;
      var pos = new Float32Array(count * 3);
      var v = new THREE.Vector3();
      for (var i = 0; i < count; i++) {
        // r147 boneTransform expects target to hold the raw vertex position
        v.fromBufferAttribute(o.geometry.attributes.position, i);
        o.boneTransform(i, v);
        v.applyMatrix4(o.matrixWorld);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      if (o.geometry.index) g.setIndex(o.geometry.index.clone());
      g.computeVertexNormals();
      g.name = o.name;
      geoms.push(g);
    });
    return geoms;
  };

  // Closest point on a triangle soup. A cheap centroid+radius lower bound
  // filters triangles before the exact THREE.Triangle test, keeping ~800
  // queries over ~50k triangles fast enough to run at load time.
  AcuModel.createSnapper = function (geoms) {
    var tris = [];      // flat vertex data, 9 floats per triangle
    var centroids = []; // 3 floats per triangle
    var radii = [];

    geoms.forEach(function (g) {
      var p = g.attributes.position.array;
      var idx = g.index ? g.index.array : null;
      var triCount = (idx ? idx.length : p.length / 3) / 3;
      for (var t = 0; t < triCount; t++) {
        var ia = idx ? idx[t * 3] : t * 3;
        var ib = idx ? idx[t * 3 + 1] : t * 3 + 1;
        var ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
        var ax = p[ia * 3], ay = p[ia * 3 + 1], az = p[ia * 3 + 2];
        var bx = p[ib * 3], by = p[ib * 3 + 1], bz = p[ib * 3 + 2];
        var cx = p[ic * 3], cy = p[ic * 3 + 1], cz = p[ic * 3 + 2];
        tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        var mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
        centroids.push(mx, my, mz);
        var r2 = Math.max(
          (ax - mx) * (ax - mx) + (ay - my) * (ay - my) + (az - mz) * (az - mz),
          (bx - mx) * (bx - mx) + (by - my) * (by - my) + (bz - mz) * (bz - mz),
          (cx - mx) * (cx - mx) + (cy - my) * (cy - my) + (cz - mz) * (cz - mz));
        radii.push(Math.sqrt(r2));
      }
    });

    var triData = new Float32Array(tris);
    var cenData = new Float32Array(centroids);
    var radData = new Float32Array(radii);
    var n = radData.length;

    var tri = new THREE.Triangle();
    var candidate = new THREE.Vector3();

    /**
     * Snap point p (THREE.Vector3) to the surface.
     * Returns { point, normal, dist } or null if nothing within maxDist.
     */
    return function snap(p, maxDist) {
      var best = maxDist === undefined ? 0.15 : maxDist;
      var bestPoint = null, bestTri = -1;
      for (var t = 0; t < n; t++) {
        var dx = p.x - cenData[t * 3];
        var dy = p.y - cenData[t * 3 + 1];
        var dz = p.z - cenData[t * 3 + 2];
        var lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - radData[t];
        if (lb >= best) continue;
        var o = t * 9;
        tri.a.set(triData[o], triData[o + 1], triData[o + 2]);
        tri.b.set(triData[o + 3], triData[o + 4], triData[o + 5]);
        tri.c.set(triData[o + 6], triData[o + 7], triData[o + 8]);
        tri.closestPointToPoint(p, candidate);
        var d = candidate.distanceTo(p);
        if (d < best) {
          best = d;
          bestPoint = candidate.clone();
          bestTri = t;
        }
      }
      if (!bestPoint) return null;
      var o2 = bestTri * 9;
      tri.a.set(triData[o2], triData[o2 + 1], triData[o2 + 2]);
      tri.b.set(triData[o2 + 3], triData[o2 + 4], triData[o2 + 5]);
      tri.c.set(triData[o2 + 6], triData[o2 + 7], triData[o2 + 8]);
      var normal = new THREE.Vector3();
      tri.getNormal(normal);
      return { point: bestPoint, normal: normal, dist: best };
    };
  };

  /**
   * Full pipeline: pose + bake, build display meshes with the given
   * material, and return { group, snap, geoms }.
   */
  AcuModel.prepare = function (scene, material) {
    AcuModel.pose(scene);
    var geoms = AcuModel.bake(scene);
    var group = new THREE.Group();
    geoms.forEach(function (g) {
      group.add(new THREE.Mesh(g, material));
    });
    return { group: group, snap: AcuModel.createSnapper(geoms), geoms: geoms };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AcuModel;
  else root.AcuModel = AcuModel;
})(typeof self !== "undefined" ? self : this);
