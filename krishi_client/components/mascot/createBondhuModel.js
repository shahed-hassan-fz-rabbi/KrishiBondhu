/** Create an original, transparent-scene baby dragon from smooth procedural surfaces. */
export function createBondhuModel(THREE) {
  const root = new THREE.Group();
  root.name = "Bondhu";
  const parts = { root, eyes: [], lids: [], gaze: [], wings: [], arms: [], mouth: null, tail: null, ears: [], spines: [] };

  const green = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.76, metalness: 0.04, clearcoat: 0.04, clearcoatRoughness: 0.85, sheen: 0.22, sheenColor: 0x9be8b0 });
  const greenLight = new THREE.MeshStandardMaterial({ color: 0x67ae7b, roughness: 0.78 });
  const headSkin = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.79 });
  const greenDeep = new THREE.MeshStandardMaterial({ color: 0x245c43, roughness: 0.82 });
  const scaleGreen = new THREE.MeshStandardMaterial({ color: 0x79b982, roughness: 0.83 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xf3e4c2, roughness: 0.84 });
  const sclera = new THREE.MeshStandardMaterial({ color: 0xfffdf7, roughness: 0.28 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x2d7557, roughness: 0.38 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x11211d, roughness: 0.25 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x693e43, roughness: 0.8 });
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x20553e, roughness: 0.8 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xd9897a, roughness: 0.9, transparent: true, opacity: 0.45 });
  const spineMat = new THREE.MeshStandardMaterial({ color: 0xd99631, roughness: 0.65, metalness: 0.06 });
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
    const positions = [], colors = [], indices = [];
    const shade = new THREE.Color();
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      for (let col = 0; col <= columns; col += 1) {
        const u = col / columns; positions.push(...pointAt(v, u));
        if (colorize) {
          const variation = 0.965 + 0.025 * Math.sin(u * Math.PI * 12 + v * Math.PI * 5) + 0.018 * Math.cos(v * Math.PI * 17);
          shade.setRGB(0.72 * variation, 0.91 * variation, 0.77 * variation);
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
    if (colorize) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }
  const torsoGeometry = surfaceGeometry((v, u) => torsoPoint(v * Math.PI, u * Math.PI * 2), 72, 96, true);
  const body = new THREE.Group(); body.position.set(0, -0.28, 0); root.add(body); parts.body = body;
  const torso = new THREE.Mesh(torsoGeometry, green); torso.name = "sculpted-torso"; body.add(torso);

  // A surface-conforming cream bib follows the same torso profile instead of sitting on it as a ball.
  const bib = surfaceGeometry((v, u) => {
    const theta = 0.43 + v * 2.28;
    const phi = (u - 0.5) * 1.17;
    return torsoPoint(theta, phi, 0.012);
  }, 40, 48);
  const bibMesh = new THREE.Mesh(bib, belly); bibMesh.name = "continuous-cream-belly"; body.add(bibMesh);
  for (const y of [-0.32, -0.04, 0.23]) {
    const half = Math.sqrt(Math.max(0.1, 1 - (y / 0.84) ** 2)) * 0.31;
    tube([[-half, y, 0.538], [0, y - 0.018, 0.553], [half, y, 0.538]], 0.007, new THREE.MeshStandardMaterial({ color: 0xe2cda7, roughness: 0.92 }), body, 12, 6);
  }

  // Graduated golden dragon spine plates along the back
  const spineSpecs = [
    [0, 0.52, -0.44, 0.065, 0.1],
    [0, 0.22, -0.5, 0.08, 0.13],
    [0, -0.06, -0.53, 0.09, 0.14],
    [0, -0.32, -0.5, 0.08, 0.12],
    [0, -0.56, -0.44, 0.065, 0.09],
  ];
  for (const [sx, sy, sz, radius, height] of spineSpecs) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), spineMat);
    spine.position.set(sx, sy, sz);
    spine.rotation.x = -Math.PI / 2.2;
    spine.rotation.y = Math.PI / 4;
    body.add(spine);
    parts.spines.push(spine);
  }

  const head = new THREE.Group(); head.position.set(0, 0.66, 0.02); root.add(head); parts.head = head;
  // Deformed UV sphere blends forehead, cheeks and short muzzle into one smooth head shell.
  const headGeometry = new THREE.SphereGeometry(1, 80, 56);
  const hp = headGeometry.attributes.position;
  for (let i = 0; i < hp.count; i += 1) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const cheek = 1 + 0.085 * Math.exp(-(((Math.abs(x) - 0.55) / 0.25) ** 2) - (((y + 0.2) / 0.28) ** 2));
    x *= 0.79 * cheek;
    y *= 0.69 * (1 + 0.06 * smooth(-0.7, 0.35, y));
    z *= 0.61;
    const muzzle = Math.exp(-((x / 0.34) ** 2) - (((y + 0.2) / 0.22) ** 2));
    if (z > 0) z += 0.22 * muzzle * smooth(0, 0.3, z);
    hp.setXYZ(i, x, y, z);
  }
  const headColors = [];
  for (let i = 0; i < hp.count; i += 1) {
    const y = hp.getY(i), z = hp.getZ(i);
    const variation = 0.98 + 0.018 * Math.sin(y * 25 + z * 18) + 0.012 * Math.cos(y * 34 - z * 9);
    headColors.push(0.73 * variation, 0.94 * variation, 0.79 * variation);
  }
  headGeometry.setAttribute("color", new THREE.Float32BufferAttribute(headColors, 3));
  headGeometry.computeVertexNormals();
  const headMesh = new THREE.Mesh(headGeometry, headSkin); headMesh.name = "sculpted-head-and-muzzle"; head.add(headMesh);

  // Soft brows, small horns and lively dragon ear fins preserve Bondhu's friendly silhouette.
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.17, 5, 12), belly);
    horn.position.set(side * 0.43, 0.56, -0.04); horn.rotation.z = -side * 0.32; head.add(horn);
    const brow = tube([[side * 0.15, 0.34, 0.62], [side * 0.29, 0.4, 0.59], [side * 0.43, 0.35, 0.53]], 0.032, greenDeep, head, 14, 7);
    brow.name = "expressive-brow";
    ball(blushMat, [0.1, 0.038, 0.015], [side * 0.51, -0.23, 0.46], head);
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
    const eye = new THREE.Group(); eye.position.set(side * 0.285, 0.105, 0.53); head.add(eye);
    ball(sclera, [0.19, 0.22, 0.12], [0, 0, 0], eye, "eye-white");
    const gaze = new THREE.Group(); eye.add(gaze);
    ball(iris, [0.093, 0.124, 0.055], [0.014, -0.006, 0.104], gaze, "iris");
    ball(pupil, [0.053, 0.084, 0.036], [0.018, -0.01, 0.145], gaze, "pupil");
    ball(shine, [0.03, 0.036, 0.018], [-0.006, 0.04, 0.174], gaze, "eye-highlight");
    ball(shine, [0.015, 0.018, 0.01], [0.028, -0.032, 0.165], gaze, "eye-highlight-secondary");
    // A curved upper shell sweeps down over the sclera during a true eyelid blink.
    const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2), greenLight);
    lid.scale.set(0.196, 0.226, 0.13); lid.rotation.z = Math.PI; lid.position.set(0, 0.224, 0.015); lid.name = "upper-eyelid"; eye.add(lid);
    parts.eyes.push(eye); parts.lids.push(lid); parts.gaze.push(gaze);
  }
  // A shallow smile and inset mouth sit on the muzzle's front surface.
  tube([[-0.15, -0.37, 0.69], [0, -0.425, 0.72], [0.15, -0.37, 0.69]], 0.014, greenDeep, head, 18, 7);
  parts.mouth = ball(mouthMat, [0.092, 0.008, 0.018], [0, -0.405, 0.714], head, "talking-mouth");

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
    const leg = new THREE.Group(); leg.position.set(side * 0.32, -0.92, 0.02); root.add(leg);
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
  const membrane = new THREE.MeshStandardMaterial({ color: 0x78bd84, roughness: 0.78, side: THREE.DoubleSide });
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x327d55, roughness: 0.84 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.position.set(side * 0.54, 0.13, -0.16); wing.scale.x = side; root.add(wing);
    const surface = new THREE.Mesh(wingGeometry, membrane); wing.add(surface);
    tube([[0, 0.01, 0.06], [0.13, 0.2, 0.06], [0.4, 0.61, 0.06]], 0.018, ribMaterial, wing, 20, 7);
    tube([[0, 0.01, 0.06], [0.33, 0.2, 0.06], [0.61, 0.34, 0.06]], 0.013, ribMaterial, wing, 16, 7);
    tube([[0, 0.01, 0.06], [0.35, 0.08, 0.06], [0.49, 0.08, 0.06]], 0.011, ribMaterial, wing, 12, 6);
    parts.wings.push(wing);
  }

  // Tapered, curved tube geometry produces a flexible tail with a softly pointed leaf tip.
  const tail = new THREE.Group(); tail.position.set(0.24, -0.47, -0.12); root.add(tail);
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
  const tipShape = new THREE.SphereGeometry(1, 28, 20); const tip = new THREE.Mesh(tipShape, greenLight);
  tip.scale.set(0.13, 0.19, 0.09); tip.position.set(0.82, 0.35, 0.18); tip.rotation.z = -0.4; tail.add(tip); parts.tail = tail;

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 40), new THREE.MeshBasicMaterial({ color: 0x575b54, transparent: true, opacity: 0.045, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -1.29, -0.15); shadow.scale.set(1.2, 0.4, 1); root.add(shadow);
  return { root, parts };
}
