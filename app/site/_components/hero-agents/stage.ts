import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createBuddy, type BuddyMove } from "./buddy";
import { BUDDY, DESK_TOP } from "./cast";

/**
 * The 3D layer over the homepage hero: a transparent WebGL canvas the size of
 * the hero, drawn with an orthographic camera in CSS pixels (x right, y down,
 * so world y is the negated pixel y). The buddy stands on the desk top's
 * pixel position, measured from the DOM, so it stays put through any resize.
 *
 * It potters along the desk: stands about, hops now and then, wanders off
 * somewhere else, and keeps an eye on the pointer. While you're chatting
 * with it, it stops and faces you.
 */

/** Where the desk is, in pixels inside the hero. */
export type RoomLayout = {
  width: number;
  height: number;
  desk: { left: number; top: number; width: number; height: number } | null;
};

/** Where the buddy is on screen (its feet, and its height), for the button and the chat card. */
export type Pose = { x: number; y: number; height: number; visible: boolean };

type Mode = "idle" | "walk" | "fidget" | "talk";

/** How far it turns toward where it's walking (0 faces you, π/2 side-on). */
const WALK_YAW = 0.9;
/** A slight look down on it, as if from standing height. */
const TILT = 0.14;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(30,22,14,0.5)");
  grad.addColorStop(0.55, "rgba(30,22,14,0.2)");
  grad.addColorStop(1, "rgba(30,22,14,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The lane's pixel geometry for this layout: the floor line, its ends, and the buddy's height. */
function laneOf(layout: RoomLayout) {
  const d = layout.desk;
  if (!d) return null;
  const { lane } = BUDDY;
  const y = d.top + d.height * (DESK_TOP.back + (DESK_TOP.front - DESK_TOP.back) * lane.depth);
  const x0 = Math.max(d.left + d.width * lane.from, 40);
  const x1 = Math.min(d.left + d.width * lane.to, layout.width - 40);
  return { x0, x1: Math.max(x0, x1), y, height: d.width * BUDDY.size };
}

export function createAgentStage(
  canvas: HTMLCanvasElement,
  opts: {
    layout: () => RoomLayout;
    /** The pointer in hero pixels, or null when it's away. */
    pointer: () => { x: number; y: number } | null;
    reducedMotion: () => boolean;
    onPose: (pose: Pose) => void;
  },
) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  // Window light from the upper right, a warm fill from the room.
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(0.7, 0.9, 1);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-0.8, 0.6, -0.6);
  const fill = new THREE.HemisphereLight(0xfffaf2, 0xb88a5a, 1.0);
  scene.add(key, rim, fill);

  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000);
  camera.position.z = 1000;

  const buddy = createBuddy();
  const holder = new THREE.Group();
  holder.add(buddy.group);
  holder.rotation.x = TILT;
  scene.add(holder);

  const shadowTex = shadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  scene.add(shadow);

  let talking = false;
  let thinking = false;
  let mode: Mode = "idle";
  let wait = rand(1, 3);
  let u = 0.45;
  let target = u;
  let yaw = 0;
  let walkTime = 0;
  let disposed = false;
  let running = false;
  let frame = 0;
  let size = { w: 0, h: 0 };

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
    const lane = laneOf(layout);
    holder.visible = shadow.visible = !!lane;
    if (!lane) {
      renderer.render(scene, camera);
      opts.onPose({ x: 0, y: 0, height: 0, visible: false });
      return;
    }

    const still = opts.reducedMotion();
    if (talking) {
      if (mode !== "talk") {
        mode = "talk";
        buddy.play("wave");
      }
    } else if (mode === "talk") {
      mode = "idle";
      wait = rand(1.5, 3);
    } else if (mode === "walk") {
      const speed = (lane.height * BUDDY.pace) / Math.max(1, lane.x1 - lane.x0);
      const dir = Math.sign(target - u);
      u += dir * speed * dt;
      walkTime += dt;
      if ((dir > 0 && u >= target) || (dir < 0 && u <= target) || dir === 0) {
        u = target;
        mode = "idle";
        wait = rand(3, 8);
      }
    } else {
      wait -= dt;
      if (wait <= 0 && !still) {
        if (mode === "idle" && Math.random() < 0.3) {
          mode = "fidget";
          wait = buddy.play(Math.random() < 0.6 ? "hop" : "wave") + 0.5;
        } else {
          // Somewhere at least a body length away.
          let next = rand(0, 1);
          for (let tries = 0; tries < 4 && Math.abs(next - u) * (lane.x1 - lane.x0) < lane.height; tries++) {
            next = rand(0, 1);
          }
          target = next;
          mode = "walk";
          walkTime = 0;
        }
      } else if (wait <= 0) {
        wait = 5;
      }
    }

    const x = lane.x0 + (lane.x1 - lane.x0) * u;
    const walking = mode === "walk";
    const wantYaw = walking ? Math.sign(target - u) * WALK_YAW : 0;
    yaw += (wantYaw - yaw) * Math.min(1, dt * 7);
    buddy.group.rotation.y = yaw;

    // Look at the pointer from the middle of its face.
    const p = opts.pointer();
    const faceY = lane.y - lane.height * 0.6;
    const look = p && !walking ? { x: clamp((p.x - x) / 400, -1, 1), y: clamp((faceY - p.y) / 300, -1, 1) } : null;
    buddy.animate(dt, { walking, time: walkTime, look, thinking });

    holder.position.set(x, -lane.y, 0);
    holder.scale.setScalar(lane.height);
    shadow.position.set(x, -lane.y + lane.height * 0.02, -500);
    shadow.scale.set(lane.height * 1.05, lane.height * 0.2, 1);

    renderer.render(scene, camera);
    opts.onPose({ x, y: lane.y, height: lane.height, visible: true });
  };
  const clock = new THREE.Clock();

  return {
    /** Run while the hero is on screen and the tab is visible; stop otherwise. */
    setRunning(on: boolean) {
      if (on === running || disposed) return;
      running = on;
      if (on) {
        clock.getDelta();
        frame = requestAnimationFrame(tick);
      } else cancelAnimationFrame(frame);
    },
    /** Whether you're chatting with it. */
    setTalking(on: boolean) {
      talking = on;
    },
    /** Waiting on its reply. */
    setThinking(on: boolean) {
      thinking = on;
    },
    /** A one-off move: a nod when a reply lands, a shrug when it fails, a wave hello. */
    react(move: BuddyMove) {
      buddy.play(move);
    },
    /** Dim with the room: `light` 1 by day, lower at night and under cloud. */
    setLight(light: number) {
      key.intensity = 2.2 * light;
      rim.intensity = 0.9 * light;
      fill.intensity = 1.0 * light;
      scene.environmentIntensity = 0.5 * light;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      buddy.dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      shadowTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export type AgentStage = ReturnType<typeof createAgentStage>;
