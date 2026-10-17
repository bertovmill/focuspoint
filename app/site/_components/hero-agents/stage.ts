import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DESK_TOP, type AgentId, type CastMember } from "./cast";

/**
 * The 3D layer over the homepage hero: a transparent WebGL canvas the size of
 * the hero, drawn with an orthographic camera in CSS pixels (x right, y down,
 * so world y is the negated pixel y). That way a character standing on the
 * desk is simply placed at the desk top's pixel position, measured from the
 * DOM, and stays put through any resize.
 *
 * Each character wanders its lane: stands about, fidgets, walks somewhere
 * else. While you're chatting with it, it stops and faces you.
 */

/** Where the things the characters stand on are, in pixels inside the hero. */
export type RoomLayout = {
  width: number;
  height: number;
  desk: { left: number; top: number; width: number; height: number } | null;
  sill: { left: number; right: number; y: number; unit: number } | null;
};

/** Where a character is on screen, for the buttons and the chat card. */
export type Pose = {
  id: AgentId;
  x: number;
  y: number;
  height: number;
  visible: boolean;
};

type Mode = "idle" | "walk" | "fidget" | "talk";

type Actor = {
  member: CastMember;
  root: THREE.Group;
  /** The model's own height in its units, so it can be scaled to pixels. */
  modelHeight: number;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationAction>;
  current?: THREE.AnimationAction;
  shadow: THREE.Mesh;
  /** Position along its lane, 0 to 1. */
  u: number;
  target: number;
  mode: Mode;
  /** Seconds left in the current idle or fidget. */
  wait: number;
  yaw: number;
};

