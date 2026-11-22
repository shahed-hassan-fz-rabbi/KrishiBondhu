/** Build Bondhu from lightweight Three.js geometry; no external model or texture is required. */
export function createBondhuModel(THREE) {
  const root = new THREE.Group();
  root.name = "Bondhu";
  const parts = { root, eyes: [], wings: [], arms: [], mouth: null, tail: null };

  const green = new THREE.MeshPhysicalMaterial({ color: 0x329d62, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.28 });
  const greenLight = new THREE.MeshPhysicalMaterial({ color: 0x58bd73, roughness: 0.38, clearcoat: 0.35 });
  const greenDeep = new THREE.MeshStandardMaterial({ color: 0x176447, roughness: 0.48 });
  const belly = new THREE.MeshPhysicalMaterial({ color: 0xf2dfb4, roughness: 0.63, clearcoat: 0.16 });
  const bellyLight = new THREE.MeshStandardMaterial({ color: 0xffedcc, roughness: 0.62 });
  const sclera = new THREE.MeshPhysicalMaterial({ color: 0xfffdf6, roughness: 0.18, clearcoat: 0.7 });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0x316a58, roughness: 0.25, clearcoat: 0.4 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x132d29, roughness: 0.22 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x723f45, roughness: 0.7 });
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x18553d, roughness: 0.6 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xe99586, roughness: 0.75, transparent: true, opacity: 0.55 });

  const sphereGeometry = new THREE.SphereGeometry(1, 28, 20);
  const ball = (material, size, position, parent = root) => {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const tube = (points, radius, material, parent, segments = 24) => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 7, false), material);
    parent.add(mesh);
    return mesh;
  };
  const roundedHorn = (x, direction) => {
    const horn = new THREE.Group();
    horn.position.set(x, 0.55, -0.02);
    horn.rotation.z = direction * -0.22;
    head.add(horn);
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.32, 14), bellyLight);
    shaft.position.y = 0.13;
    horn.add(shaft);
    ball(bellyLight, [0.09, 0.065, 0.09], [0, 0.28, 0], horn);
  };

  // Rounded body and layered cream belly.
  const body = new THREE.Group();
  body.position.set(0, -0.28, 0);
  root.add(body);
  parts.body = body;
  ball(green, [0.68, 0.84, 0.55], [0, 0, 0], body);
  ball(belly, [0.47, 0.65, 0.115], [0, -0.06, 0.505], body);
  for (const y of [-0.31, -0.05, 0.2]) {
    tube([[-0.31, y, 0.568], [0, y - 0.025, 0.615], [0.31, y, 0.568]], 0.012, bellyLight, body, 12);
  }

  // A large, soft silhouette with a small muzzle.
  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.02);
  root.add(head);
  parts.head = head;
  ball(green, [0.82, 0.74, 0.64], [0, 0, 0], head);
  ball(greenLight, [0.34, 0.25, 0.29], [0, -0.23, 0.57], head);
  for (const direction of [-1, 1]) {
    ball(nostrilMat, [0.033, 0.027, 0.018], [direction * 0.12, -0.19, 0.825], head);
    ball(blushMat, [0.105, 0.052, 0.025], [direction * 0.5, -0.23, 0.49], head);
    roundedHorn(direction * 0.43, direction);
  }
  // Eye groups blink as one soft lid; pupils and highlights follow the same motion.
  for (const direction of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(direction * 0.285, 0.105, 0.545);
    head.add(eye);
    ball(sclera, [0.205, 0.245, 0.125], [0, 0, 0], eye);
    ball(iris, [0.097, 0.132, 0.058], [0.018, -0.008, 0.108], eye);
    ball(pupil, [0.056, 0.091, 0.039], [0.022, -0.012, 0.153], eye);
    ball(shine, [0.035, 0.043, 0.02], [-0.005, 0.045, 0.184], eye);
    parts.eyes.push(eye);
  }
  // Curved smile and an unobtrusive mouth that opens only while Bondhu is talking.
  tube([[-0.15, -0.39, 0.64], [0, -0.47, 0.71], [0.15, -0.39, 0.64]], 0.018, greenDeep, head, 16);
  const mouth = ball(mouthMat, [0.105, 0.012, 0.025], [0, -0.41, 0.68], head);
  parts.mouth = mouth;

  // Small rounded shoulder arms and feet.
  for (const direction of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(direction * 0.57, -0.27, 0.03);
    root.add(arm);
    const sleeve = ball(green, [0.145, 0.34, 0.14], [direction * 0.08, -0.13, 0], arm);
    sleeve.rotation.z = direction * -0.38;
    ball(greenLight, [0.135, 0.13, 0.13], [direction * 0.19, -0.37, 0.05], arm);
    parts.arms.push(arm);

    const leg = new THREE.Group();
    leg.position.set(direction * 0.32, -0.91, 0.02);
    root.add(leg);
    const shin = ball(greenDeep, [0.135, 0.25, 0.14], [0, -0.08, 0], leg);
    shin.rotation.z = direction * 0.05;
    ball(green, [0.21, 0.13, 0.22], [direction * 0.035, -0.27, 0.08], leg);
  }

  // Rounded, scalloped wings with visible support ribs; mirrored from one original shape.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(-0.12, 0.22, -0.15, 0.52, -0.42, 0.57);
  wingShape.bezierCurveTo(-0.33, 0.39, -0.54, 0.42, -0.59, 0.29);
  wingShape.bezierCurveTo(-0.43, 0.24, -0.51, 0.1, -0.42, 0.02);
  wingShape.bezierCurveTo(-0.29, 0.13, -0.21, -0.08, -0.1, -0.12);
  wingShape.quadraticCurveTo(-0.04, -0.02, 0, 0);
  const wingGeometry = new THREE.ShapeGeometry(wingShape, 16);
  const membrane = new THREE.MeshStandardMaterial({ color: 0x76d08b, roughness: 0.5, side: THREE.DoubleSide });
  for (const direction of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(direction * 0.54, 0.14, -0.35);
    wing.scale.x = direction;
    root.add(wing);
    const surface = new THREE.Mesh(wingGeometry, membrane);
    surface.position.z = -0.025;
    wing.add(surface);
    const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x287f55, roughness: 0.5 });
    tube([[0, 0, 0.015], [-0.1, 0.18, 0.015], [-0.42, 0.57, 0.015]], 0.022, ribMaterial, wing, 12);
    tube([[0, 0, 0.02], [-0.32, 0.17, 0.02], [-0.59, 0.29, 0.02]], 0.014, ribMaterial, wing, 10);
    tube([[0, 0, 0.02], [-0.28, -0.05, 0.02], [-0.42, 0.02, 0.02]], 0.014, ribMaterial, wing, 10);
    parts.wings.push(wing);
  }

  // Flexible curved tail, with a rounded leaf-shaped tip.
  const tail = new THREE.Group();
  tail.position.set(0.02, -0.46, -0.36);
  root.add(tail);
  tube([[0, 0, 0], [0.28, -0.12, -0.12], [0.59, 0.02, -0.25], [0.78, 0.31, -0.3]], 0.12, green, tail, 24);
  ball(greenLight, [0.14, 0.16, 0.12], [0.78, 0.31, -0.3], tail);
  parts.tail = tail;

  // Grounding shadow adds depth without real-time shadow-map cost.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 28), new THREE.MeshBasicMaterial({ color: 0x174b34, transparent: true, opacity: 0.13 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -1.27, -0.15);
  shadow.scale.set(1.25, 0.42, 1);
  root.add(shadow);

  return { root, parts };
}
