import * as THREE from "three";

/**
 * The plush buddy that lives on the homepage desk, built entirely in code: a
 * soft sage seedling (a felt gumdrop with a two-leaf sprout, after the money
 * tree beside it), dot eyes, blush, stubby arms. No model file to download.
 *
 * Units: the buddy is 1 tall, standing on y = 0, facing +z. `createBuddy`
 * returns the group plus `animate()`, which poses it each frame from the
 * stage's state: walking, waving, nodding, thinking, looking at the pointer.
 */

export type BuddyMove = "wave" | "nod" | "shrug" | "hop";

export type BuddyPose = {
  /** 0 standing, 1 mid-waddle. */
  walking: boolean;
  /** Seconds since the walk started, for the gait. */
  time: number;
  /** Where to look, -1..1 each way (x right, y up), or null to look ahead. */
  look: { x: number; y: number } | null;
  /** Waiting on a reply: a slow, curious sway. */
  thinking: boolean;
  /** Holding something up over its head with both arms (the water jar). */
  carrying?: boolean;
};

const SAGE = new THREE.Color("#b7cfa7");
const SAGE_SHEEN = new THREE.Color("#eef6e6");
const LEAF = new THREE.Color("#7fae6a");

/** The body's outline, bottom to top, as (radius, height) — revolved into a gumdrop. */
const PROFILE: [number, number][] = [
  [0.0, 0.0],
  [0.3, 0.012],
  [0.41, 0.09],
  [0.445, 0.25],
  [0.43, 0.46],
  [0.38, 0.68],
  [0.29, 0.85],
  [0.15, 0.95],
  [0.0, 0.98],
];