const FADE = 0.25;
/** How far a walker turns toward where it's going (0 faces you, π/2 side-on). */
const WALK_YAW = 1.05;
/** A slight look down on the characters, as if from standing height. */
const TILT = 0.16;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(30,22,14,0.55)");
  grad.addColorStop(0.55, "rgba(30,22,14,0.22)");
  grad.addColorStop(1, "rgba(30,22,14,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A lane's pixel geometry for this layout: the floor line, its ends, and the character's height. */
function laneOf(member: CastMember, layout: RoomLayout) {
  const { lane } = member;
  if (lane.on === "desk") {
    const d = layout.desk;
    if (!d) return null;
    const y =
      d.top +
      d.height *
        (DESK_TOP.back + (DESK_TOP.front - DESK_TOP.back) * lane.depth);
    const x0 = Math.max(d.left + d.width * lane.from, 24);
    const x1 = Math.min(d.left + d.width * lane.to, layout.width - 24);
    return {
      x0,
      x1: Math.max(x0, x1),
      y,
      height: d.width * member.size,
      depth: lane.depth,
    };
  }
  const s = layout.sill;
  if (!s) return null;
  const w = s.right - s.left;
  return {
    x0: s.left + w * lane.from,
    x1: s.left + w * lane.to,
    y: s.y,
    height: s.unit * member.size,
    // Behind anything on the desk.
    depth: -1,
  };
}

export function createAgentStage(
  canvas: HTMLCanvasElement,
  opts: {
    cast: readonly CastMember[];
    layout: () => RoomLayout;
    reducedMotion: () => boolean;
    onPoses: (poses: Pose[]) => void;
  },
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  // Window light from the upper right, a warm fill from the room.
  const key = new THREE.DirectionalLight(0xfff0dc, 2.1);
  key.position.set(0.7, 0.9, 1);
  const fill = new THREE.HemisphereLight(0xfffaf2, 0xb88a5a, 1.1);
  scene.add(key, fill);

  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000);
  camera.position.z = 1000;

  const shadowTex = shadowTexture();
  const actors: Actor[] = [];
  let talking: AgentId | null = null;
  let disposed = false;
  let running = false;
  let frame = 0;
  let size = { w: 0, h: 0 };

  const play = (actor: Actor, name: string, once = false) => {
    const next = actor.clips.get(name);
    if (!next || next === actor.current) return next?.getClip().duration ?? 0;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    if (actor.current) next.crossFadeFrom(actor.current, FADE, true);
    next.play();
    actor.current = next;
    return next.getClip().duration;
  };

  const loader = new GLTFLoader();
  const ready = Promise.all(
    opts.cast.map(async (member, i) => {
      const gltf = await loader.loadAsync(member.model);
      const model = gltf.scene;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Skinned meshes keep their bind-pose bounds, which a walk can leave behind.
        mesh.frustumCulled = false;
        for (const m of [
          mesh.material,
        ].flat() as THREE.MeshStandardMaterial[]) {
          if ("roughness" in m) m.roughness = Math.max(m.roughness, 0.6);
          if ("metalness" in m && member.id !== "work") m.metalness = 0;
        }
      });
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true);
      model.position.y = -box.min.y;

      const root = new THREE.Group();
      root.add(model);
      root.rotation.x = TILT;
      scene.add(root);

      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      scene.add(shadow);

      const mixer = new THREE.AnimationMixer(model);
      const clips = new Map(
        gltf.animations.map((clip) => [
          clip.name.split("|").pop()!,
          mixer.clipAction(clip),
        ]),
      );
      const actor: Actor = {
        member,
        root,
        modelHeight: box.max.y - box.min.y,
        mixer,
        clips,
        shadow,
        // Spread out to start with.
        u: [0.55, 0.5, 0.3][i % 3],
        target: 0,
        mode: "idle",
        wait: rand(0.5, 3),
        yaw: 0,
      };
      // A fidget ends back at idle.
      mixer.addEventListener("finished", () => {
        if (actor.mode === "fidget" || actor.mode === "talk")
          play(actor, member.moves.idle);
      });
      play(actor, member.moves.idle);
      actors.push(actor);
    }),
  );

  const step = (
    actor: Actor,
    dt: number,
    lane: NonNullable<ReturnType<typeof laneOf>>,
  ) => {
    const { member } = actor;
    const still = opts.reducedMotion();
    if (talking === member.id) {
      if (actor.mode !== "talk") {
        actor.mode = "talk";
        play(actor, member.moves.greet, true);
      }
    } else if (actor.mode === "talk") {
      actor.mode = "idle";
      actor.wait = rand(1, 3);
      play(actor, member.moves.idle);
    } else if (actor.mode === "walk") {
      const span = Math.max(1, lane.x1 - lane.x0);
      const speed = (lane.height * member.pace) / span;
      const dir = Math.sign(actor.target - actor.u);
      actor.u += dir * speed * dt;
      if (
        (dir > 0 && actor.u >= actor.target) ||
        (dir < 0 && actor.u <= actor.target) ||
        dir === 0
      ) {
        actor.u = actor.target;
        actor.mode = "idle";
        actor.wait = rand(2.5, 7);
        play(actor, member.moves.idle);
      }
    } else {
      actor.wait -= dt;
      if (actor.wait <= 0 && !still) {
        if (actor.mode === "idle" && Math.random() < 0.3) {
          const fidget =
            member.moves.fidgets[
              Math.floor(Math.random() * member.moves.fidgets.length)
            ];
          actor.mode = "fidget";
          actor.wait = play(actor, fidget, true) + 0.4;
        } else {
          // Somewhere at least a body length away.
          let target = rand(0, 1);
          for (
            let tries = 0;
            tries < 4 &&
            Math.abs(target - actor.u) * (lane.x1 - lane.x0) < lane.height;
            tries++
          ) {
            target = rand(0, 1);
          }
          actor.target = target;
          actor.mode = "walk";
          play(actor, member.moves.walk);
        }
      } else if (actor.wait <= 0) {
        actor.wait = 5;
      }
    }

    // Face where it's going, or you.
    const wantYaw =
      actor.mode === "walk" ? Math.sign(actor.target - actor.u) * WALK_YAW : 0;
    actor.yaw += (wantYaw - actor.yaw) * Math.min(1, dt * 8);
    actor.root.rotation.y = actor.yaw;

    const x = lane.x0 + (lane.x1 - lane.x0) * actor.u;
    const scale = lane.height / actor.modelHeight;
    // Nearer the front of the desk draws over further back.
    const z = lane.depth * 100;
    actor.root.position.set(x, -lane.y, z);
    actor.root.scale.setScalar(scale);
    actor.shadow.position.set(x, -lane.y + lane.height * 0.02, z - 1);
    actor.shadow.scale.set(lane.height * 0.95, lane.height * 0.2, 1);
    actor.mixer.update(dt);
    return {
      id: member.id,
      x,
      y: lane.y,
      height: lane.height,
      visible: true,
    } satisfies Pose;
  };

  const clock = new THREE.Clock();
  const tick = () => {
    if (!running || disposed) return;
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    const layout = opts.layout();
    if (layout.width !== size.w || layout.height !== size.h) {
      size = { w: layout.width, h: layout.height };
      renderer.setSize(size.w, size.h, false);
      camera.right = size.w;
      camera.bottom = -size.h;
      camera.updateProjectionMatrix();
    }
    const poses: Pose[] = [];
    for (const actor of actors) {
      const lane = laneOf(actor.member, layout);
      actor.root.visible = actor.shadow.visible = !!lane;
      if (!lane) {
        poses.push({
          id: actor.member.id,
          x: 0,
          y: 0,
          height: 0,
          visible: false,
        });
        continue;
      }
      poses.push(step(actor, dt, lane));
    }
    renderer.render(scene, camera);
    opts.onPoses(poses);
  };

  return {
    ready,
    /** Run while the hero is on screen and the tab is visible; stop otherwise. */
    setRunning(on: boolean) {
      if (on === running || disposed) return;
      running = on;
      if (on) {
        clock.getDelta();
        frame = requestAnimationFrame(tick);
      } else cancelAnimationFrame(frame);
    },
    /** Who you're chatting with, or nobody. */
    setTalking(id: AgentId | null) {
      talking = id;
    },
    /** A one-off move: a nod when a reply lands, a shrug when it fails. */
    react(id: AgentId, move: "nod" | "shrug" | "greet") {
      const actor = actors.find((a) => a.member.id === id);
      if (actor) play(actor, actor.member.moves[move], true);
    },
    /** Dim with the room: `light` 1 by day, lower at night and under cloud. */
    setLight(light: number) {
      key.intensity = 2.1 * light;
      fill.intensity = 1.1 * light;
      scene.environmentIntensity = 0.45 * light;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      for (const a of actors) a.mixer.stopAllAction();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const m of [mesh.material].flat()) m.dispose();
      });
      shadowTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export type AgentStage = ReturnType<typeof createAgentStage>;
