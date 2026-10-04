/** Preflights and transactionally writes project-scoped JSB modules into pack folders. */

import type { PackFile } from "./resource-pack";
import { EXPORT_NAMESPACE } from "./export-layout";
import { HAND_SHADER_PATHS } from "./hand-rendering";
import { tr } from "./i18n";

const SHARED_TAGS = new Set([
  "data/minecraft/tags/function/load.json",
  "data/minecraft/tags/function/tick.json",
]);

export interface WriteTarget {
  scopeRoot: string;
  root: string;
  kind: "resource" | "datapack";
  projectName: string;
  insert: boolean;
  files: PackFile[];
}

export interface WritePreview {
  added: number;
  updated: number;
  removed: number;
  merged: number;
  conflicts: string[];
  targets: Array<{
    root: string;
    added: number;
    updated: number;
    removed: number;
    merged: number;
  }>;
}

interface ProjectManifestEntry {
  kind: "resource" | "datapack";
  files: string[];
}

interface PackManifest {
  version: 1;
  projects: Record<string, ProjectManifestEntry>;
}

interface PreparedTarget {
  target: WriteTarget;
  fs: NodeFs;
  path: NodePath;
  manifestPath: string;
  desired: Map<string, PackFile>;
  owned: Set<string>;
  stale: string[];
  preview: WritePreview["targets"][number];
  conflicts: string[];
}

function getScopedFs(scopeRoot: string): NodeFs {
  const fs = requireNativeModule("fs", {
    scope: scopeRoot,
    message: tr("dap.permission.export"),
    show_permission_dialog: true,
  }) as NodeFs | undefined;
  if (!fs) throw new Error(tr("dap.error.write_permission"));
  return fs;
}

function getPathModule(): NodePath {
  return requireNativeModule("path") as NodePath;
}

function manifestRelativePath(kind: WriteTarget["kind"]): string {
  return kind === "resource" ? "assets.jsbmeta" : "data.jsbmeta";
}

function isSafeRelativePath(relativePath: string): boolean {
  return (
    Boolean(relativePath) &&
    !relativePath.startsWith("/") &&
    !relativePath.includes("\\") &&
    !relativePath.includes("\0") &&
    !relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..")
  );
}

function isOwnedProjectPath(path: string, project: string): boolean {
  const ns = EXPORT_NAMESPACE;
  return (
    path === `assets/${ns}/items/${project}.json` ||
    path.startsWith(`assets/${ns}/models/${project}/`) ||
    path.startsWith(`assets/${ns}/textures/item/${project}/`) ||
    path.startsWith(`data/${ns}/function/${project}/`) ||
    path.startsWith(`data/${ns}/item_modifier/${project}/`) ||
    path.startsWith(`data/${ns}/loot_table/${project}/`)
  );
}

function isManagedProjectPath(path: string, project: string, kind: WriteTarget["kind"]): boolean {
  return isOwnedProjectPath(path, project) || (kind === "resource" && HAND_SHADER_PATHS.has(path));
}

function validateGeneratedPath(path: string, target: WriteTarget): void {
  if (!isSafeRelativePath(path)) {
    throw new Error(tr("dap.error.unsafe_path", { path }));
  }
  if (
    path !== "pack.mcmeta" &&
    !SHARED_TAGS.has(path) &&
    !isManagedProjectPath(path, target.projectName, target.kind)
  ) {
    throw new Error(tr("dap.error.unsafe_path", { path }));
  }
}

function readManifest(
  fs: NodeFs,
  pathModule: NodePath,
  target: WriteTarget
): PackManifest {
  const fullPath = pathModule.join(target.root, manifestRelativePath(target.kind));
  if (!fs.existsSync(fullPath)) return { version: 1, projects: {} };
  let value: Partial<PackManifest>;
  try {
    value = JSON.parse(fs.readFileSync(fullPath, "utf8")) as Partial<PackManifest>;
  } catch (error) {
    throw new Error(tr("dap.error.manifest_invalid", { path: fullPath }));
  }
  if (
    value.version !== 1 ||
    !value.projects ||
    typeof value.projects !== "object"
  ) {
    throw new Error(tr("dap.error.manifest_invalid", { path: fullPath }));
  }
  for (const [project, entry] of Object.entries(value.projects)) {
    if (!entry || (entry.kind !== "resource" && entry.kind !== "datapack") ||
      !Array.isArray(entry.files) || entry.files.some((path) => typeof path !== "string" || !isManagedProjectPath(path, project, entry.kind))) {
      throw new Error(tr("dap.error.manifest_invalid", { path: fullPath }));
    }
  }
  return value as PackManifest;
}