/** The body's radius at a height, from the profile, for placing things on its skin. */
function radiusAt(y: number) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1];
    const [r1, y1] = PROFILE[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

/** A fine, soft noise to rough the felt up a little under the light. */
function feltNormalMap() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const nx = 128 + (Math.random() - 0.5) * 60;
    const ny = 128 + (Math.random() - 0.5) * 60;
    img.data[i * 4] = nx;
    img.data[i * 4 + 1] = ny;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function blushTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(244,150,150,0.75)");
  grad.addColorStop(1, "rgba(244,150,150,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Puts `obj` on the body's skin at height y and angle a (0 = straight ahead), facing out. */
function onSkin(obj: THREE.Object3D, y: number, a: number, lift = 0) {
  const r = radiusAt(y) + lift;
  obj.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
  // Face along the surface normal, tipped up a little where the body narrows.
  const slope = (radiusAt(y - 0.02) - radiusAt(y + 0.02)) / 0.04;
  obj.lookAt(Math.sin(a) * (r + 1), y + slope, Math.cos(a) * (r + 1));
}

export function createBuddy() {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const normalMap = keep(feltNormalMap());
  const felt = keep(
    new THREE.MeshPhysicalMaterial({
      color: SAGE,
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.55,
      sheenColor: SAGE_SHEEN,
      normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
  );
  const leafFelt = keep(felt.clone());
  leafFelt.color = LEAF;
  leafFelt.sheenColor = new THREE.Color("#d8edc8");
  const ink = keep(new THREE.MeshStandardMaterial({ color: "#1d1a17", roughness: 0.25 }));
  const shine = keep(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const blush = keep(
    new THREE.MeshBasicMaterial({ map: keep(blushTexture()), transparent: true, depthWrite: false }),
  );

  const root = new THREE.Group();
  // Everything that squashes and stretches: the body and what's on it.
  const body = new THREE.Group();
  root.add(body);

  // The gumdrop.
  const curve = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  const lathe = keep(new THREE.LatheGeometry(curve.getPoints(48), 72));
  body.add(new THREE.Mesh(lathe, felt));

  // The face: eyes (with a glint), cheeks, a small smile.
  const eyeGeo = keep(new THREE.SphereGeometry(0.048, 24, 16));
  const glintGeo = keep(new THREE.SphereGeometry(0.014, 12, 8));
  const eyes: THREE.Group[] = [];
  const face = new THREE.Group();
  body.add(face);
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(eyeGeo, ink);
    ball.scale.set(0.9, 1.1, 0.55);
    const glint = new THREE.Mesh(glintGeo, shine);
    glint.position.set(0.016, 0.022, 0.026);
    eye.add(ball, glint);
    onSkin(eye, 0.6, side * 0.27, -0.006);
    face.add(eye);
    eyes.push(eye);

    const cheek = new THREE.Mesh(keep(new THREE.CircleGeometry(0.075, 24)), blush);
    cheek.scale.set(1.25, 0.8, 1);
    onSkin(cheek, 0.5, side * 0.47, 0.004);
    face.add(cheek);
  }
  const smile = new THREE.Mesh(keep(new THREE.TorusGeometry(0.038, 0.009, 8, 24, Math.PI)), ink);
  onSkin(smile, 0.52, 0, 0.002);
  smile.rotateZ(Math.PI);
  face.add(smile);

  // Stubby arms, each on a shoulder pivot so it can wave.
  const armGeo = keep(new THREE.CapsuleGeometry(0.075, 0.12, 8, 16));
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.4, 0.42, 0.02);
    const arm = new THREE.Mesh(armGeo, felt);
    arm.position.y = -0.1;
    shoulder.add(arm);
    shoulder.rotation.z = side * 0.5;
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Little feet poking out the front.
  const footGeo = keep(new THREE.SphereGeometry(0.1, 20, 12));
  const feet: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(footGeo, felt);
    foot.scale.set(1, 0.55, 1.25);
    foot.position.set(side * 0.17, 0.035, 0.24);
    root.add(foot);
    feet.push(foot);
  }

  // The sprout: a short stem with two leaves, on a pivot so it sways.
  const sprout = new THREE.Group();
  sprout.position.set(0, 0.95, 0);
  const stemCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, -0.02, 0),
    new THREE.Vector3(0.015, 0.07, 0),
    new THREE.Vector3(-0.01, 0.13, 0),
  );
  sprout.add(new THREE.Mesh(keep(new THREE.TubeGeometry(stemCurve, 12, 0.016, 8)), leafFelt));
  const leafGeo = keep(new THREE.SphereGeometry(0.1, 24, 12));
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeo, leafFelt);
    leaf.scale.set(1, 0.18, 0.55);
    leaf.position.set(side * 0.085, 0.14, 0);
    leaf.rotation.z = side * 0.45;
    sprout.add(leaf);
  }
  body.add(sprout);

  // ── Motion ────────────────────────────────────────────────────────────────
  let move: { kind: BuddyMove; t: number } | null = null;
  let blinkIn = 2 + Math.random() * 3;
  let blink = 0;
  let clock = 0;
  const lookNow = { x: 0, y: 0 };
  const ease = (t: number) => t * t * (3 - 2 * t);

  const MOVE_LENGTH: Record<BuddyMove, number> = { wave: 1.7, nod: 0.7, shrug: 1.1, hop: 0.75 };

  function play(kind: BuddyMove) {
    move = { kind, t: 0 };
    return MOVE_LENGTH[kind];
  }

  function animate(dt: number, pose: BuddyPose) {
    clock += dt;

    // Breathing, always.
    const breath = Math.sin(clock * 2.1) * 0.018;
    let squash = 1 + breath;
    let lift = 0;
    let tilt = 0;
    let lean = 0;
    let armL = 0.5;
    let armR = -0.5;
    let sway = Math.sin(clock * 1.6) * 0.08;

    if (pose.walking) {
      const w = pose.time * 9;
      tilt = Math.sin(w) * 0.11;
      lift = Math.abs(Math.sin(w)) * 0.05;
      lean = 0.08;
      feet[0].position.y = 0.035 + Math.max(0, Math.sin(w)) * 0.05;
      feet[1].position.y = 0.035 + Math.max(0, -Math.sin(w)) * 0.05;
      armL = 0.5 + Math.sin(w) * 0.25;
      armR = -0.5 + Math.sin(w) * 0.25;
      sway = -Math.sin(w) * 0.2;
    } else {
      for (const f of feet) f.position.y += (0.035 - f.position.y) * Math.min(1, dt * 12);
    }

    if (pose.carrying) {
      // Both arms straight up under the load, bobbing a little with the step.
      const bob = pose.walking ? Math.sin(pose.time * 9) * 0.06 : Math.sin(clock * 2.1) * 0.03;
      armL = 2.6 + bob;
      armR = -2.6 + bob;
    }

    if (pose.thinking && !move) {
      tilt = Math.sin(clock * 1.4) * 0.07;
      sway = Math.sin(clock * 3) * 0.18;
    }

    if (move) {
      move.t += dt;
      const p = Math.min(1, move.t / MOVE_LENGTH[move.kind]);
      const env = Math.sin(p * Math.PI); // in and back out
      switch (move.kind) {
        case "wave":
          armR = -0.5 - ease(Math.min(1, p * 4)) * 2.1 * (p > 0.85 ? (1 - p) / 0.15 : 1);
          armR += Math.sin(move.t * 14) * 0.35 * env;
          tilt = -0.08 * env;
          break;
        case "nod": {
          const b = Math.sin(p * Math.PI * 2);
          squash = 1 - b * 0.07;
          lift = Math.max(0, b) * 0.04;
          break;
        }
        case "shrug":
          tilt = Math.sin(p * Math.PI * 3) * 0.12 * env;
          armL = 0.5 + env * 0.9;
          armR = -0.5 - env * 0.9;
          break;
        case "hop": {
          // Crouch, spring, land.
          if (p < 0.25) squash = 1 - ease(p / 0.25) * 0.12;
          else if (p < 0.8) {
            const q = (p - 0.25) / 0.55;
            lift = Math.sin(q * Math.PI) * 0.28;
            squash = 1 + Math.sin(q * Math.PI) * 0.08;
          } else squash = 1 - Math.sin(((p - 0.8) / 0.2) * Math.PI) * 0.08;
          sway = Math.sin(p * Math.PI * 2) * 0.3;
          break;
        }
      }
      if (p >= 1) move = null;
    }

    // Blink every few seconds.
    blinkIn -= dt;
    if (blinkIn <= 0) {
      blink = 0.14;
      blinkIn = 2.5 + Math.random() * 3.5;
    }
    blink = Math.max(0, blink - dt);
    const lid = blink > 0 ? 0.12 : 1;

    // Eyes (and a little of the face) follow the pointer.
    const want = pose.look ?? { x: 0, y: 0 };
    lookNow.x += (want.x - lookNow.x) * Math.min(1, dt * 6);
    lookNow.y += (want.y - lookNow.y) * Math.min(1, dt * 6);
    for (const eye of eyes) eye.scale.set(1, lid, 1);
    face.position.set(lookNow.x * 0.03, lookNow.y * 0.02, 0);
    face.rotation.y = lookNow.x * 0.12;

    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    body.position.y = lift;
    body.rotation.z = tilt;
    body.rotation.x = lean;
    arms[0].rotation.z = -armL;
    arms[1].rotation.z = -armR;
    sprout.rotation.z = sway;
  }

  return {
    group: root,
    play,
    animate,
    get busy() {
      return move !== null;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

export type Buddy = ReturnType<typeof createBuddy>;
