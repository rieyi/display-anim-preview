/** Run via Blockbench MCP only in a user-confirmed workspace test copy.
 * Requires the bundled first-person-panel module as dapFpTestModule and the
 * temporary renderer probe described in the acceptance record.
 */
(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const probe = window.dapFpProbe;
  const panel = Panels.display_anim_first_person;
  const startTime = Timeline.time;
  const startAnimation = Animation.selected;
  const selection = Outliner.selected.map(e => e.uuid).join();
  const cameraBefore = Preview.selected.camera.matrixWorld.toArray().join();
  const baseBefore = DisplayMode.display_base.clone(false);
  const slotBefore = DisplayMode.display_slot;
  const results = {};
  const keyData = () => JSON.stringify(Animation.all.map(a => ({uuid:a.uuid,frames:Object.values(a.animators).flatMap(b=>b.keyframes||[]).map(k=>k.getUndoCopy())})));
  try {
    const fixture = {rotation:[23,-41,17],translation:[4,-2,7],scale:[0,1.4,0.7],mirror:[true,false,true],rotation_pivot:[0.25,-0.5,0.1],scale_pivot:[-0.2,0.3,0.5]};
    for (const side of ['right','left']) {
      const copy = new THREE.Object3D();
      dapFpTestModule.applyFirstPersonDisplay(copy,fixture,side);
      copy.updateMatrix();
      DisplayMode.display_slot = `firstperson_${side}hand`;
      DisplayMode.updateDisplayBase(fixture);
      DisplayMode.display_base.updateMatrix();
      assert(copy.matrix.elements.every((v,i)=>Math.abs(v-DisplayMode.display_base.matrix.elements[i])<1e-10),`${side} native transform mismatch`);
    }
    results.nativePivotMirrorZeroScale = true;
  } finally {
    DisplayMode.display_slot = slotBefore;
    DisplayMode.display_base.position.copy(baseBefore.position);
    DisplayMode.display_base.rotation.copy(baseBefore.rotation);
    DisplayMode.display_base.scale.copy(baseBefore.scale);
    DisplayMode.display_base.updateMatrixWorld(true);
  }
  try {
    await settle();
    const seek = async time => { Timeline.setTime(time); Animator.preview(); await settle(); return probe.renderer.domElement.toDataURL(); };
    const first = await seek(0);
    const second = await seek(1.5);
    assert(first !== second,'scrubbing did not change the preview');
    results.scrub = true;
    const select = panel.node.querySelector('select');
    select.value = 'left'; select.onchange(); await settle();
    assert(second !== probe.renderer.domElement.toDataURL(),'left/right did not change the preview');
    assert(Modes.selected.id==='animate' && Timeline.time===1.5,'side picker changed mode or time');
    select.value = 'right'; select.onchange();
    results.sidePicker = true;
    const beforePlay = Timeline.time;
    Timeline.start();
    await new Promise(resolve=>setTimeout(resolve,250));
    Timeline.pause(); await settle();
    assert(Timeline.time>beforePlay,'official playback did not advance');
    const paused = probe.renderer.domElement.toDataURL();
    await settle();
    assert(paused===probe.renderer.domElement.toDataURL(),'paused preview kept moving');
    results.playPause = true;
    panel.fold(true); await settle();
    const frames = probe.frames; await settle();
    assert(frames===probe.frames,'folded panel kept rendering');
    panel.fold(false); await settle();
    assert(probe.frames>frames,'unfold did not resume rendering');
    results.fold = true;
    assert(Outliner.selected.map(e=>e.uuid).join()===selection,'preview changed selection');
    assert(Preview.selected.camera.matrixWorld.toArray().join()===cameraBefore,'preview changed main camera');
    assert(keyData()===window.dapFpBaseline.keys,'animation data changed');
    results.dataUnchanged = true;
    assert(probe.errors.length===0,probe.errors.join('\n'));
    results.errors = probe.errors;
    return results;
  } finally {
    Timeline.pause();
    if(Animation.selected!==startAnimation) startAnimation.select();
    Timeline.setTime(startTime); Animator.preview();
    panel.fold(false);
  }
})()
