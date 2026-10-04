import { importTestBundle } from "./lib/test-bundle.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),"jsb-writer-test-"));
const modulePath=fileURLToPath(new URL("../src/file-writer.ts",import.meta.url));
const entry=`
  import fs from "node:fs";
  import path from "node:path";
  globalThis.tl=key=>key;
  const assert=(v,m)=>{if(!v)throw new Error(m)};
  const base=${JSON.stringify(temporaryRoot)};
  let failRenameAt=0,renameCount=0;
  const scopedFs={...fs,
    renameSync(from,to){renameCount++;if(failRenameAt&&renameCount===failRenameAt)throw new Error("injected commit failure");return fs.renameSync(from,to)}
  };
  globalThis.requireNativeModule=(name,options)=>name==="path"?path:scopedFs;
  globalThis.Blockbench={writeFile(filePath,options){fs.writeFileSync(filePath,options.content)}};
  const {previewPacks,writePacks}=await import(${JSON.stringify(modulePath)});
  const text=(path,content="generated")=>({path,content});
  const target=(root,kind,insert,files,projectName="resin_gun")=>({scopeRoot:base,root,kind,projectName,insert,files});

  const resource=path.join(base,"resource");
  const resourceFiles=[text("pack.mcmeta",JSON.stringify({pack:{description:"generated"}})),
    text("assets/jsb/items/resin_gun.json","item-v1"),
    text("assets/jsb/models/resin_gun/_generated/model_0.json","model-v1"),
    text("assets/jsb/models/resin_gun/reload/fp_r/0.json","alias-v1")];
  let preview=previewPacks([target(resource,"resource",false,resourceFiles)]);
  assert(preview.conflicts.length===0&&preview.added===5,"new-pack preflight counts are wrong");
  writePacks([target(resource,"resource",false,resourceFiles)]);
  const manifestPath=path.join(resource,"assets.jsbmeta");
  let manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  assert(manifest.version===1&&manifest.projects.resin_gun.kind==="resource","manifest identity wrong");
  assert(manifest.projects.resin_gun.files.includes("assets/jsb/models/resin_gun/reload/fp_r/0.json"),"manifest omitted project file");

  // Insert/update is a complete project replacement: stale animation alias is removed, user files and pack metadata survive.
  fs.writeFileSync(path.join(resource,"user-note.txt"),"keep");
  fs.writeFileSync(path.join(resource,"pack.mcmeta"),JSON.stringify({pack:{description:"user pack"}}));
  const resourceV2=[text("pack.mcmeta",JSON.stringify({pack:{description:"must not replace"}})),
    text("assets/jsb/items/resin_gun.json","item-v2"),
    text("assets/jsb/models/resin_gun/_generated/model_0.json","model-v2")];
  preview=previewPacks([target(resource,"resource",true,resourceV2)]);
  assert(preview.removed===1&&preview.updated===3,"project replacement preflight is wrong");
  writePacks([target(resource,"resource",true,resourceV2)]);
  assert(!fs.existsSync(path.join(resource,"assets/jsb/models/resin_gun/reload/fp_r/0.json")),"stale animation file survived");
  assert(!fs.existsSync(path.join(resource,"assets/jsb/models/resin_gun/reload")),"empty stale animation directories survived");
  assert(fs.readFileSync(path.join(resource,"user-note.txt"),"utf8")==="keep","user file was modified");
  assert(JSON.parse(fs.readFileSync(path.join(resource,"pack.mcmeta"),"utf8")).pack.description==="user pack","insert replaced pack.mcmeta");

  // Datapack insertion merges shared tags and preserves foreign functions and tag fields.
  const data=path.join(base,"datapack");fs.mkdirSync(path.join(data,"data/minecraft/tags/function"),{recursive:true});
  fs.writeFileSync(path.join(data,"pack.mcmeta"),JSON.stringify({pack:{description:"map"}}));
  fs.writeFileSync(path.join(data,"data/minecraft/tags/function/load.json"),JSON.stringify({replace:false,values:["map:load"]}));
  fs.writeFileSync(path.join(data,"data/minecraft/tags/function/tick.json"),JSON.stringify({values:["map:tick"]}));
  const dataFiles=[text("pack.mcmeta","ignored"),text("data/jsb/function/resin_gun/load.mcfunction","say load"),
    text("data/jsb/function/resin_gun/tick.mcfunction","say tick"),
    text("data/minecraft/tags/function/load.json",JSON.stringify({values:["jsb:resin_gun/load"]})),
    text("data/minecraft/tags/function/tick.json",JSON.stringify({values:["jsb:resin_gun/tick"]}))];
  preview=previewPacks([target(data,"datapack",true,dataFiles)]);
  assert(preview.merged===2,"shared tag changes were not reported");
  writePacks([target(data,"datapack",true,dataFiles)]);
  assert(fs.existsSync(path.join(data,"data.jsbmeta"))&&!fs.existsSync(path.join(data,"assets.jsbmeta")),"datapack manifest was not kept separate");
  assert(fs.existsSync(path.join(resource,"assets.jsbmeta"))&&!fs.existsSync(path.join(resource,"data.jsbmeta")),"resource manifest was not kept separate");
  const load=JSON.parse(fs.readFileSync(path.join(data,"data/minecraft/tags/function/load.json"),"utf8"));
  assert(load.replace===false&&load.values.join() === "map:load,jsb:resin_gun/load","load tag was not safely merged");

  // An unmanaged same-project path must block before any content changes.
  const conflict=path.join(base,"conflict");fs.mkdirSync(path.join(conflict,"assets/jsb/items"),{recursive:true});
  fs.writeFileSync(path.join(conflict,"pack.mcmeta"),JSON.stringify({pack:{description:"map"}}));
  fs.writeFileSync(path.join(conflict,"assets/jsb/items/resin_gun.json"),"user-owned");
  preview=previewPacks([target(conflict,"resource",true,[text("assets/jsb/items/resin_gun.json","generated")])]);
  assert(preview.conflicts.length===1,"unmanaged collision was not reported");
  let blocked=false;try{writePacks([target(conflict,"resource",true,[text("assets/jsb/items/resin_gun.json","generated")])])}catch{blocked=true}
  assert(blocked&&fs.readFileSync(path.join(conflict,"assets/jsb/items/resin_gun.json"),"utf8")==="user-owned","collision was overwritten");

  // Core hand shaders are shared: identical files may be adopted, remain while another project owns
  // them, and are removed only after the last owning project disables hand rendering.
  const shared=path.join(base,"shared-shaders");
  const shaders=[
    text("assets/minecraft/shaders/core/entity.vsh","shared-vsh"),
    text("assets/minecraft/shaders/core/entity.fsh","shared-fsh")
  ];
  const alpha=[text("pack.mcmeta",JSON.stringify({pack:{description:"shared"}})),
    text("assets/jsb/items/alpha.json","alpha"),...shaders];
  writePacks([target(shared,"resource",false,alpha,"alpha")]);
  const beta=[text("pack.mcmeta","ignored"),text("assets/jsb/items/beta.json","beta"),...shaders];
  preview=previewPacks([target(shared,"resource",true,beta,"beta")]);
  assert(preview.conflicts.length===0,"identical shared shaders could not be adopted");
  writePacks([target(shared,"resource",true,beta,"beta")]);
  let sharedManifest=JSON.parse(fs.readFileSync(path.join(shared,"assets.jsbmeta"),"utf8"));
  for(const project of ["alpha","beta"])
    assert(sharedManifest.projects[project].files.includes("assets/minecraft/shaders/core/entity.fsh"),
      "shared shader ownership missing for "+project);
  preview=previewPacks([target(shared,"resource",true,alpha.slice(0,2),"alpha")]);
  assert(preview.removed===0,"shader still owned by another project was scheduled for removal");
  writePacks([target(shared,"resource",true,alpha.slice(0,2),"alpha")]);
  assert(fs.existsSync(path.join(shared,"assets/minecraft/shaders/core/entity.vsh")),
    "shared shader was removed while beta still owned it");
  preview=previewPacks([target(shared,"resource",true,beta.slice(0,2),"beta")]);
  assert(preview.removed===2,"last owner did not schedule shared shader removal");
  writePacks([target(shared,"resource",true,beta.slice(0,2),"beta")]);
  assert(!fs.existsSync(path.join(shared,"assets/minecraft/shaders/core/entity.vsh"))&&
    !fs.existsSync(path.join(shared,"assets/minecraft/shaders/core/entity.fsh")),
    "last owner disabling hands left shared shaders behind");

  const shaderConflict=path.join(base,"shader-conflict");
  fs.mkdirSync(path.join(shaderConflict,"assets/minecraft/shaders/core"),{recursive:true});
  fs.writeFileSync(path.join(shaderConflict,"pack.mcmeta"),JSON.stringify({pack:{description:"foreign"}}));
  fs.writeFileSync(path.join(shaderConflict,"assets/minecraft/shaders/core/entity.vsh"),"foreign-vsh");
  preview=previewPacks([target(shaderConflict,"resource",true,[
    text("assets/jsb/items/resin_gun.json","item"),...shaders
  ])]);
  assert(preview.conflicts.some(p=>p.endsWith("entity.vsh")),
    "different unmanaged core shader did not block insertion");

  // Inject a commit failure after one target begins: every replaced file must roll back.
  const beforeItem=fs.readFileSync(path.join(resource,"assets/jsb/items/resin_gun.json"),"utf8");
  const beforeLoad=fs.readFileSync(path.join(data,"data/jsb/function/resin_gun/load.mcfunction"),"utf8");
  renameCount=0;failRenameAt=4;let rolled=false;
  try{writePacks([
    target(resource,"resource",true,[...resourceV2.slice(0,1),text("assets/jsb/items/resin_gun.json","item-v3"),text("assets/jsb/models/resin_gun/_generated/model_0.json","model-v3")]),
    target(data,"datapack",true,[...dataFiles.slice(0,1),text("data/jsb/function/resin_gun/load.mcfunction","say changed"),...dataFiles.slice(2)])
  ])}catch(error){rolled=String(error).includes("injected commit failure")}
  failRenameAt=0;
  assert(rolled,"injected write failure did not surface");
  assert(fs.readFileSync(path.join(resource,"assets/jsb/items/resin_gun.json"),"utf8")===beforeItem,"resource rollback failed");
  assert(fs.readFileSync(path.join(data,"data/jsb/function/resin_gun/load.mcfunction"),"utf8")===beforeLoad,"datapack rollback failed");

  let invalid=false;const missing=path.join(base,"missing-pack");
  try{previewPacks([target(missing,"resource",true,[text("assets/jsb/items/resin_gun.json")])])}catch{invalid=true}
  assert(invalid,"insert accepted a folder without valid pack.mcmeta");
  process.stdout.write(JSON.stringify({resourceFiles:manifest.projects.resin_gun.files.length,merged:2,rollback:true}));
`;
try{
  await importTestBundle(entry, { sourcefile: "writer-test.ts", define: {__DAP_FORCE_LANGUAGE__:"null"} });
} finally { fs.rmSync(temporaryRoot,{recursive:true,force:true}); }
