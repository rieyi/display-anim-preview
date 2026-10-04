import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const rigPath = fileURLToPath(new URL("../src/hand-rig.ts", import.meta.url));
const posePath = fileURLToPath(new URL("../src/hand-pose.ts", import.meta.url));
const entry = `
  globalThis.tl = key => key;
  let nextId = 1;
  class MockGroup {
    static all=[]; static properties={};
    constructor(options={}) { Object.assign(this,{uuid:"g"+nextId++,name:"group",origin:[0,0,0],children:[],parent:"root",visibility:true,export:true,selected:false},options); this.mesh={}; }
    init(){ MockGroup.all.push(this); Outliner.root.push(this); return this; }
    addTo(parent){ if(this.parent==="root") Outliner.root=Outliner.root.filter(v=>v!==this); this.parent=parent; if(parent!=="root"&&!parent.children.includes(this)) parent.children.push(this); return this; }
    forEachChild(callback){ const walk=node=>{ for(const child of node.children??[]){ callback(child); walk(child); } }; walk(this); }
    remove(){ const descendants=[]; this.forEachChild(v=>descendants.push(v)); MockGroup.all=MockGroup.all.filter(v=>v!==this&&!descendants.includes(v)); Outliner.elements=Outliner.elements.filter(v=>!descendants.includes(v)); if(this.parent!=="root") this.parent.children=this.parent.children.filter(v=>v!==this); }
  }
  class MockCube {
    static all=[]; static properties={};
    constructor(options={}) { Object.assign(this,{uuid:"c"+nextId++,name:"cube",children:[],parent:"root",visibility:true,export:true,selected:false,inflate:0,faces:Object.fromEntries(["north","east","south","west","up","down"].map(v=>[v,{uv:[],texture:null}]))},options); this.mesh={}; }
    init(){ MockCube.all.push(this); Outliner.elements.push(this); Outliner.root.push(this); return this; }
    addTo(parent){ Outliner.root=Outliner.root.filter(v=>v!==this); this.parent=parent; parent.children.push(this); return this; }
    applyTexture(){}
    remove(){ MockCube.all=MockCube.all.filter(v=>v!==this); Outliner.elements=Outliner.elements.filter(v=>v!==this); }
  }
  class MockTexture {
    static all=[];
    constructor(options={}) { Object.assign(this,{uuid:"t"+nextId++,id:String(nextId),name:"skin.png",width:64,height:64},options); }
    fromDataURL(){ return this; } add(){ if(!MockTexture.all.includes(this)) MockTexture.all.push(this); return this; }
    getActiveCanvas(){ return {getContext(){return {getImageData(){return {data:[1,1,1,255]}}}}}; }
  }
  globalThis.Group=MockGroup; globalThis.Cube=MockCube; globalThis.Texture=MockTexture;
  globalThis.Outliner={root:[],elements:[],selected:[]};
  globalThis.Project={saved:true,texture_width:16,texture_height:16};
  globalThis.Animation={all:[]}; globalThis.Canvas={updateAll(){}};
  globalThis.Undo={current_save:null,initEdit(){this.current_save={};return this.current_save},finishEdit(){this.current_save=null},cancelEdit(){this.current_save=null}};
  globalThis.Blockbench={import(){},showMessageBox(){},showQuickMessage(){}};
  globalThis.Property=class { delete(){} };
  const {ensureHandRig,resolveHandRig,setHandRigVisibility,deleteHandRig,armBoxUvOffset,armPlaceholder}=await import(${JSON.stringify(rigPath)});
  const {captureHandPose,relativeHandMatrix,animatedHandDisplay,HAND_CALIBRATION,HAND_MARKER_SCALE,handSpecialTransformation,eulerXyzMatrix}=await import(${JSON.stringify(posePath)});
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  const settings={version:7,handRenderingEnabled:true};
  const first=ensureHandRig(settings);
  assert(MockGroup.all.length===3&&MockCube.all.length===2&&MockTexture.all.length===1,"fresh rig shape is wrong");
  const ids=[...MockGroup.all,...MockCube.all].map(v=>v.uuid).join();
  const second=ensureHandRig(settings);
  assert(ids===[...MockGroup.all,...MockCube.all].map(v=>v.uuid).join(),"ensure duplicated rig elements");
  assert(first.left===second.left&&resolveHandRig(settings).right===first.right,"saved UUID lookup failed");
  assert(MockCube.all.every(v=>v.export===false),"preview cubes are entering Java model export");
  const leftSkin=MockCube.all.find(v=>v.name==="DAP_LeftArm_Skin");
  const rightSkin=MockCube.all.find(v=>v.name==="DAP_RightArm_Skin");
  assert(!MockCube.all.some(v=>v.name.includes("Sleeve")),"sleeve cubes must no longer be generated");
  // Standard placeholder is the user's integer 4x4x12 reference geometry.
  const leftStd=armPlaceholder("left"), rightStd=armPlaceholder("right");
  assert(JSON.stringify(leftSkin.from)===JSON.stringify(leftStd.from)&&JSON.stringify(leftSkin.to)===JSON.stringify(leftStd.to),
    "left arm cube does not match the 4x4x12 reference standard");
  assert(JSON.stringify(rightSkin.from)===JSON.stringify(rightStd.from)&&JSON.stringify(rightSkin.to)===JSON.stringify(rightStd.to),
    "right arm cube does not match the 4x4x12 reference standard");
  assert((rightSkin.to[0]-rightSkin.from[0])===4&&(rightSkin.to[1]-rightSkin.from[1])===4&&(rightSkin.to[2]-rightSkin.from[2])===12,
    "arm cube pixel proportions must be exactly 4x4x12");
  assert(JSON.stringify(first.left.origin)===JSON.stringify(leftStd.pivot),"left arm pivot does not sit at the rear end");
  assert(JSON.stringify(first.right.origin)===JSON.stringify(rightStd.pivot),"right arm pivot does not sit at the rear end");
  // The user's standard places the arms at (0,0,4) and (12,0,4).
  assert(JSON.stringify(leftStd.from)==="[0,0,4]"&&JSON.stringify(rightStd.from)==="[12,0,4]","arm origin position moved off the user standard");
  // Stale sleeve cubes from older rigs are removed when the rig is refreshed.
  const staleSleeve=new MockCube({name:"DAP_LeftArm_Sleeve"}).init().addTo(first.left);
  ensureHandRig(settings);
  assert(MockCube.all.includes(staleSleeve),"existing preview geometry was removed");
  staleSleeve.remove();
  settings.handRenderingEnabled=false; setHandRigVisibility(settings);
  assert(MockCube.all.every(v=>v.visibility===false),"disabled rig remained visible");
  // Preview arms use box UV with a single shared uv_offset.
  assert(MockCube.all.every(v=>v.box_uv===true),"preview arms must use box UV");
  assert(JSON.stringify(leftSkin.uv_offset)===JSON.stringify(armBoxUvOffset())&&JSON.stringify(rightSkin.uv_offset)===JSON.stringify(armBoxUvOffset()),"box UV offset is not the shared origin");
  // Bind frame must export exactly the user-calibrated display values.
  const rest=animatedHandDisplay("left");
  assert(JSON.stringify(rest.rotation)===JSON.stringify(HAND_CALIBRATION.left.rotation),"bind rotation is not the calibrated left value");
  assert(JSON.stringify(rest.translation)===JSON.stringify(HAND_CALIBRATION.left.translation),"bind translation is not the calibrated left value");
  assert(JSON.stringify(rest.scale)===JSON.stringify(HAND_MARKER_SCALE.left),"left marker scale changed");
  const restRight=animatedHandDisplay("right");
  assert(JSON.stringify(restRight.rotation)===JSON.stringify(HAND_CALIBRATION.right.rotation),"bind rotation is not the calibrated right value");
  assert(JSON.stringify(restRight.translation)===JSON.stringify(HAND_CALIBRATION.right.translation),"bind translation is not the calibrated right value");
  assert(JSON.stringify(restRight.scale)===JSON.stringify(HAND_MARKER_SCALE.right),"right marker scale changed");
  // Translation-only delta composes through the calibrated base rotation.
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const moved=[1,0,0,0,0,1,0,0,0,0,1,0,4,2,-2,1];
  const pose=relativeHandMatrix(moved,identity);
  const display=animatedHandDisplay("left",pose);
  assert(JSON.stringify(display.translation)==="[-16.3,7.5,-0.3]","arm delta was not composed onto the calibrated translation");
  // Equivalent Euler triples are acceptable: compare the resulting rotation matrix
  // (rounded, since sin(pi) leaves ~1e-16 noise in the reconstruction).
  const round=m=>JSON.stringify(m.map(v=>Math.round(v*1e6)/1e6));
  assert(round(eulerXyzMatrix(display.rotation))===round(eulerXyzMatrix(HAND_CALIBRATION.left.rotation)),
    "pure translation delta changed the rotation matrix");
  const rotatedDelta=[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1];
  const rotatedDisplay=animatedHandDisplay("right",{matrix:rotatedDelta});
  assert(round(eulerXyzMatrix(rotatedDisplay.rotation))===round(eulerXyzMatrix([180,0,-90])),"rotation delta was not composed onto the calibrated rotation");
  assert(JSON.stringify(rotatedDisplay.scale)===JSON.stringify(HAND_MARKER_SCALE.right),"rotation delta changed the shader scale marker");
  const bindRotated=[0,1,0,0,-1,0,0,0,0,0,1,0,10,20,0,1];
  const currentFromLocalMove=[0,1,0,0,-1,0,0,0,0,0,1,0,10,24,0,1];
  const localPose=relativeHandMatrix(currentFromLocalMove,bindRotated);
  assert(JSON.stringify(localPose.matrix.map(v=>Math.round(v)))===JSON.stringify([1,0,0,0,0,1,0,0,0,0,1,0,0,4,0,1]),
    "model-space matrix order is wrong for a non-origin rotated hand");
  for (const side of ["left","right"]) {
    const pivot=side==="left"?[2,2,16]:[14,2,16];
    const authored=eulerXyzMatrix([0,0,0],pivot.map((v,i)=>v+[4,2,-2][i]));
    const actual=animatedHandDisplay(side,captureHandPose(side,authored));
    assert(round(actual.translation)===round(HAND_CALIBRATION[side].translation.map((v,i)=>v+[4,2,-2][i])),"static authored placement lost");
    assert(JSON.stringify(actual.scale)===JSON.stringify(HAND_MARKER_SCALE[side]),"marker changed");
  }
  first.left.origin=[9,8,7]; leftSkin.from=[1,2,3]; leftSkin.to=[9,9,9];
  ensureHandRig(settings);
  assert(JSON.stringify(first.left.origin)==="[9,8,7]"&&JSON.stringify(leftSkin.from)==="[1,2,3]"&&JSON.stringify(leftSkin.to)==="[9,9,9]","re-enable reset authored preview");
  MockGroup.all=[]; MockCube.all=[]; Outliner.root=[]; Outliner.elements=[];
  const legacyRight=new MockGroup({name:"righthand",origin:[32,9,-7]}).init();
  const legacyCube=new MockCube({name:"original",from:[20,1,4],to:[24,5,16],origin:[32,9,-7],export:true}).init().addTo(legacyRight);
  const legacySettings={version:7,handRenderingEnabled:true};
  ensureHandRig(legacySettings); ensureHandRig(legacySettings);
  assert(legacyRight.children.length===1&&legacyRight.children[0]===legacyCube,"legacy geometry replaced or duplicated");
  assert(legacyCube.export===true&&!legacyCube.display_anim_hand_generated,"legacy cube claimed or hidden");
  assert(JSON.stringify(legacyRight.origin)==="[32,9,-7]","legacy pivot changed");
  deleteHandRig(legacySettings);
  assert(MockGroup.all.includes(legacyRight)&&MockCube.all.includes(legacyCube)&&legacyCube.export===true,"unbind deleted legacy geometry");
  const transform=handSpecialTransformation();
  assert(JSON.stringify(transform.left_rotation)==="[1,0,0,0]","reference coordinate correction missing");
  assert(JSON.stringify(transform.translation)==="[0.5,0,0.5]","reference half-block correction changed");
  process.stdout.write(JSON.stringify({groups:MockGroup.all.length,cubes:MockCube.all.length,uv:"box_uv@origin",texture:MockTexture.all[0].name,rest:rest.translation,display:display.translation}));
`;

await importTestBundle(entry, { sourcefile: "hand-rig-test.ts", define: { __DAP_FORCE_LANGUAGE__: "null" } });
