import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(new URL("../src/resource-pack.ts", import.meta.url));
const entry = `
  import { buildResourcePack } from ${JSON.stringify(modulePath)};
  globalThis.tl = key => key;
  globalThis.Texture = { all: [{ id:"0", uuid:"gun", name:"gun.png", width:16, height:16,
    javaTextureLink(){ return "item/gun"; }, getDataURL(){ return "data:image/png;base64,AA=="; } },
    { id:"1", uuid:"preview", name:"preview_skin.png", width:64, height:64, display_anim_hand_preview_texture:true,
      javaTextureLink(){ return "item/preview_skin"; }, getDataURL(){ return "data:image/png;base64,BB=="; } }] };
  const assert = (v,m) => { if(!v) throw new Error(m); };
  const same = (a,b,m) => { if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(m+JSON.stringify(a)); };
  const frame = (index,x,hands) => ({ frame:index, model:{textures:{"0":"item/gun"},elements:[{from:[x,0,0],to:[x+1,1,1],faces:{north:{texture:"#0"}}}] }, ...(hands ? {hands} : {}) });
  const a=frame(0,0), b=frame(1,1);
  const result = buildResourcePack([
    {key:"reload",sourceName:"Reload",frames:[b,a]},
    {key:"idle",sourceName:"Idle",frames:[a,b,a]}
  ], {packName:"Map Pack",projectName:"resin_gun",description:"test",defaultAnimationKey:"idle",displayContexts:[
    {context:"gui",animated:false},{context:"firstperson_righthand",animated:true},{context:"thirdperson_righthand",animated:false}
  ]});
  const paths = new Set(result.files.map(f=>f.path));
  assert(paths.has("assets/jsb/items/resin_gun.json"), "fixed jsb item path missing");
  assert(paths.has("assets/jsb/textures/item/resin_gun/gun.png"), "fixed jsb item-atlas texture path missing");
  assert(!paths.has("assets/jsb/textures/item/resin_gun/preview_skin.png"), "Blockbench-only preview skin leaked into resource pack");
  const generated = result.files.find(file => file.path === "assets/jsb/models/resin_gun/_generated/model_0.json");
  assert(generated?.content.includes("jsb:item/resin_gun/gun"), "generated model must use item-atlas texture id");
  assert(paths.has("assets/jsb/models/resin_gun/reload/fp_r/0.json"), "animated slot alias missing");
  assert(paths.has("assets/jsb/models/resin_gun/idle/fp_r/2.json"), "local frame alias missing");
  for (const forbidden of ["/gui/","/tp_r/","/fp_l/","/_static/"]) {
    assert(![...paths].some(p=>p.includes(forbidden)), "static/disabled slot folder generated: "+forbidden);
  }
  const aliases = result.files.filter(f=>f.path.includes("/fp_r/"));
  assert(aliases.length===5, "expected one lightweight alias per sampled animated-context frame");
  for (const alias of aliases) {
    const model=JSON.parse(alias.content);
    assert(Object.keys(model).join() === "parent" && model.parent.startsWith("jsb:resin_gun/_generated/model_"),
      "alias is not a parent-only lightweight model");
  }
  assert(result.files.filter(f=>f.path.includes("/_generated/model_")).length===2, "global geometry dedup failed");
  assert(result.report.sampledFrames===5 && result.report.uniqueModels===2 && result.report.duplicateFrames===3,
    "dedup report is wrong");
  same(result.report.animatedContextFolders,["fp_r"],"animated context folder report is wrong");
  assert(result.report.handRenderingEnabled===false,"hand rendering should be disabled by default");
  assert(!paths.has("assets/minecraft/shaders/core/entity.vsh"),"disabled hand rendering exported a shader");

  const item=JSON.parse(result.files.find(f=>f.path==="assets/jsb/items/resin_gun.json").content);
  const gui=item.model.cases.find(v=>v.when==="gui");
  const fp=item.model.cases.find(v=>v.when==="firstperson_righthand");
  assert(gui.model.type==="minecraft:model" && gui.model.model.startsWith("jsb:resin_gun/_generated/"),
    "static context does not directly reference default generated model");
  assert(fp.model.type==="minecraft:select" && fp.model.property==="minecraft:custom_model_data" && fp.model.index===0,
    "animation string selector missing");
  const idle=fp.model.cases.find(v=>v.when==="idle"), reload=fp.model.cases.find(v=>v.when==="reload");
  assert(idle.model.type==="minecraft:range_dispatch" && idle.model.index===0, "float frame selector missing");
  same(idle.model.entries.map(v=>v.threshold),[0,1,2],"idle local frames wrong");
  same(reload.model.entries.map(v=>v.threshold),[0,1],"reload local frames wrong");
  same(fp.model.fallback,idle.model,"invalid animation key does not fall back to default track");
  same(item.model.fallback,gui.model,"unknown display context does not fall back to static model");

  const allStatic=buildResourcePack([{key:"idle",sourceName:"Idle",frames:[frame(0,0)]}],{
    packName:"Static",projectName:"static_item",description:"test",defaultAnimationKey:"idle",
    displayContexts:[{context:"gui",animated:false},{context:"firstperson_righthand",animated:false}]
  });
  const staticPaths=allStatic.files.map(f=>f.path);
  assert(staticPaths.filter(p=>p.includes("assets/jsb/models/static_item/")).length===1,
    "all-static export wrote more than the one generated model");
  assert(staticPaths.some(p=>p.endsWith("/_generated/model_0.json")),"all-static model_0 missing");
  assert(allStatic.report.animatedContextFolders.length===0,"all-static report lists animated folders");

  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const moved=[1,0,0,0,0,1,0,0,0,0,1,0,4,2,-2,1];
  const handFrame=(index,x,matrix)=>{
    const result=frame(index,x,{left:{matrix},right:{matrix}});
    result.model.display={
      firstperson_righthand:{translation:[-12.25,9.75,0]},
      firstperson_lefthand:{translation:[2,3,4]}
    };
    return result;
  };
  const hands=buildResourcePack([{key:"idle",sourceName:"Idle",frames:[handFrame(0,0,identity),handFrame(1,1,moved)]}],{
    packName:"Hands",projectName:"hand_item",description:"test",defaultAnimationKey:"idle",handRenderingEnabled:true,
    displayContexts:[
      {context:"gui",animated:false},
      {context:"firstperson_righthand",animated:true},
      {context:"firstperson_lefthand",animated:true}
    ]
  });
  const handPaths=new Set(hands.files.map(f=>f.path));
  for(const path of [
    "assets/minecraft/shaders/core/entity.vsh",
    "assets/minecraft/shaders/core/entity.fsh",
    "assets/jsb/models/hand_item/_hand/left.json",
    "assets/jsb/models/hand_item/_hand/right.json"
  ]) assert(handPaths.has(path),"hand rendering asset missing: "+path);
  const handItem=JSON.parse(hands.files.find(f=>f.path==="assets/jsb/items/hand_item.json").content);
  const handFp=handItem.model.cases.find(v=>v.when==="firstperson_righthand").model;
  const handFpLeft=handItem.model.cases.find(v=>v.when==="firstperson_lefthand").model;
  assert(handFp.type==="minecraft:select"&&handFpLeft.type==="minecraft:select","both first-person animation selectors are required");
  const handRange=handFp.cases.find(v=>v.when==="idle").model;
  const handRangeLeft=handFpLeft.cases.find(v=>v.when==="idle").model;
  const handComposite=handRange.entries[0].model;
  assert(handComposite.type==="minecraft:composite"&&handComposite.models.length===3,"per-frame right-hand composite missing");
  assert(handRangeLeft.entries[0].model.type==="minecraft:composite","per-frame left-hand composite missing");
  assert(handComposite.models[0].type==="minecraft:model","weapon model is not first in hand composite");
  assert(handComposite.models[1].type==="minecraft:special"&&handComposite.models[1].base==="jsb:hand_item/_hand/_generated/left_0",
    "left player-head special model missing");
  assert(handComposite.models[2].model.type==="minecraft:player_head"&&handComposite.models[2].base==="jsb:hand_item/_hand/_generated/right_0",
    "right player-head special model missing");
  same(handComposite.models[1].transformation.left_rotation,[1,0,0,0],"reference X-axis correction missing");
  same(handComposite.models[1].transformation.translation,[0.5,0,0.5],"reference half-block correction missing");
  same(handRange.entries[0].model.models[1].transformation,handRange.entries[1].model.models[1].transformation,
    "animated frame changed the shader-identification special transform");
  assert(handRange.entries[0].model.models[1].base!==handRange.entries[1].model.models[1].base,
    "different hand keyframes reused the same animated hand base");
  const restLeft=JSON.parse(hands.files.find(f=>f.path.endsWith("/_hand/_generated/left_0.json")).content);
  same(restLeft.display.firstperson_righthand.rotation,[-180,0,-180],
    "bind frame does not carry the calibrated left rotation");
  same(restLeft.display.firstperson_righthand.translation,[-18.25,5.81,2],
    "rest hand did not follow the project display translation");
  const movedLeft=JSON.parse(hands.files.find(f=>f.path.endsWith("/_hand/_generated/left_1.json")).content);
  same(movedLeft.display.firstperson_righthand.translation,[-14.25,7.81,0],
    "arm delta was not composed onto the calibrated hand translation");
  same(movedLeft.display.firstperson_lefthand.translation,[4,1.06,4],
    "left display transform was not applied");
  same(movedLeft.display.firstperson_righthand.scale,[0.471,0.515,1.515],
    "animated hand base changed the exact shader scale marker");
  assert(handItem.model.cases.find(v=>v.when==="gui").model.type==="minecraft:model",
    "hands leaked into GUI context");
  const rightBase=JSON.parse(hands.files.find(f=>f.path.endsWith("/_hand/right.json")).content);
  same(rightBase.display.firstperson_righthand.rotation,[180,0,0],"bind right rotation is not the calibrated value");
  same(rightBase.display.firstperson_righthand.translation,[-1,1.4,1.5],"bind right translation is not the calibrated value");
  same(rightBase.display.firstperson_righthand.scale,[0.46629,0.50985,1.49985],"right-hand shader tag scale changed");
  same(rightBase.display.firstperson_lefthand.scale,[0.46629,0.50985,1.49985],"left-hand display context missing from hand base");
  assert(rightBase.textures.particle==="jsb:item/hand_item/gun","hand base does not use a generated texture");
  for(const context of ["gui","fixed","ground","thirdperson_righthand","thirdperson_lefthand","head","on_shelf"])
    same(rightBase.display[context].scale,[0,0,0],"hand base is visible in "+context);
  assert(hands.files.find(f=>f.path.endsWith("entity.vsh")).content.includes("modelPosition"),
    "reference derivative hand marker missing");
  assert(hands.files.find(f=>f.path.endsWith("entity.fsh")).content.includes("sourceFaceCoord = vec2(1.0) - sourceFaceCoord"),
    "confirmed face-1 U+V correction missing");
  assert(hands.report.handRenderingEnabled===true,"hand rendering report is wrong");

  let unknown=false;
  try { buildResourcePack([{key:"idle",sourceName:"Idle",frames:[frame(0,0)]}],{
    packName:"Bad",projectName:"bad",description:"test",defaultAnimationKey:"idle",
    displayContexts:[{context:"future_context",animated:true}]
  }); } catch(error) { unknown=String(error).includes("Unknown display context"); }
  assert(unknown,"unknown animated display context was accepted");
  process.stdout.write(JSON.stringify(result.report));
`;
await importTestBundle(entry, { sourcefile: "resource-test.ts", define: {__DAP_FORCE_LANGUAGE__:"null"} });
