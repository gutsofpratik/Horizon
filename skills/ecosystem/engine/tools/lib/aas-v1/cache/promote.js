"use strict";

// .local/upstream-skill-review/.core-build/6e4106fb38458d2bb2bf50b53db74031daabc208/tools/lib/aas-v1/cache/promote.js
var crypto = require("node:crypto");
var fsp = require("node:fs/promises");
var path = require("node:path");
var { fsyncDirectoryAsync } = require("../durability");
var { canonicalJson } = require("../canonical-json");
var {
  CATALOG_IDENTITY_FILE,
  DIGEST_VERSION,
  cacheError,
  catalogCachePath,
  validateCacheRoot,
  validateCatalogIdentity
} = require("./identity");
var { scanDataDirectory } = require("./scan");
var { catalogStatus } = require("./status");
async function fsyncDirectory(directoryPath) {
  await fsyncDirectoryAsync(directoryPath);
}
async function writeFileCrashSafe(filePath, bytes) {
  const handle = await fsp.open(filePath, "wx", 384);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function ensureRealDirectory(directoryPath, created) {
  try {
    const stat = await fsp.lstat(directoryPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw cacheError("AAS_CACHE_DIRECTORY_UNSAFE", `cache path is not a real directory: ${directoryPath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(directoryPath);
    if (parent !== directoryPath) await ensureRealDirectory(parent, created);
    try {
      await fsp.mkdir(directoryPath, { mode: 448 });
      created.push(directoryPath);
    } catch (mkdirError) {
      if (mkdirError.code !== "EEXIST") throw mkdirError;
      const stat = await fsp.lstat(directoryPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw cacheError("AAS_CACHE_DIRECTORY_UNSAFE", `cache path is not a real directory: ${directoryPath}`);
    }
  }
}
async function removeCreatedEmptyDirectories(created) {
  for (const directoryPath of [...created].reverse()) {
    try {
      await fsp.rmdir(directoryPath);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
    }
  }
}
async function promoteCatalogDirectory({ cacheRoot, sourceDir, allowlist, controlPaths = [], identity, limits }) {
  const scan = await scanDataDirectory({ sourceDir, allowlist, ignoredPaths: controlPaths, limits });
  const normalizedIdentity = validateCatalogIdentity(identity);
  if (normalizedIdentity.catalogDigest !== scan.catalogDigest) {
    throw cacheError("AAS_CACHE_CATALOG_DIGEST_MISMATCH", "catalog content does not match the approved catalog digest");
  }
  const existing = await catalogStatus({
    cacheRoot,
    packageVersion: normalizedIdentity.version,
    catalogDigest: normalizedIdentity.catalogDigest,
    integrity: normalizedIdentity.integrity
  });
  if (existing.status === "verified") return { status: "alreadyPresent", identity: existing.identity, targetPath: existing.targetPath };
  if (existing.status === "invalid") throw cacheError("AAS_CACHE_EXISTING_INVALID", "an invalid object already occupies the immutable catalog cache key");
  const root = validateCacheRoot(cacheRoot);
  const targetPath = catalogCachePath({
    cacheRoot: root,
    packageVersion: normalizedIdentity.version,
    catalogDigest: normalizedIdentity.catalogDigest
  });
  const versionDirectory = path.dirname(targetPath);
  const created = [];
  let stagePath;
  let promoted = false;
  try {
    await ensureRealDirectory(versionDirectory, created);
    stagePath = path.join(versionDirectory, `.stage-${process.pid}-${crypto.randomBytes(12).toString("hex")}`);
    await fsp.mkdir(stagePath, { mode: 448 });
    const madeDirectories = /* @__PURE__ */ new Set([stagePath]);
    for (const record of [...scan.records, ...scan.ignoredRecords]) {
      const segments = record.path.split("/");
      const outputPath = path.join(stagePath, ...segments);
      let cursor = stagePath;
      for (const segment of segments.slice(0, -1)) {
        cursor = path.join(cursor, segment);
        if (!madeDirectories.has(cursor)) {
          await fsp.mkdir(cursor, { mode: 448 });
          madeDirectories.add(cursor);
        }
      }
      await writeFileCrashSafe(outputPath, record.bytes);
    }
    const storedIdentity = {
      ...normalizedIdentity,
      digestVersion: DIGEST_VERSION,
      assets: scan.publicRecords,
      controls: scan.publicIgnoredRecords
    };
    await writeFileCrashSafe(path.join(stagePath, CATALOG_IDENTITY_FILE), Buffer.from(`${canonicalJson(storedIdentity)}
`));
    for (const directoryPath of [...madeDirectories].sort((left, right) => right.length - left.length)) await fsyncDirectory(directoryPath);
    try {
      await fsp.rename(stagePath, targetPath);
      promoted = true;
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      const raced = await catalogStatus({
        cacheRoot: root,
        packageVersion: normalizedIdentity.version,
        catalogDigest: normalizedIdentity.catalogDigest,
        integrity: normalizedIdentity.integrity
      });
      if (raced.status !== "verified") throw cacheError("AAS_CACHE_PROMOTION_CONFLICT", "catalog cache key was occupied during promotion");
      return { status: "alreadyPresent", identity: raced.identity, targetPath: raced.targetPath };
    }
    await fsyncDirectory(versionDirectory);
    return { status: "promoted", identity: storedIdentity, targetPath };
  } finally {
    if (stagePath && !promoted) await fsp.rm(stagePath, { recursive: true, force: true });
    if (!promoted) await removeCreatedEmptyDirectories(created);
  }
}
module.exports = { promoteCatalogDirectory };
