import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const entry = `
  import {
    FORMAT_COORDINATE_OPTIONS,
    FORMAT_ID,
    JAVA_MODEL_COMPATIBILITY_OPTIONS,
    registerModelFormat,
    unregisterModelFormat,
  } from ${JSON.stringify(
    fileURLToPath(new URL("../src/format.ts", import.meta.url))
  )};
  import { resolveJavaBlockCodec } from ${JSON.stringify(
    fileURLToPath(new URL("../src/java-block-codec.ts", import.meta.url))
  )};

  if (FORMAT_COORDINATE_OPTIONS.centered_grid !== false) {
    throw new Error("the plugin format must use the Minecraft non-centered grid");
  }

  const expectedJavaCompatibility = {
    render_sides: "front",
    model_identifier: false,
    parent_model_id: true,
    vertex_color_ambient_occlusion: true,
    uv_rotation: true,
    java_cube_shading_properties: true,
    java_face_properties: true,
    cullfaces: true,
    animated_textures: true,
    select_texture_for_particles: true,
    texture_mcmeta: true,
    texture_folder: true,
    animation_controllers: true,
    animation_files: true,
  };
  for (const [key, value] of Object.entries(expectedJavaCompatibility)) {
    if (JAVA_MODEL_COMPATIBILITY_OPTIONS[key] !== value) {
      throw new Error(\`Java compatibility option \${key} is not aligned\`);
    }
  }

  globalThis.Codecs = {
    java_block: { id: "java_block_codec", compile() { return "{}"; } }
  };
  globalThis.Formats = { java_block: { codec: globalThis.Codecs.java_block } };
  globalThis.ModelProject = { all: [] };
  globalThis.Project = null;
  globalThis.Canvas = { updateAll() {} };
  const translations = {};
  globalThis.Language = {
    addTranslations(language, values) {
      translations[language] = values;
    },
  };
  globalThis.tl = (key) => translations.en?.[key] ?? key;
  const { registerTranslations } = await import(${JSON.stringify(
    fileURLToPath(new URL("../src/i18n.ts", import.meta.url))
  )});
  registerTranslations();
  globalThis.ModelFormat = class {
    constructor(id, options) {
      Object.assign(this, options, { id });
      globalThis.Formats[id] = this;
    }

    delete() {
      if (globalThis.Formats[this.id] === this) {
        delete globalThis.Formats[this.id];
      }
    }
  };

  registerModelFormat();
  const owned = globalThis.Formats[FORMAT_ID];
  if (!owned || owned.centered_grid !== false || owned.codec !== globalThis.Codecs.java_block) {
    throw new Error("standalone format registration failed");
  }
  for (const [key, value] of Object.entries(expectedJavaCompatibility)) {
    if (owned[key] !== value) {
      throw new Error(\`registered format lost Java compatibility option \${key}\`);
    }
  }
  if (owned.bone_rig !== true || owned.animation_mode !== true || owned.display_mode !== true) {
    throw new Error("JDA animation capabilities were not preserved");
  }
  unregisterModelFormat();
  if (globalThis.Formats[FORMAT_ID]) {
    throw new Error("owned format was not removed during unload");
  }

  let externalDeletes = 0;
  const external = {
    name: "External Format",
    delete() {
      externalDeletes += 1;
    },
  };
  globalThis.Formats.external_sequence_format = external;
  registerModelFormat();
  if (!globalThis.Formats[FORMAT_ID]) {
    throw new Error("independent format was not registered during coexistence");
  }
  unregisterModelFormat();
  if (globalThis.Formats.external_sequence_format !== external || externalDeletes !== 0) {
    throw new Error("external format was removed during unload");
  }
  if (external.name !== "External Format") {
    throw new Error("external format name was not restored during unload");
  }

  const staleFormat = { id: FORMAT_ID };
  const staleProject = { format: staleFormat, saved: false };
  globalThis.ModelProject.all = [staleProject];
  globalThis.Project = staleProject;
  let canvasUpdates = 0;
  globalThis.Canvas.updateAll = () => { canvasUpdates += 1; };
  globalThis.ModelFormat.prototype.select = function() {
    globalThis.Format = this;
  };
  registerModelFormat();
  if (
    staleProject.format !== globalThis.Formats[FORMAT_ID] ||
    globalThis.Format !== globalThis.Formats[FORMAT_ID] ||
    canvasUpdates !== 1 ||
    staleProject.saved !== false
  ) {
    throw new Error("open JDA projects were not safely rebound after plugin reload");
  }
  unregisterModelFormat();

  const retainedBuiltInCodec = globalThis.Formats.java_block.codec;
  globalThis.Format = { id: "legacy_sequence", codec: null };
  delete globalThis.Codecs.java_block;
  if (resolveJavaBlockCodec() !== retainedBuiltInCodec) {
    throw new Error("legacy-format fallback did not use the retained built-in Java codec");
  }

  // Regression: Blockbench rebinds the live JDA format's codec to Codecs.project at
  // runtime; that compiler serializes the whole bbmodel project (Texture objects
  // instead of "#ref" strings) and crashed exports with "value.startsWith is not a
  // function". A compiling live-format codec must be ignored in favor of the real
  // Java block compiler registered on the java_block format.
  globalThis.Format = { id: FORMAT_ID, codec: { compile() { return "{}"; } } };
  if (resolveJavaBlockCodec() !== retainedBuiltInCodec) {
    throw new Error("the live format codec (Codecs.project) must never be used as the Java compiler");
  }

  process.stdout.write(JSON.stringify({
    ...FORMAT_COORDINATE_OPTIONS,
    javaModelCompatibility: true,
    frontSideRendering: true,
    openProjectRebind: true,
    standalone: true,
    coexistence: true,
    legacyCodecFallback: true,
    liveFormatCodecIgnored: true,
  }));
`;

await importTestBundle(entry, { sourcefile: "format-test.ts" });