function validateExistingPack(fs: NodeFs, pathModule: NodePath, target: WriteTarget): void {
  const packPath = pathModule.join(target.root, "pack.mcmeta");
  if (!target.insert) return;
  if (!fs.existsSync(packPath)) {
    throw new Error(tr("dap.error.invalid_pack", { path: target.root }));
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packPath, "utf8")) as { pack?: unknown };
    if (!parsed || typeof parsed.pack !== "object") throw new Error("missing pack object");
  } catch (error) {
    throw new Error(tr("dap.error.invalid_pack", { path: target.root }));
  }
}

function mergeFunctionTag(existing: string | null, generated: string, path: string): string {
  let generatedValue: unknown;
  try {
    const parsed = JSON.parse(generated) as { values?: unknown[] };
    generatedValue = parsed.values?.[0];
    if (typeof generatedValue !== "string") throw new Error("missing generated value");
  } catch (error) {
    throw new Error(tr("dap.error.shared_tag_invalid", { path }));
  }
  if (!existing) return `${JSON.stringify({ values: [generatedValue] }, null, 2)}\n`;

  try {
    const parsed = JSON.parse(existing) as { replace?: boolean; values?: unknown[] };
    if (!Array.isArray(parsed.values)) throw new Error("missing values");
    if (!parsed.values.some((value) => value === generatedValue)) parsed.values.push(generatedValue);
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch (error) {
    throw new Error(tr("dap.error.shared_tag_invalid", { path }));
  }
}

function prepareTarget(target: WriteTarget, fs: NodeFs, pathModule: NodePath): PreparedTarget {
  for (const file of target.files) validateGeneratedPath(file.path, target);
  validateExistingPack(fs, pathModule, target);
  const manifest = readManifest(fs, pathModule, target);
  const previousEntry = manifest.projects[target.projectName];
  if (previousEntry && previousEntry.kind !== target.kind) {
    throw new Error(tr("dap.error.manifest_invalid", { path: pathModule.join(target.root, manifestRelativePath(target.kind)) }));
  }
  const owned = new Set(previousEntry?.files ?? []);
  const desired = new Map<string, PackFile>();
  let merged = 0;

  for (const file of target.files) {
    if (file.path === "pack.mcmeta") {
      const fullPath = pathModule.join(target.root, file.path);
      if (target.insert) continue;
      if (fs.existsSync(fullPath)) continue;
    }
    if (SHARED_TAGS.has(file.path)) {
      const fullPath = pathModule.join(target.root, file.path);
      const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : null;
      const content = mergeFunctionTag(existing, file.content, file.path);
      desired.set(file.path, { ...file, content });
      if (existing !== content) merged++;
      continue;
    }
    desired.set(file.path, file);
  }

  const currentOwned = new Set(
    [...desired.keys()].filter((path) => isManagedProjectPath(path, target.projectName, target.kind))
  );
  const sharedOwnedByAnotherProject = (path: string): boolean => Object.entries(manifest.projects)
    .some(([project, entry]) =>
      project !== target.projectName && entry.kind === "resource" && entry.files.includes(path)
    );
  const stale = [...owned].filter((path) =>
    !currentOwned.has(path) && (!HAND_SHADER_PATHS.has(path) || !sharedOwnedByAnotherProject(path))
  );
  const conflicts: string[] = [];
  for (const relativePath of currentOwned) {
    const fullPath = pathModule.join(target.root, relativePath);
    if (fs.existsSync(fullPath) && !owned.has(relativePath)) {
      const generated = desired.get(relativePath);
      const identicalSharedShader = HAND_SHADER_PATHS.has(relativePath) && generated &&
        fs.readFileSync(fullPath, "utf8") === generated.content;
      if (!identicalSharedShader) conflicts.push(fullPath);
    }
  }
  for (const relativePath of stale) {
    if (!isManagedProjectPath(relativePath, target.projectName, target.kind)) {
      throw new Error(tr("dap.error.unsafe_path", { path: relativePath }));
    }
  }

  const manifestPath = pathModule.join(target.root, manifestRelativePath(target.kind));
  const nextProjects = { ...manifest.projects, [target.projectName]: { kind: target.kind, files: [...currentOwned].sort() } };
  desired.set(manifestRelativePath(target.kind), {
    path: manifestRelativePath(target.kind),
    content: `${JSON.stringify(
      {
        version: 1,
        projects: nextProjects,
      } satisfies PackManifest,
      null,
      2
    )}\n`,
  });

  let added = 0;
  let updated = 0;
  for (const relativePath of desired.keys()) {
    if (SHARED_TAGS.has(relativePath)) continue;
    if (fs.existsSync(pathModule.join(target.root, relativePath))) updated++;
    else added++;
  }

  return {
    target,
    fs,
    path: pathModule,
    manifestPath,
    desired,
    owned,
    stale,
    preview: { root: target.root, added, updated, removed: stale.length, merged },
    conflicts,
  };
}

function prepareTargets(targets: WriteTarget[]): PreparedTarget[] {
  const roots = new Set<string>();
  const filesystems = new Map<string, NodeFs>();
  const pathModule = getPathModule();
  return targets.map((target) => {
    if (roots.has(target.root)) {
      throw new Error(tr("dap.error.duplicate_target", { path: target.root }));
    }
    roots.add(target.root);
    let fs = filesystems.get(target.scopeRoot);
    if (!fs) {
      fs = getScopedFs(target.scopeRoot);
      filesystems.set(target.scopeRoot, fs);
    }
    return prepareTarget(target, fs, pathModule);
  });
}

export function previewPacks(targets: WriteTarget[]): WritePreview {
  const prepared = prepareTargets(targets);
  const previews = prepared.map((entry) => entry.preview);
  return {
    added: previews.reduce((sum, value) => sum + value.added, 0),
    updated: previews.reduce((sum, value) => sum + value.updated, 0),
    removed: previews.reduce((sum, value) => sum + value.removed, 0),
    merged: previews.reduce((sum, value) => sum + value.merged, 0),
    conflicts: prepared.flatMap((entry) => entry.conflicts),
    targets: previews,
  };
}

function writeStagedFile(
  fs: NodeFs,
  pathModule: NodePath,
  stagingRoot: string,
  file: PackFile
): string {
  const staged = pathModule.join(stagingRoot, "files", file.path);
  fs.mkdirSync(pathModule.dirname(staged), { recursive: true });
  Blockbench.writeFile(staged, {
    content: file.content,
    savetype: file.isImage ? "image" : "text",
  });
  if (!fs.existsSync(staged)) throw new Error(tr("dap.error.file_not_written", { path: staged }));
  if (!file.isImage && fs.readFileSync(staged, "utf8") !== file.content) {
    throw new Error(tr("dap.error.file_verify", { path: staged }));
  }
  return staged;
}

function pruneEmptyParents(entry: PreparedTarget, relativePaths: string[]): void {
  const root = entry.target.root;
  for (const relativePath of relativePaths) {
    let directory = entry.path.dirname(entry.path.join(root, relativePath));
    while (directory !== root) {
      if (!entry.fs.existsSync(directory)) {
        directory = entry.path.dirname(directory);
        continue;
      }
      if (entry.fs.readdirSync(directory, { withFileTypes: true }).length) break;
      entry.fs.rmdirSync(directory);
      directory = entry.path.dirname(directory);
    }
  }
}

function removeTransactionRoot(entry: PreparedTarget, root: string): void {
  entry.fs.rmSync(root, { recursive: true, force: true });
  const parent = entry.path.dirname(root);
  if (entry.fs.existsSync(parent) && entry.fs.readdirSync(parent, { withFileTypes: true }).length === 0) {
    entry.fs.rmdirSync(parent);
  }
}

/** Writes every target as one transaction and restores all replaced files on failure. */
export function writePacks(targets: WriteTarget[]): number {
  const prepared = prepareTargets(targets);
  const conflicts = prepared.flatMap((entry) => entry.conflicts);
  if (conflicts.length) {
    throw new Error(tr("dap.error.path_conflicts", { paths: conflicts.join("\n") }));
  }

  const staged = new Map<PreparedTarget, { root: string; files: Map<string, string> }>();
  const mutations: Array<{
    prepared: PreparedTarget;
    finalPath: string;
    backupPath: string | null;
  }> = [];

  try {
    prepared.forEach((entry, targetIndex) => {
      const stagingRoot = entry.path.join(
        entry.target.root,
        `.jsb-transaction-${entry.target.projectName}-${Date.now()}-${targetIndex}`
      );
      const stagedFiles = new Map<string, string>();
      for (const file of entry.desired.values()) {
        stagedFiles.set(
          file.path,
          writeStagedFile(entry.fs, entry.path, stagingRoot, file)
        );
      }
      staged.set(entry, { root: stagingRoot, files: stagedFiles });
    });

    for (const entry of prepared) {
      const stagedTarget = staged.get(entry)!;
      let backupIndex = 0;
      const replaceOrRemove = [...entry.desired.keys(), ...entry.stale];
      for (const relativePath of replaceOrRemove) {
        const finalPath = entry.path.join(entry.target.root, relativePath);
        let backupPath: string | null = null;
        if (entry.fs.existsSync(finalPath)) {
          backupPath = entry.path.join(stagedTarget.root, "backups", String(backupIndex++));
          entry.fs.mkdirSync(entry.path.dirname(backupPath), { recursive: true });
          entry.fs.renameSync(finalPath, backupPath);
        }
        mutations.push({ prepared: entry, finalPath, backupPath });
        const stagedPath = stagedTarget.files.get(relativePath);
        if (stagedPath) {
          entry.fs.mkdirSync(entry.path.dirname(finalPath), { recursive: true });
          entry.fs.renameSync(stagedPath, finalPath);
        }
      }
    }
  } catch (error) {
    // Each rollback step must run even if an earlier one throws, so a single
    // locked file cannot leave the remaining targets half-restored.
    const rollbackFailures: string[] = [];
    const rollbackErrors: unknown[] = [];
    for (const mutation of [...mutations].reverse()) {
      const { fs } = mutation.prepared;
      try {
        if (fs.existsSync(mutation.finalPath)) fs.unlinkSync(mutation.finalPath);
        if (mutation.backupPath && fs.existsSync(mutation.backupPath)) {
          fs.mkdirSync(mutation.prepared.path.dirname(mutation.finalPath), { recursive: true });
          fs.renameSync(mutation.backupPath, mutation.finalPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
        rollbackFailures.push(mutation.finalPath);
      }
    }
    for (const [entry, value] of staged) {
      try {
        removeTransactionRoot(entry, value.root);
      } catch (cleanupError) {
        console.warn("Could not clean failed JSB transaction", cleanupError);
      }
    }
    if (rollbackFailures.length) {
      console.error("JSB transaction rollback could not restore some files", rollbackErrors);
      throw new Error(`${tr("dap.error.rollback_partial", { paths: rollbackFailures.join("\n") })}\n${error instanceof Error ? error.message : String(error)}`);
    }
    throw error;
  }

  for (const [entry, value] of staged) {
    try {
      removeTransactionRoot(entry, value.root);
      pruneEmptyParents(entry, entry.stale);
      const transactionRoot = entry.path.dirname(value.root);
      if (
        entry.fs.existsSync(transactionRoot) &&
        entry.fs.readdirSync(transactionRoot, { withFileTypes: true }).length === 0
      ) {
        entry.fs.rmdirSync(transactionRoot);
      }
      const legacyTransactionRoot = entry.path.join(entry.target.root, ".jsb-transactions");
      if (
        entry.fs.existsSync(legacyTransactionRoot) &&
        entry.fs.readdirSync(legacyTransactionRoot, { withFileTypes: true }).length === 0
      ) {
        entry.fs.rmdirSync(legacyTransactionRoot);
      }
    } catch (error) {
      console.warn("Could not fully clean completed JSB transaction", error);
    }
  }
  return prepared.reduce((sum, entry) => sum + entry.desired.size, 0);
}
