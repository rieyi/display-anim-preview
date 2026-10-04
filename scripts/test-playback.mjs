import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(new URL("../src/playback.ts", import.meta.url));
const entry = `
  globalThis.tl = key => key;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const previews = [];
  const events = new Map();
  const emit = name => { for (const callback of events.get(name) || []) callback(); };
  const animations = [
    { uuid: "a", name: "Reload", length: 2, playing: true, selected: true },
    { uuid: "b", name: "Fire", length: 0.5, playing: false, selected: false },
  ];
  for (const animation of animations) animation.select = function() {
    for (const item of animations) { item.selected = false; item.playing = false; }
    this.selected = true;
    this.playing = true;
    Animation.selected = this;
  };
  globalThis.Animation = { all: animations, selected: animations[0] };
  globalThis.Timeline = {
    time: 1.25, playing: true,
    setTime(value) { this.time = value; },
    start() { this.playing = true; emit("timeline_play"); },
    pause() { this.playing = false; emit("timeline_pause"); }, loop() {}, getStep() { return 0.05; },
  };
  globalThis.Animator = { preview() { previews.push({ uuid: Animation.selected.uuid, time: Timeline.time }); } };
  globalThis.Project = { saved: true, display_anim_variants: {
    firstperson_righthand: { animated: true }, gui: { animated: false },
  } };
  globalThis.DisplayMode = { display_slot: "firstperson_righthand" };
  globalThis.Modes = { selected: { id: "display" } };
  globalThis.BarItems = { looped_animation_playback: { value: false, set(value) { this.value = value; } } };
  globalThis.Blockbench = {
    showQuickMessage() {},
    on(name, callback) { const list = events.get(name) || []; list.push(callback); events.set(name, list); },
    removeListener(name, callback) { events.set(name, (events.get(name) || []).filter(item => item !== callback)); },
  };

  const playback = await import(${JSON.stringify(modulePath)});
  playback.initializePlaybackSync();
  assert(playback.isLooping() === false && BarItems.looped_animation_playback.value === false,
    "preview loop should default to disabled");
  playback.selectPreviewAnimation("b");
  assert(Animation.selected === animations[1], "preview animation was not switched");
  assert(Timeline.time === 0.05 && Timeline.playing, "animation switch did not start at the first Minecraft frame while preserving playback");
  assert(previews.at(-1).uuid === "b" && previews.at(-1).time === 0.05, "new animation pose was not rendered immediately");

  Timeline.time = 0.35;
  DisplayMode.display_slot = "gui";
  const before = previews.length;
  playback.enforceCurrentDisplayAnimationPolicy();
  assert(Timeline.playing, "disabled display context interrupted the official playback clock");
  assert(Timeline.time === 0.35, "disabled display context changed the official playback time");
  assert(previews.length === before + 1 && previews.at(-1).time === 0,
    "disabled display context did not render the fixed frame 0 pose");
  DisplayMode.display_slot = "firstperson_righthand";
  playback.enforceCurrentDisplayAnimationPolicy();
  assert(Timeline.playing && Timeline.time === 0.35 && previews.at(-1).time === 0.35,
    "returning to an animated display context did not redraw the current animation time");

  assert(playback.setPreviewFps(30) === 20, "preview FPS exceeded Minecraft's 20 FPS limit");
  assert(playback.setPreviewFps(0) === 1, "preview FPS did not clamp to one frame per second");
  playback.setPreviewFps(5);
  assert(playback.getPreviewFps() === 5, "manual preview FPS was not retained");

  // Blockbench pauses while leaving animation mode; the plugin must resume after select_mode.
  Modes.selected.id = "animate";
  Timeline.start();
  Timeline.pause();
  Modes.selected.id = "display";
  emit("select_mode");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(Timeline.playing, "animation-to-display mode switch did not resume playback");

  // Native animation loop settings must not override the panel's disabled loop state.
  DisplayMode.display_slot = "firstperson_righthand";
  playback.setLowFpsPreview(true);
  Timeline.time = 0.45;
  emit("display_animation_frame");
  Timeline.time = 0;
  emit("display_animation_frame");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(!Timeline.playing && Timeline.time === animations[1].length,
    "low-FPS end handling changed the real timeline away from the animation end");
  assert(previews.at(-1).time === 0.4,
    "low-FPS end handling did not render the final valid sampled pose");
  Timeline.start();
  assert(Timeline.playing && Math.abs(Timeline.time - 0.2) < 1e-8,
    "replaying a finished non-looping animation did not restart from its first Minecraft frame");
  Timeline.pause();
  playback.setLooping(true);
  Timeline.start();
  Timeline.time = 0.45;
  emit("display_animation_frame");
  Timeline.time = 0;
  emit("display_animation_frame");
  assert(Timeline.playing && Math.abs(Timeline.time - 0.2) < 1e-8,
    "enabled preview loop exposed the static frame instead of restarting at the first motion frame");

  Timeline.playing = false;
  playback.enforceCurrentDisplayAnimationPolicy();
  playback.disposePlaybackSync();
  process.stdout.write(JSON.stringify({ switched: Animation.selected.name, time: Timeline.time, fps: playback.getPreviewFps() }));
`;

await importTestBundle(entry, { sourcefile: "playback-test.ts", define: { __DAP_FORCE_LANGUAGE__: "null" } });
