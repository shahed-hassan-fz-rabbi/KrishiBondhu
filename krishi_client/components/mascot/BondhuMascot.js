"use client";

import { useEffect, useRef, useState } from "react";
import { createBondhuModel } from "./createBondhuModel.js";
import { getBondhuPose } from "./bondhuState.js";

function BondhuFallback() {
  return <svg viewBox="0 0 120 120" aria-hidden="true" className="kb-bondhu-fallback">
    <ellipse cx="60" cy="108" rx="32" ry="6" fill="#174b34" opacity=".16" />
    <path d="M41 73Q20 58 17 76q-1 13 20 15m42-18q21-15 24 3 1 13-20 15" fill="#82d796" stroke="#287f55" strokeWidth="3" strokeLinejoin="round" />
    <path d="M40 80q-17 7-15 19 2 7 11 3m44-22q17 7 15 19-2 7-11 3" fill="#329d62" stroke="#176447" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="60" cy="79" rx="24" ry="27" fill="#329d62" />
    <ellipse cx="60" cy="81" rx="15" ry="20" fill="#f2dfb4" />
    <ellipse cx="46" cy="98" rx="7" ry="5" fill="#176447" /><ellipse cx="72" cy="98" rx="7" ry="5" fill="#176447" />
    <path d="M43 41q-4-17-12-19 10-4 18 13m27 6q7-19 15-19-2 12-11 20" fill="#f2dfb4" stroke="#c6a77a" strokeWidth="3" strokeLinejoin="round" />
    <ellipse cx="60" cy="55" rx="32" ry="28" fill="#329d62" />
    <ellipse cx="48" cy="54" rx="8" ry="10" fill="#fffdf6" /><ellipse cx="72" cy="54" rx="8" ry="10" fill="#fffdf6" />
    <ellipse cx="50" cy="55" rx="3.5" ry="5" fill="#132d29" /><ellipse cx="74" cy="55" rx="3.5" ry="5" fill="#132d29" />
    <circle cx="49" cy="52" r="2" fill="#fff" /><circle cx="73" cy="52" r="2" fill="#fff" />
    <ellipse cx="60" cy="68" rx="12" ry="7" fill="#58bd73" /><circle cx="56" cy="67" r="1.5" fill="#18553d" /><circle cx="64" cy="67" r="1.5" fill="#18553d" />
    <path d="M54 73q6 5 12 0" fill="none" stroke="#176447" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

/** Lazy, low-power 3D companion with a vector fallback for disabled or unavailable WebGL. */
export function BondhuMascot({ className = "", state = "idle", facing = 1, active = true, label = "Bondhu, a friendly baby dragon" }) {
  const hostRef = useRef(null);
  const rendererHostRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(state);
  const facingRef = useRef(facing);
  const [fallback, setFallback] = useState(true);
  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    let renderer;
    let observer;
    let mediaQuery;
    let resizeFallback;
    const host = hostRef.current;
    let animationStart = 0;
    let previousFrame = 0;
    let previousFlying = false;
    let flightTransitionAt = 0;
    let flightTransitionDirection = 0;
    let nextBlinkAt = 0;
    let blinkUntil = 0;
    const gazeTarget = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const hostCenterX = rect.left + rect.width / 2;
      const hostCenterY = rect.top + rect.height / 2;
      const dx = (event.clientX - hostCenterX) / Math.max(160, window.innerWidth * 0.42);
      const dy = (hostCenterY - event.clientY) / Math.max(160, window.innerHeight * 0.42);
      gazeTarget.x = Math.max(-1, Math.min(1, dx));
      gazeTarget.y = Math.max(-1, Math.min(1, dy));
    };
    const onPointerOut = (event) => { if (!event.relatedTarget) { gazeTarget.x = 0; gazeTarget.y = 0; } };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      if (resizeFallback) window.removeEventListener("resize", resizeFallback);
      mediaQuery?.removeEventListener?.("change", onMotionPreference);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer?.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer?.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      renderer?.setAnimationLoop(null);
      const current = sceneRef.current;
      current?.scene?.traverse((item) => {
        item.geometry?.dispose();
        if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
        else item.material?.dispose();
      });
      renderer?.dispose();
      renderer?.domElement.remove();
      if (sceneRef.current?.renderer === renderer) sceneRef.current = null;
    };

    let applyPose = () => {};
    const renderFrame = (now) => {
      if (disposed || !renderer || document.hidden) return;
      const current = sceneRef.current;
      if (!current) return;
      const seconds = animationStart ? (now - animationStart) / 1000 : 0;
      const delta = previousFrame ? Math.min(0.05, Math.max(0, (now - previousFrame) / 1000)) : 1 / 60;
      previousFrame = now;
      const ease = (rate) => 1 - Math.exp(-rate * delta);
      const reduced = mediaQuery?.matches === true;
      const stateNow = stateRef.current;
      const pose = getBondhuPose(stateNow, seconds, reduced);
      const { root, parts } = current.model;
      const flying = pose.state === "flying";
      if (flying !== previousFlying) {
        previousFlying = flying;
        flightTransitionAt = seconds;
        flightTransitionDirection = flying ? 1 : -1;
      }
      const transition = Math.max(0, 1 - (seconds - flightTransitionAt) / 0.9);
      const flightLift = reduced ? 0 : flightTransitionDirection * transition * 0.16;
      const breathRate = pose.state === "sleeping" ? 0.8 : pose.state === "talking" ? 3.2 : 1.5;
      const breath = reduced ? 0 : Math.sin(seconds * breathRate) * (pose.state === "sleeping" ? 0.006 : 0.012);
      root.position.x += (0 - root.position.x) * ease(9);
      root.position.y += (-0.02 + pose.bob + flightLift - root.position.y) * ease(8);
      root.rotation.z += (pose.bodySway - root.rotation.z) * ease(7);
      root.rotation.x += ((flying ? -0.1 : 0) - root.rotation.x) * ease(6);
      root.rotation.y += ((flying ? facingRef.current * 0.24 : 0) - root.rotation.y) * ease(6);
      parts.body.scale.y = 1 + breath;
      // Expressive head and cursor orientation
      const targetLookY = (gazeTarget.x * 0.42);
      const targetLookX = (-gazeTarget.y * 0.26);
      const targetTiltZ = pose.headTilt + (gazeTarget.x * 0.08);
      parts.head.rotation.z += (targetTiltZ - parts.head.rotation.z) * ease(8);
      parts.head.rotation.x += (targetLookX - parts.head.rotation.x) * ease(6);
      parts.head.rotation.y += (targetLookY - parts.head.rotation.y) * ease(6);

      // Subtle torso posture tracks cursor direction
      parts.body.rotation.y += ((gazeTarget.x * 0.14) - parts.body.rotation.y) * ease(5);
      parts.body.rotation.x += ((-gazeTarget.y * 0.08) - parts.body.rotation.x) * ease(5);

      // Pupils track cursor with lifelike depth
      parts.gaze.forEach((gaze) => {
        gaze.position.x += (gazeTarget.x * 0.045 - gaze.position.x) * ease(14);
        gaze.position.y += (gazeTarget.y * 0.038 - gaze.position.y) * ease(14);
      });

      // Animated dragon ear-fins twitch and perk up
      if (parts.ears && parts.ears.length) {
        parts.ears.forEach((ear, idx) => {
          const side = idx === 0 ? -1 : 1;
          const twitch = reduced ? 0 : (Math.sin(seconds * 3.2 + idx * 1.8) > 0.88 ? Math.sin(seconds * 22) * 0.14 : 0);
          const earPerk = pose.state === "listening" || Math.abs(gazeTarget.x) > 0.4 ? 0.18 : 0;
          const targetRotZ = side * (0.24 + earPerk) + twitch;
          ear.rotation.z += (targetRotZ - ear.rotation.z) * ease(10);
        });
      }
      parts.tail.rotation.y += (pose.tailSway - parts.tail.rotation.y) * ease(6);
      parts.wings.forEach((wing, index) => {
        const direction = index === 0 ? -1 : 1;
        const idleFlutter = reduced || flying || pose.state === "happy" ? 0 : Math.sin(seconds * 1.45 + index * 0.25) * 0.014;
        const target = direction * (-0.05 + pose.wingFlap + idleFlutter);
        wing.rotation.z += (target - wing.rotation.z) * ease(flying ? 12 : 7);
      });
      parts.arms.forEach((arm, index) => {
        const direction = index === 0 ? -1 : 1;
        const target = direction * (0.1 + pose.armWave);
        arm.rotation.z += (target - arm.rotation.z) * ease(7);
      });
      let blink = 1;
      if (!reduced && pose.eyeOpen > 0.5) {
        if (!nextBlinkAt) nextBlinkAt = seconds + 2.8 + Math.random() * 2.4;
        if (seconds >= nextBlinkAt) {
          blinkUntil = seconds + 0.17;
          nextBlinkAt = seconds + 3 + Math.random() * 3.4;
        }
        if (seconds < blinkUntil) {
          const progress = 1 - (blinkUntil - seconds) / 0.17;
          blink = 1 - Math.sin(Math.PI * progress);
        }
      }
      const closed = 1 - pose.eyeOpen * blink;
      parts.eyes.forEach((eye, index) => {
        const lid = parts.lids[index];
        lid.position.y += ((0.224 - closed * 0.222) - lid.position.y) * ease(32);
        lid.scale.y = 0.226 * (0.82 + closed * 0.18);
      });
      parts.mouth.scale.y += (Math.max(0.008, pose.mouthOpen * 0.42) - parts.mouth.scale.y) * ease(14);
      renderer.render(current.scene, current.camera);
    };
    applyPose = (now = 0) => renderFrame(now);

    const resize = () => {
      if (!host || !renderer || !sceneRef.current) return;
      const width = Math.max(1, host.clientWidth || 120);
      const height = Math.max(1, host.clientHeight || 120);
      renderer.setSize(width, height, false);
      sceneRef.current.camera.aspect = width / height;
      sceneRef.current.camera.updateProjectionMatrix();
      applyPose(performance.now());
    };
    const onContextLost = (event) => {
      event.preventDefault();
      renderer?.setAnimationLoop(null);
      setFallback(true);
    };
    const onContextRestored = () => {
      setFallback(false);
      if (document.hidden) return;
      if (mediaQuery?.matches) applyPose(performance.now());
      else renderer?.setAnimationLoop(renderFrame);
    };
    const onVisibility = () => {
      if (document.hidden) renderer?.setAnimationLoop(null);
      else if (mediaQuery?.matches) applyPose(performance.now());
      else renderer?.setAnimationLoop(renderFrame);
    };
    const onMotionPreference = () => {
      if (mediaQuery?.matches) {
        renderer?.setAnimationLoop(null);
        applyPose(performance.now());
      } else if (!document.hidden) renderer?.setAnimationLoop(renderFrame);
    };

    async function mount() {
      try {
        const THREE = await import("three");
        if (disposed || !host) return;
        mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
        camera.position.set(0, 0.12, 6.15);
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power", precision: "mediump" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
        renderer.setSize(host.clientWidth || 120, host.clientHeight || 120, false);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9;
        scene.add(new THREE.HemisphereLight(0xf6fff3, 0x365e49, 0.85));
        const key = new THREE.DirectionalLight(0xfff1d6, 1.35);
        key.position.set(-3, 4, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xe4fff1, 0.35);
        fill.position.set(3, 2, 4);
        scene.add(fill);
        const softFront = new THREE.DirectionalLight(0xf0fff4, 0.42);
        softFront.position.set(0.5, 1.5, 5);
        scene.add(softFront);
        const rim = new THREE.DirectionalLight(0x8de5aa, 0.55);
        rim.position.set(3, 1, -3);
        scene.add(rim);
        const model = createBondhuModel(THREE);
        scene.add(model.root);
        rendererHostRef.current?.appendChild(renderer.domElement);
        sceneRef.current = { renderer, scene, camera, model, applyPose };
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerout", onPointerOut, { passive: true });
        animationStart = performance.now();
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(resize);
          observer.observe(host);
        } else {
          resizeFallback = resize;
          window.addEventListener("resize", resizeFallback, { passive: true });
        }
        renderer.domElement.addEventListener("webglcontextlost", onContextLost);
        renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
        document.addEventListener("visibilitychange", onVisibility);
        mediaQuery.addEventListener?.("change", onMotionPreference);
        setFallback(false);
        if (mediaQuery.matches) applyPose(animationStart);
        else renderer.setAnimationLoop(renderFrame);
      } catch (error) {
        if (!disposed) {
          console.error("[BondhuMascot] Three.js initialization failed; keeping the SVG fallback.", error);
          cleanup();
          setFallback(true);
        }
      }
    }

    void mount();
    return cleanup;
  }, [active]);

  useEffect(() => {
    stateRef.current = state;
    facingRef.current = facing;
    const current = sceneRef.current;
    if (current && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.renderer.setAnimationLoop(null);
      current.applyPose(performance.now());
      current.renderer.render(current.scene, current.camera);
    }
  }, [facing, state]);

  return <div ref={hostRef} className={`kb-bondhu-canvas ${fallback ? "is-fallback" : ""} ${className}`} role="img" aria-label={label}>
    <div ref={rendererHostRef} className="kb-bondhu-renderer" aria-hidden="true" />
    {(!active || fallback) && <BondhuFallback />}
  </div>;
}
