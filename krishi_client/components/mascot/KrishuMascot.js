"use client";

import { useEffect, useRef, useState } from "react";

/** A small procedural WebGL seedling. The renderer is loaded only when this view mounts. */
export function KrishuMascot({ className = "", state = "idle", active = true, label = "Krishu, a friendly green seedling" }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(state);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    let renderer;
    let lastFrame = 0;
    let blinkAt = 0;
    let blinkUntil = 0;
    let mouseX = 0;
    let mouseY = 0;
    const host = hostRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    async function mountScene() {
      try {
        const THREE = await import("three");
        if (disposed || !host) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 30);
        camera.position.set(0, 0.2, 6.2);
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
        renderer.setSize(host.clientWidth || 120, host.clientHeight || 120, false);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.replaceChildren(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xf5fff4, 0x477c40, 2.15));
        const key = new THREE.DirectionalLight(0xfff4d8, 3.2);
        key.position.set(-3, 5, 7);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x8ce6a2, 1.5);
        rim.position.set(3, 1, -3);
        scene.add(rim);

        const character = new THREE.Group();
        scene.add(character);
        const green = new THREE.MeshPhysicalMaterial({ color: 0x62bf64, roughness: 0.35, metalness: 0, clearcoat: 0.35 });
        const lightGreen = new THREE.MeshPhysicalMaterial({ color: 0x8bdc68, roughness: 0.36, clearcoat: 0.45 });
        const darkGreen = new THREE.MeshStandardMaterial({ color: 0x287f50, roughness: 0.46 });
        const white = new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: 0.18 });
        const iris = new THREE.MeshStandardMaterial({ color: 0x183d35, roughness: 0.28 });
        const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sphere = new THREE.SphereGeometry(1, 28, 20);
        const makeBall = (material, scale, position, parent = character) => {
          const mesh = new THREE.Mesh(sphere, material);
          mesh.scale.set(...scale);
          mesh.position.set(...position);
          parent.add(mesh);
          return mesh;
        };

        const body = makeBall(green, [0.91, 1.05, 0.66], [0, -0.31, 0]);
        makeBall(lightGreen, [0.56, 0.4, 0.49], [0, 0.46, 0.08]);
        makeBall(new THREE.MeshStandardMaterial({ color: 0xf7d57a, roughness: 0.78 }), [0.92, 0.18, 0.66], [0, -1.13, 0]);

        const eyes = [];
        for (const x of [-0.31, 0.31]) {
          const eye = makeBall(white, [0.205, 0.255, 0.12], [x, 0.42, 0.54]);
          eyes.push(eye);
          const pupil = makeBall(iris, [0.088, 0.12, 0.064], [x, 0.4, 0.65]);
          pupil.userData.followPointer = true;
          pupil.userData.baseX = x;
          pupil.userData.baseY = 0.4;
          makeBall(glint, [0.034, 0.04, 0.025], [x - 0.025, 0.45, 0.7]);
        }

        const smilePath = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-0.15, 0.13, 0.64),
          new THREE.Vector3(0, -0.01, 0.71),
          new THREE.Vector3(0.15, 0.13, 0.64),
        );
        character.add(new THREE.Mesh(new THREE.TubeGeometry(smilePath, 14, 0.023, 6, false), new THREE.MeshStandardMaterial({ color: 0x205b42 })));

        const leaves = [];
        for (const direction of [-1, 1]) {
          const leafGroup = new THREE.Group();
          leafGroup.position.set(direction * 0.1, 0.76, 0);
          leafGroup.rotation.z = direction * -0.48;
          character.add(leafGroup);
          const leaf = makeBall(lightGreen, [0.25, 0.58, 0.105], [direction * 0.27, 0.48, 0], leafGroup);
          leaf.rotation.z = direction * -0.22;
          const veinPath = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0.04, 0.105),
            new THREE.Vector3(direction * 0.06, 0.48, 0.115),
            new THREE.Vector3(direction * 0.25, 0.9, 0.015),
          );
          leafGroup.add(new THREE.Mesh(new THREE.TubeGeometry(veinPath, 12, 0.018, 5, false), darkGreen));
          leaves.push(leafGroup);
        }

        const arms = [];
        for (const direction of [-1, 1]) {
          const arm = new THREE.Group();
          arm.position.set(direction * 0.77, -0.34, 0.02);
          character.add(arm);
          const upper = makeBall(green, [0.16, 0.42, 0.15], [direction * 0.03, -0.12, 0], arm);
          upper.rotation.z = direction * -0.55;
          makeBall(lightGreen, [0.16, 0.16, 0.15], [direction * 0.25, -0.38, 0.02], arm);
          arms.push(arm);
        }

        const legs = [];
        for (const x of [-0.42, 0.42]) {
          const leg = makeBall(darkGreen, [0.13, 0.31, 0.13], [x, -1.16, 0]);
          leg.position.y = -1.12;
          legs.push(leg);
        }

        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.86, 32), new THREE.MeshBasicMaterial({ color: 0x245d3e, transparent: true, opacity: 0.11 }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, -1.29, -0.12);
        shadow.scale.set(1.2, 0.43, 1);
        character.add(shadow);

        const resize = () => {
          if (!host || !renderer) return;
          renderer.setSize(host.clientWidth || 120, host.clientHeight || 120, false);
          camera.aspect = (host.clientWidth || 120) / (host.clientHeight || 120);
          camera.updateProjectionMatrix();
        };
        const observe = new ResizeObserver(resize);
        observe.observe(host);
        const move = (event) => {
          const rect = host.getBoundingClientRect();
          mouseX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1));
          mouseY = Math.max(-1, Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height) * 2));
        };
        window.addEventListener("pointermove", move, { passive: true });
        const contextLost = (event) => { event.preventDefault(); setFallback(true); };
        const contextRestored = () => setFallback(false);
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
        const visibility = () => { if (document.hidden) renderer.setAnimationLoop(null); else renderer.setAnimationLoop(draw); };
        document.addEventListener("visibilitychange", visibility);

        const draw = (now) => {
          if (disposed || document.hidden || now - lastFrame < 40) return;
          lastFrame = now;
          const seconds = now / 1000;
          if (seconds > blinkAt) { blinkUntil = seconds + 0.12; blinkAt = seconds + 2.4 + Math.random() * 3.3; }
          const blink = seconds < blinkUntil ? 0.12 : 1;
          eyes.forEach((eye) => { eye.scale.y = 0.255 * (reduced.matches ? 1 : blink); });
          character.position.y = -0.02 + (reduced.matches ? 0 : Math.sin(seconds * 1.55) * 0.045);
          const lookX = reduced.matches ? 0 : mouseX;
          const lookY = reduced.matches ? 0 : mouseY;
          character.rotation.y += ((lookX * 0.25 + (!reduced.matches && stateRef.current === "thinking" ? Math.sin(seconds) * 0.08 : 0)) - character.rotation.y) * 0.045;
          character.rotation.x += ((-lookY * 0.1) - character.rotation.x) * 0.05;
          scene.traverse((item) => {
            if (item.userData.followPointer) {
              item.position.x = item.userData.baseX + mouseX * 0.035;
              item.position.y = item.userData.baseY + mouseY * 0.025;
            }
          });
          body.scale.y = 1.05 + (stateRef.current === "listening" ? Math.sin(seconds * 5) * 0.025 : Math.sin(seconds * 1.55) * 0.012);
          leaves.forEach((leaf, index) => { leaf.rotation.z = (index ? -1 : 1) * 0.48 + (reduced.matches ? 0 : Math.sin(seconds * 1.8 + index) * 0.035); });
          arms.forEach((arm, index) => {
            const side = index ? 1 : -1;
            const wave = !reduced.matches && (stateRef.current === "celebrating" || stateRef.current === "greeting") ? Math.sin(seconds * 7) * 0.35 : 0;
            arm.rotation.z = side * (0.12 + wave);
          });
          legs.forEach((leg, index) => { leg.rotation.z = stateRef.current === "thinking" ? (index ? -1 : 1) * 0.08 : 0; });
          renderer.render(scene, camera);
        };
        renderer.setAnimationLoop(draw);
        sceneRef.current = { renderer, observe, move, contextLost, contextRestored, visibility, scene, character };
        setFallback(false);
      } catch {
        if (!disposed) setFallback(true);
      }
    }

    mountScene();
    return () => {
      disposed = true;
      const active = sceneRef.current;
      if (active) {
        active.observe?.disconnect();
        window.removeEventListener("pointermove", active.move);
        document.removeEventListener("visibilitychange", active.visibility);
        active.renderer?.domElement.removeEventListener("webglcontextlost", active.contextLost);
        active.renderer?.domElement.removeEventListener("webglcontextrestored", active.contextRestored);
        active.renderer?.setAnimationLoop(null);
        active.scene?.traverse((item) => {
          item.geometry?.dispose();
          if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
          else item.material?.dispose();
        });
        active.renderer?.dispose();
        active.renderer?.domElement.remove();
      }
      sceneRef.current = null;
    };
  }, [active]);

  return <div ref={hostRef} className={`kb-krishu-canvas ${className}`} role="img" aria-label={label}>
    {(!active || fallback) && <svg viewBox="0 0 100 100" aria-hidden="true" className="kb-krishu-fallback"><ellipse cx="50" cy="84" rx="29" ry="6" fill="#39734d" opacity=".15"/><ellipse cx="50" cy="55" rx="27" ry="31" fill="#72c866"/><ellipse cx="42" cy="51" rx="7" ry="9" fill="#fffdf5"/><ellipse cx="59" cy="51" rx="7" ry="9" fill="#fffdf5"/><circle cx="43" cy="52" r="3.4" fill="#183d35"/><circle cx="60" cy="52" r="3.4" fill="#183d35"/><path d="M45 66q5 7 11 0M50 28Q27 9 37 3q13 1 15 22Q64 8 74 13q2 14-21 21" fill="#53a858" stroke="#287f50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
  </div>;
}
