import {cloneMaterials, cloneModel, enableShadows, loadGLTF, normalizeModel,} from "../core/Assets.js";
import {distanceToSegment} from "../core/MathUtils.js";
import {ARENA, SPAWN_POINTS, TREES} from "../config/tuning.js";
import {getHouseCenters} from "./Houses.js";
import {updateFade} from "./Fade.js";

const trees = [];

const templates = new Map();

async function loadTemplates() {
  const ids = [...TREES.pines, ...TREES.twisted];
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, (await loadGLTF(`/assets/${id}.glb`)).scene];
      } catch (error) {
        console.error(`Failed to load tree model ${id}.glb`, error);
        return [id, null];
      }
    }),
  );
  for (const [id, scene] of results) {
    if (scene) templates.set(id, scene);
  }
}

function plantTree(mapGroup, variantIds, heightMin, heightMax, x, y) {
  const available = variantIds.filter((id) => templates.has(id));
  if (available.length === 0) return null;

  const id = available[Math.floor(Math.random() * available.length)];
  const model = cloneModel(templates.get(id));
  const jitter =
    TREES.heightJitterMin +
    Math.random() * (TREES.heightJitterMax - TREES.heightJitterMin);
  const height = (heightMin + Math.random() * (heightMax - heightMin)) * jitter;
  const yaw = Math.random() * Math.PI * 2;

  const {groundOffset} = normalizeModel(model, {targetHeight: height, yaw});
  model.position.set(x, y, groundOffset);

  const materials = cloneMaterials(model);
  enableShadows(model);
  model.traverse((child) => {
    if (child.isMesh) child.receiveShadow = true;
  });
  mapGroup.add(model);

  trees.push({object: model, materials, opacity: 1});
  return model;
}

function randomRingPoint() {
  const halfX = ARENA.width / 2 + ARENA.wallThickness;
  const halfY = ARENA.depth / 2 + ARENA.wallThickness;
  const outerX = halfX + TREES.ringDepth;
  const outerY = halfY + TREES.ringDepth;
  const innerX = halfX + TREES.ringStart;
  const innerY = halfY + TREES.ringStart;

  const x = (Math.random() * 2 - 1) * outerX;
  const y = (Math.random() * 2 - 1) * outerY;
  if (Math.abs(x) <= innerX && Math.abs(y) <= innerY) return null;
  return {x, y};
}

function randomScatterPoint() {
  const x = (Math.random() * 2 - 1) * (ARENA.width / 2 - TREES.arenaMargin);
  const y = (Math.random() * 2 - 1) * (ARENA.depth / 2 - TREES.arenaMargin);

  if (Math.hypot(x, y) < TREES.centerClearance) return null;
  for (const house of getHouseCenters()) {
    if (Math.hypot(x - house.x, y - house.y) < TREES.houseClearance)
      return null;
  }
  for (const spawn of SPAWN_POINTS) {
    if (
      distanceToSegment(x, y, spawn.x, spawn.y, 0, 0) < TREES.spawnLaneClearance
    ) {
      return null;
    }
  }
  return {x, y};
}

function isFarFromPlaced(point, placed, minSpacing) {
  const minSq = minSpacing * minSpacing;
  for (const other of placed) {
    const dx = point.x - other.x;
    const dy = point.y - other.y;
    if (dx * dx + dy * dy < minSq) return false;
  }
  return true;
}

export async function initTrees(mapGroup) {
  await loadTemplates();

  const placed = [];

  let ringPlaced = 0;
  for (
    let attempt = 0;
    attempt < TREES.ringAttempts && ringPlaced < TREES.ringCount;
    attempt++
  ) {
    const point = randomRingPoint();
    if (!point || !isFarFromPlaced(point, placed, TREES.minSpacing)) continue;
    const tree = plantTree(
      mapGroup,
      TREES.pines,
      TREES.pineHeightMin,
      TREES.pineHeightMax,
      point.x,
      point.y,
    );
    if (!tree) break;
    placed.push(point);
    ringPlaced++;
  }

  let scatterPlaced = 0;
  for (
    let attempt = 0;
    attempt < TREES.scatterAttempts && scatterPlaced < TREES.scatterCount;
    attempt++
  ) {
    const point = randomScatterPoint();
    if (!point || !isFarFromPlaced(point, placed, TREES.scatterSpacing))
      continue;
    const tree = plantTree(
      mapGroup,
      TREES.twisted,
      TREES.twistedHeightMin,
      TREES.twistedHeightMax,
      point.x,
      point.y,
    );
    if (!tree) break;
    placed.push(point);
    scatterPlaced++;
  }
}

export function updateTreeFade(delta, playerPosition) {
  updateFade(trees, delta, playerPosition, {
    radius: TREES.fadeCheckRadius,
    lateral: TREES.fadeLateral,
    targetOpacity: TREES.fadeOpacity,
    duration: TREES.fadeDuration,
  });
}
