/** Create an original, transparent-scene baby dragon from smooth procedural surfaces. */
export function createBondhuModel(THREE) {
  const root = new THREE.Group();
  root.name = "Bondhu";
  const parts = { root, eyes: [], lids: [], gaze: [], wings: [], arms: [], mouth: null, tail: null, ears: [], spines: [] };

  const green = new THREE.MeshPhysicalMaterial({ color: 0x287847, vertexColors: true, roughness: 0.82, metalness: 0.01, clearcoat: 0.025, clearcoatRoughness: 0.88, sheen: 0.18, sheenColor: 0x78b98a });
  // Lift the sRGB palette after decoding so the softly lit skin reads bright green, not near-black.
  green.color.lerp(new THREE.Color(0x49a764), 0.4);
  const greenLight = new THREE.MeshStandardMaterial({ color: 0x5ea76c, roughness: 0.82 });
  const headSkin = new THREE.MeshStandardMaterial({ color: 0x32864c, vertexColors: true, roughness: 0.84 });
  headSkin.color.lerp(new THREE.Color(0x54b570), 0.32);
  const greenDeep = new THREE.MeshStandardMaterial({ color: 0x245c43, roughness: 0.82 });
  const scaleGreen = new THREE.MeshStandardMaterial({ color: 0x5c9b67, roughness: 0.86 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xfff9e9, roughness: 0.84 });
  const sclera = new THREE.MeshStandardMaterial({ color: 0xfffdf7, roughness: 0.28 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x11211d, roughness: 0.25 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x174c37, roughness: 0.86 });
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x20553e, roughness: 0.8 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xe88c81, roughness: 0.9, transparent: true, opacity: 0.3 });
  const spineMat = new THREE.MeshStandardMaterial({ color: 0x4c925b, roughness: 0.86 });
  // Warm yellow-gold details and soft white accents make the little dragon read as friendly and real.
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe0ae3c, roughness: 0.42, metalness: 0.22 });
  const irisRingMat = new THREE.MeshStandardMaterial({ color: 0x4d9b5c, roughness: 0.48 });
  const irisDarkMat = new THREE.MeshStandardMaterial({ color: 0x174c37, roughness: 0.32 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x9ab95e, roughness: 0.72 });

  // A hand-drawn overlapping-scale texture gives the smooth surfaces a soft, believable reptilian grain.
  let scaleTexture = null;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#d9e8d5"; ctx.fillRect(0, 0, 256, 256);
      // Keep only a faint skin grain so Bondhu reads as a soft baby creature,
      // rather than a realistic scaled reptile at small sizes.
      ctx.strokeStyle = "rgba(58,112,72,0.10)"; ctx.lineWidth = 1.4;
      for (let row = 0; row < 9; row += 1) {
        for (let col = -1; col < 9; col += 1) {
          const x = col * 32 + (row % 2 ? 16 : 0);
          const y = row * 30;
          ctx.beginPath(); ctx.arc(x + 16, y + 15, 17, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        }
      }
      scaleTexture = new THREE.CanvasTexture(canvas);
      scaleTexture.wrapS = THREE.RepeatWrapping; scaleTexture.wrapT = THREE.RepeatWrapping;
      scaleTexture.repeat.set(1.6, 1.1);
      scaleTexture.colorSpace = THREE.SRGBColorSpace;
      green.map = scaleTexture; headSkin.map = scaleTexture;
    }
  }

  const sphere = new THREE.SphereGeometry(1, 40, 28);

  const ball = (material, size, position, parent = root, name = "") => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.scale.set(...size); mesh.position.set(...position); mesh.name = name; parent.add(mesh); return mesh;
  };
  const tube = (points, radius, material, parent, segments = 24, radialSegments = 8) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radialSegments, false), material);
    parent.add(mesh); return mesh;
  };
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // A continuous ring surface gives the torso a soft shoulder, waist and lower-body silhouette.
  function torsoPoint(theta, phi, offset = 0) {
    const y = Math.cos(theta);
    const fullness = 1 + 0.16 * smooth(-0.2, 0.9, y) - 0.12 * Math.exp(-(((y - 0.15) / 0.32) ** 2));
    const radial = Math.sin(theta);
    const x = 0.68 * radial * Math.sin(phi) * fullness;
    const z = 0.55 * radial * Math.cos(phi) * (0.94 + 0.08 * smooth(-0.5, 0.6, y));
    return [x * (1 + offset), 0.84 * y, z * (1 + offset)];
  }
  function surfaceGeometry(pointAt, rows = 72, columns = 96, colorize = false) {
    const positions = [], colors = [], indices = [], uvs = [];
    const shade = new THREE.Color();
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      for (let col = 0; col <= columns; col += 1) {
        const u = col / columns; positions.push(...pointAt(v, u)); uvs.push(u, v);
        if (colorize) {
          const variation = 0.965 + 0.025 * Math.sin(u * Math.PI * 12 + v * Math.PI * 5) + 0.018 * Math.cos(v * Math.PI * 17);
          shade.setRGB(0.9 * variation, 0.94 * variation, 0.9 * variation);
          shade.multiplyScalar(1.1);
          colors.push(shade.r, shade.g, shade.b);
        }
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col, b = a + columns + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    if (colorize) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }
  const torsoGeometry = surfaceGeometry((v, u) => torsoPoint(v * Math.PI, u * Math.PI * 2), 72, 96, true);
  const body = new THREE.Group(); body.position.set(0, -0.28, 0); body.scale.set(1.08, 0.86, 1.04); root.add(body); parts.body = body;
  const torso = new THREE.Mesh(torsoGeometry, green); torso.name = "sculpted-torso"; body.add(torso);

  // A surface-conforming cream bib follows the same torso profile instead of sitting on it as a ball.
  const bib = surfaceGeometry((v, u) => {
    const theta = 0.43 + v * 2.28;
    const phi = (u - 0.5) * 1.17;
    return torsoPoint(theta, phi, 0.012);
  }, 40, 48);
  const bibMesh = new THREE.Mesh(bib, belly); bibMesh.name = "continuous-cream-belly"; body.add(bibMesh);
  const bellyLineMat = new THREE.MeshStandardMaterial({ color: 0xdcc79c, roughness: 0.92 });
  for (const y of [-0.44, -0.26, -0.08, 0.1, 0.28]) {
    const half = Math.sqrt(Math.max(0.1, 1 - (y / 0.84) ** 2)) * 0.31;
    tube([[-half, y, 0.538], [0, y - 0.018, 0.553], [half, y, 0.538]], 0.009, bellyLineMat, body, 12, 6);
  }
  // A soft golden collar ties the green torso to the white bib and yellow accents.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.052, 12, 56), goldMat);
  collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.5, -0.02); collar.name = "golden-collar"; root.add(collar);

  // Graduated golden dragon spine plates along the back
  const spineSpecs = [
    [0, 0.52, -0.44, 0.065, 0.1],
    [0, 0.22, -0.5, 0.08, 0.13],
    [0, -0.06, -0.53, 0.09, 0.14],
    [0, -0.32, -0.5, 0.08, 0.12],
    [0, -0.56, -0.44, 0.065, 0.09],
  ];
  for (const [sx, sy, sz, radius, height] of spineSpecs) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.58, height * 0.62, 7), spineMat);
    spine.position.set(sx, sy, sz);
    spine.rotation.x = -Math.PI / 2.2;
    spine.rotation.y = Math.PI / 4;
    body.add(spine);
    parts.spines.push(spine);
  }

  const head = new THREE.Group(); head.position.set(0, 0.57, 0.06); head.scale.set(1.34, 1.28, 1.16); root.add(head); parts.head = head;
  // Deformed UV sphere blends forehead, cheeks and short muzzle into one smooth head shell.
  const headGeometry = new THREE.SphereGeometry(1, 80, 56);
  const hp = headGeometry.attributes.position;
  for (let i = 0; i < hp.count; i += 1) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const cheek = 1 + 0.035 * Math.exp(-(((Math.abs(x) - 0.55) / 0.3) ** 2) - (((y + 0.2) / 0.32) ** 2));
    x *= 0.76 * cheek;
    y *= 0.75;
    z *= 0.63;
    // Keep the muzzle softly rounded and close to the face; a strong protrusion
    // made the old expression look stern and reptilian.
    const muzzle = Math.exp(-((x / 0.4) ** 2) - (((y + 0.19) / 0.26) ** 2));
    if (z > 0) z += 0.08 * muzzle * smooth(0, 0.3, z);
    hp.setXYZ(i, x, y, z);
  }
  const headColors = [];
  for (let i = 0; i < hp.count; i += 1) {
    const y = hp.getY(i), z = hp.getZ(i);
    const variation = 0.98 + 0.018 * Math.sin(y * 25 + z * 18) + 0.012 * Math.cos(y * 34 - z * 9);
    headColors.push(0.92 * variation, 0.95 * variation, 0.92 * variation);
  }
  for (let i = 0; i < headColors.length; i += 1) headColors[i] *= 1.1;
  headGeometry.setAttribute("color", new THREE.Float32BufferAttribute(headColors, 3));
  headGeometry.computeVertexNormals();
  const headMesh = new THREE.Mesh(headGeometry, headSkin); headMesh.name = "sculpted-head-and-muzzle"; head.add(headMesh);

  // Soft brows, small horns and lively dragon ear fins preserve Bondhu's friendly silhouette.
  for (const side of [-1, 1]) {
    const horn = tube([
      [side * 0.36, 0.46, -0.05], [side * 0.42, 0.57, -0.07],
      [side * 0.45, 0.68, -0.04], [side * 0.4, 0.75, 0.02],
    ], 0.055, hornMat, head, 20, 10);
    horn.name = "curved-horn";
    // Thin, lifted brows read as curious and gentle instead of heavy/scowling.
    const brow = tube([[side * 0.15, 0.37, 0.61], [side * 0.28, 0.4, 0.6], [side * 0.39, 0.37, 0.55]], 0.008, greenLight, head, 14, 6);
    brow.name = "soft-curious-brow";
    ball(blushMat, [0.09, 0.035, 0.012], [side * 0.43, -0.23, 0.47], head);
    ball(nostrilMat, [0.023, 0.017, 0.012], [side * 0.13, -0.18, 0.837], head);

    // Expressive dragon ear fins that perk up and twitch
    const ear = new THREE.Group();
    ear.position.set(side * 0.52, 0.42, -0.08);
    ear.rotation.y = side * 0.32;
    ear.rotation.z = side * 0.25;
    const earFin = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 5), greenLight);
    earFin.rotation.z = -side * 1.05;
    earFin.scale.set(0.35, 1, 0.12);
    ear.add(earFin);
    head.add(ear);
    parts.ears.push(ear);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(side * 0.265, 0.105, 0.53); eye.scale.set(1.28, 1.3, 1.02); head.add(eye);
    ball(sclera, [0.202, 0.232, 0.125], [0, 0, 0], eye, "eye-white");
    const gaze = new THREE.Group(); eye.add(gaze);
    ball(irisRingMat, [0.132, 0.16, 0.052], [0.014, -0.006, 0.104], gaze, "soft-green-iris-edge");
    ball(irisDarkMat, [0.116, 0.144, 0.064], [0.016, -0.006, 0.132], gaze, "iris");
    ball(pupil, [0.084, 0.112, 0.044], [0.02, -0.01, 0.17], gaze, "pupil");
    ball(shine, [0.04, 0.05, 0.02], [-0.006, 0.045, 0.198], gaze, "eye-highlight");
    ball(shine, [0.016, 0.019, 0.011], [0.03, -0.034, 0.19], gaze, "eye-highlight-secondary");
    // A curved upper shell sweeps down over the sclera during a true eyelid blink.
    const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2), greenLight);
    lid.scale.set(0.207, 0.238, 0.134); lid.rotation.z = Math.PI; lid.position.set(0, 0.236, 0.015); lid.name = "upper-eyelid"; eye.add(lid);
    parts.eyes.push(eye); parts.lids.push(lid); parts.gaze.push(gaze);
  }

  // A tiny warm nose and soft cheeks keep the larger baby face gentle and readable.
  ball(greenLight, [0.038, 0.025, 0.018], [0, -0.15, 0.845], head, "soft-green-nose");

  // A shallow smile and inset mouth sit on the muzzle's front surface.
  tube([[-0.12, -0.405, 0.7], [0, -0.365, 0.73], [0.12, -0.405, 0.7]], 0.012, greenDeep, head, 18, 7);
  parts.mouth = ball(mouthMat, [0.067, 0.006, 0.014], [0, -0.39, 0.724], head, "talking-mouth");

  // Rounded limbs use tapered capsules and individually shaped fingers/toes, not sphere piles.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.56, -0.29, 0.04); root.add(arm);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.28, 6, 14), greenLight);
    upper.position.set(side * 0.08, -0.12, 0); upper.rotation.z = side * -0.48; arm.add(upper);
    const palm = ball(greenLight, [0.13, 0.095, 0.095], [side * 0.19, -0.31, 0.06], arm, "palm"); palm.rotation.z = side * -0.22;
    for (let digit = -1; digit <= 1; digit += 1) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.06, 4, 8), greenLight);
      finger.position.set(side * 0.19 + digit * 0.052, -0.39, 0.1); finger.rotation.z = -digit * 0.18; arm.add(finger);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 8), belly); claw.position.set(finger.position.x, -0.438, 0.115); claw.rotation.x = Math.PI / 2; arm.add(claw);
    }
    parts.arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * 0.34, -0.84, 0.06); leg.rotation.x = -0.48; root.add(leg);
    const haunch = ball(greenLight, [0.28, 0.3, 0.3], [side * 0.1, 0.2, -0.07], leg, "rounded-haunch");
    haunch.rotation.z = side * 0.16;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.16, 5, 12), greenDeep); shin.position.set(0, -0.09, 0); leg.add(shin);
    const foot = ball(greenLight, [0.19, 0.105, 0.22], [side * 0.025, -0.25, 0.1], leg, "rounded-foot");
    for (let toe = -1; toe <= 1; toe += 1) {
      const toeMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.075, 4, 9), greenLight);
      toeMesh.position.set(side * 0.025 + toe * 0.075, -0.28, 0.255); toeMesh.rotation.x = Math.PI / 2; leg.add(toeMesh);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 8), belly); claw.position.set(toeMesh.position.x, -0.28, 0.33); claw.rotation.x = Math.PI / 2; leg.add(claw);
    }
    foot.name = "foot";
  }

  // Thick, beveled wing membranes with three curved supports, mirrored about the spine.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.02); wingShape.bezierCurveTo(0.04, 0.25, 0.12, 0.53, 0.4, 0.62);
  wingShape.quadraticCurveTo(0.35, 0.43, 0.62, 0.34); wingShape.quadraticCurveTo(0.47, 0.23, 0.5, 0.08);
  wingShape.quadraticCurveTo(0.32, 0.14, 0.24, -0.1); wingShape.quadraticCurveTo(0.07, -0.03, 0, 0.02);
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: 0.045, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.018, bevelThickness: 0.012, curveSegments: 12 });
  const membrane = new THREE.MeshStandardMaterial({ color: 0x8ec37d, roughness: 0.84, side: THREE.DoubleSide });
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x327d55, roughness: 0.84 });
  for (const side of [-1, 1]) {
    // Keep the soft wings visible around the silhouette, like a perched baby pet.
    const wing = new THREE.Group(); wing.position.set(side * 0.56, 0.02, -0.5); wing.scale.set(side * 0.92, 0.9, 0.78); wing.rotation.z = side * -0.14; root.add(wing);
    const surface = new THREE.Mesh(wingGeometry, membrane); wing.add(surface);
    tube([[0, 0.01, 0.06], [0.13, 0.2, 0.06], [0.4, 0.61, 0.06]], 0.018, ribMaterial, wing, 20, 7);
    tube([[0, 0.01, 0.06], [0.33, 0.2, 0.06], [0.61, 0.34, 0.06]], 0.013, ribMaterial, wing, 16, 7);
    tube([[0, 0.01, 0.06], [0.35, 0.08, 0.06], [0.49, 0.08, 0.06]], 0.011, ribMaterial, wing, 12, 6);
    parts.wings.push(wing);
  }

  // A short, curled tail peeks out behind the seated baby dragon.
  const tail = new THREE.Group(); tail.position.set(0.22, -0.49, -0.12); tail.scale.setScalar(0.78); root.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([[0, 0, 0], [0.18, -0.13, 0.07], [0.43, -0.09, 0.18], [0.67, 0.1, 0.24], [0.82, 0.35, 0.18]].map((p) => new THREE.Vector3(...p)));
  const tailGeometry = new THREE.TubeGeometry(tailCurve, 48, 0.12, 16, false);
  const positions = tailGeometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const row = Math.floor(i / 17), factor = Math.max(0.12, 1 - row / 46);
    const center = tailCurve.getPoint(Math.min(1, row / 48));
    const p = new THREE.Vector3().fromBufferAttribute(positions, i);
    positions.setXYZ(i, center.x + (p.x - center.x) * factor, center.y + (p.y - center.y) * factor, center.z + (p.z - center.z) * factor);
  }
  tailGeometry.computeVertexNormals(); tail.add(new THREE.Mesh(tailGeometry, greenLight));
  const tipShape = new THREE.SphereGeometry(1, 28, 20); const tip = new THREE.Mesh(tipShape, goldMat);
  tip.scale.set(0.13, 0.19, 0.09); tip.position.set(0.82, 0.35, 0.18); tip.rotation.z = -0.4; tail.add(tip); parts.tail = tail;

  // A softly layered leaf cushion gives Bondhu a cozy place to perch.
  const cushion = new THREE.Group(); cushion.name = "leaf-perch"; cushion.position.set(0, -1.27, 0.12); root.add(cushion);
  const cushionGreen = new THREE.MeshStandardMaterial({ color: 0x75a95d, roughness: 0.94 });
  const cushionLight = new THREE.MeshStandardMaterial({ color: 0xa7ca70, roughness: 0.94 });
  const cushionBase = ball(cushionGreen, [0.72, 0.09, 0.42], [0, 0, 0], cushion, "soft-leaf-seat");
  cushionBase.rotation.z = -0.04;
  for (const side of [-1, 1]) {
    const leaf = ball(side < 0 ? cushionLight : greenLight, [0.4, 0.035, 0.14], [side * 0.2, 0.055, 0.05], cushion, "perch-leaf");
    leaf.rotation.z = side * -0.13;
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 40), new THREE.MeshBasicMaterial({ color: 0x575b54, transparent: true, opacity: 0.045, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -1.29, -0.15); shadow.scale.set(1.2, 0.4, 1); root.add(shadow);
  return { root, parts };
}
