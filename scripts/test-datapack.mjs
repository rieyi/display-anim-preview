import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";
const modulePath=fileURLToPath(new URL("../src/datapack.ts",import.meta.url));
const entry=`
  import {buildDatapack} from ${JSON.stringify(modulePath)};
  globalThis.tl=key=>key;
  const assert=(v,m)=>{if(!v)throw new Error(m)};
  const options={packName:"Map Pack",projectName:"resin_gun",baseItem:"minecraft:stick",itemDisplayName:"Resin Gun",
    frameObjective:"jsb_f",modeObjective:"jsb_m",maxFrameObjective:"jsb_x",playingTag:"jsb_playing",playbackFps:12,
    animations:[{key:"reload",displayName:"Reload",frameCount:3},{key:"fire",displayName:"Fire",frameCount:6}],
    defaultAnimationKey:"reload",description:"test",debugEnabled:true};
  const files=buildDatapack(options), by=new Map(files.map(f=>[f.path,f.content]));
  const file=p=>{const c=by.get(p);if(c===undefined)throw new Error("Missing "+p);return c};
  const has=(p,s)=>assert(file(p).includes(s),p+" missing "+s);
  const root="data/jsb/function/resin_gun/";
  for(const name of ["give","play","frame","stop","play/reload","loop/reload","frame/reload","play/fire","loop/fire","frame/fire"])
    file(root+name+".mcfunction");
  for(const old of ["play_loop","play_once","next","prev","reset","set_frame"])
    assert(!by.has(root+old+".mcfunction"),"legacy public function exists: "+old);
  has(root+"load.mcfunction","/function jsb:resin_gun/give");
  has(root+"give.mcfunction",'minecraft:item_model="jsb:resin_gun"');
  has(root+"give.mcfunction",'minecraft:custom_name={"text":"Resin Gun","color":"gold","italic":false}');
  assert(!file(root+"give.mcfunction").includes("minecraft:custom_name='{"), "custom_name must be a component object, not a quoted JSON string");
  has(root+"give.mcfunction",'strings:["reload"],floats:[0.0]');
  has(root+"give.mcfunction",'minecraft:max_stack_size=1');
  has(root+"give.mcfunction",'minecraft:custom_data={jsb:{project:"resin_gun",animation:"reload",frame:0,mode:0,max:2,phase:0}}');
  assert(!by.has("data/jsb/loot_table/resin_gun/give.json"),"disabled hand rendering wrote a loot table");
  has(root+"give.mcfunction",'/function jsb:resin_gun/play/<animation>');
  has(root+"give.mcfunction",'/function jsb:resin_gun/stop');
  has(root+"play.mcfunction",'$function jsb:resin_gun/_internal/play/$(animation)/$(mode)');
  has(root+"play.mcfunction",'unless items entity @s weapon.mainhand *[minecraft:item_model="jsb:resin_gun"]');
  has(root+"frame.mcfunction",'$function jsb:resin_gun/_internal/frame/$(animation) {frame:$(frame)}');
  has(root+"play/reload.mcfunction",'function jsb:resin_gun/play {animation:"reload",mode:"once"}');
  has(root+"loop/fire.mcfunction",'function jsb:resin_gun/play {animation:"fire",mode:"loop"}');
  has(root+"frame/fire.mcfunction",'$function jsb:resin_gun/frame {animation:"fire",frame:$(frame)}');
  const quietFiles=new Map(buildDatapack({...options,debugEnabled:false}).map(f=>[f.path,f.content]));
  for(const [path,content] of quietFiles)
    assert(!content.includes("tellraw"),"developer tips off still emits a message in "+path);
  assert(quietFiles.get(root+"_internal/error/invalid_animation.mcfunction").includes("return 0"),"silent error function must keep the return-0 control flow");
  assert(quietFiles.get(root+"_internal/error/invalid_mode.mcfunction").includes("return 0"),"silent error function must keep the return-0 control flow");
  assert(quietFiles.get(root+"play.mcfunction").includes("unless items entity @s weapon.mainhand"),"silent play must keep the hold-check guard");
  assert(quietFiles.get(root+"stop.mcfunction").includes("return 0"),"silent stop must keep the hold-check guard");
  const loudPlay=by.get(root+"play.mcfunction");
  assert(loudPlay.includes("tellraw"),"developer tips on should keep the hold-item hint");
  const handFiles=new Map(buildDatapack({...options,baseItem:"minecraft:stick",handRenderingEnabled:true}).map(f=>[f.path,f.content]));
  assert(handFiles.get(root+"give.mcfunction").includes("loot give @s loot jsb:resin_gun/give"),
    "hand rendering give does not use the profile-aware loot table");
  assert(!handFiles.get(root+"give.mcfunction").includes("give @s minecraft:stick"),
    "hand rendering did not force the player-head carrier");
  const handLoot=JSON.parse(handFiles.get("data/jsb/loot_table/resin_gun/give.json"));
  const handEntry=handLoot.pools[0].entries[0];
  assert(handLoot.type==="minecraft:command"&&handEntry.name==="minecraft:player_head",
    "hand loot table is not a command-context player head");
  assert(handEntry.functions[0].function==="minecraft:set_components"&&
    handEntry.functions[1].function==="minecraft:fill_player_head"&&handEntry.functions[1].entity==="this",
    "hand loot table does not fill the executor profile after components");
  const handComponents=handEntry.functions[0].components;
  assert(handComponents["minecraft:item_model"]==="jsb:resin_gun"&&
    handComponents["minecraft:custom_model_data"].strings[0]==="reload"&&
    handComponents["minecraft:custom_data"].jsb.max===2&&
    handComponents["minecraft:max_stack_size"]===1,
    "hand player-head carrier lost animation components");
  has(root+"_internal/play/reload/once.mcfunction","scoreboard players set @s jsb_x 2");
  has(root+"_internal/play/fire/loop.mcfunction","scoreboard players set @s jsb_x 5");
  has(root+"_internal/play/reload/once.mcfunction","scoreboard players set @s jsb_f 1");
  has(root+"_internal/play/fire/loop.mcfunction","scoreboard players set @s jsb_f 1");
  has(root+"_internal/frame/fire.mcfunction",'$scoreboard players set @s jsb_f $(frame)');
  has(root+"_internal/frame/fire.mcfunction","matches ..-1");
  has(root+"_internal/frame/fire.mcfunction","scoreboard players operation @s jsb_f = @s jsb_x");
  has(root+"_internal/tick_player.mcfunction","if score @s jsb_m matches 2 if score @s jsb_f = @s jsb_x run function jsb:resin_gun/_internal/reset_default");
  has(root+"_internal/tick_player.mcfunction","scoreboard players add @s jsb_");
  has(root+"_internal/tick_player.mcfunction"," 12");
  has(root+"_internal/tick_player.mcfunction","matches 20.. run scoreboard players add @s jsb_f 1");
  has(root+"_internal/tick_player.mcfunction","matches 20.. run scoreboard players remove @s jsb_");
  has(root+"_internal/tick_player.mcfunction","if score @s jsb_x matches 0 if score @s jsb_f > @s jsb_x run scoreboard players set @s jsb_f 0");
  has(root+"_internal/tick_player.mcfunction","if score @s jsb_x matches 1.. if score @s jsb_f > @s jsb_x run scoreboard players set @s jsb_f 1");
  has(root+"tick.mcfunction",'if items entity @s weapon.mainhand *[minecraft:item_model="jsb:resin_gun"] run function jsb:resin_gun/_internal/sync_held');
  has(root+"tick.mcfunction",'as @a[tag=jsb_playing] unless items entity @s weapon.mainhand *[minecraft:item_model="jsb:resin_gun"] run function jsb:resin_gun/_internal/leave_held');
  has(root+"_internal/load_held_state.mcfunction",'SelectedItem.components."minecraft:custom_data".jsb.frame');
  has(root+"_internal/load_held_state.mcfunction",'SelectedItem.components."minecraft:custom_data".jsb.mode');
  has(root+"_internal/save_scores_to_storage.mcfunction","held.frame int 1 run scoreboard players get @s jsb_f");
  has(root+"_internal/save_held_state.mcfunction","item modify entity @s weapon.mainhand jsb:resin_gun/state/copy_from_storage");
  has(root+"_internal/sync_held.mcfunction","if entity @s[tag=jsb_playing] run function jsb:resin_gun/_internal/reset_inactive_once");
  has(root+"_internal/sync_held.mcfunction","function jsb:resin_gun/_internal/save_held_state");
  has(root+"_internal/leave_held.mcfunction","function jsb:resin_gun/_internal/reset_inactive_once");
  for(const slot of ["hotbar.0","hotbar.8","inventory.0","inventory.26","weapon.offhand"]){
    has(root+"_internal/reset_inactive_once.mcfunction","execute if items entity @s "+slot+' *[minecraft:item_model="jsb:resin_gun",minecraft:custom_data~{jsb:{project:"resin_gun",mode:2}}] run item modify entity @s '+slot+" jsb:resin_gun/state/reset_default");
  }
  assert(!file(root+"_internal/reset_inactive_once.mcfunction").includes("mode:1"),
    "looping item state must not be reset while the item is away");
  const generic=JSON.parse(file("data/jsb/item_modifier/resin_gun/set_frame.json"));
  assert(generic.strings===undefined && generic.floats.values[0].score==="jsb_f","generic modifier changed animation key");
  for(const key of ["reload","fire"]){const m=JSON.parse(file("data/jsb/item_modifier/resin_gun/set_frame/"+key+".json"));
    assert(m.strings.values[0]===key && m.floats.values[0].score==="jsb_f","per-animation modifier wrong: "+key)}
  const copyState=JSON.parse(file("data/jsb/item_modifier/resin_gun/state/copy_from_storage.json"));
  assert(copyState.function==="minecraft:copy_custom_data" && copyState.source.source==="jsb:resin_gun/runtime" && copyState.ops[0].target==="jsb",
    "item-local state copy modifier is invalid");
  const resetState=JSON.parse(file("data/jsb/item_modifier/resin_gun/state/reset_default.json"));
  assert(Array.isArray(resetState) && resetState[0].function==="minecraft:set_custom_data" && resetState[1].floats.values[0]===0,
    "item-local default reset modifier is invalid");
  const loadTag=JSON.parse(file("data/minecraft/tags/function/load.json"));
  const tickTag=JSON.parse(file("data/minecraft/tags/function/tick.json"));
  assert(loadTag.values[0]==="jsb:resin_gun/load" && tickTag.values[0]==="jsb:resin_gun/tick","shared tags wrong");
  let rejected=0;
  for(const bad of [
    {...options,animations:[...options.animations,{key:"fire",displayName:"x",frameCount:2}]},
    {...options,defaultAnimationKey:"missing"},
    {...options,animations:[{key:"..",displayName:"x",frameCount:2}],defaultAnimationKey:".."},
    {...options,animations:[{key:"_generated",displayName:"x",frameCount:2}],defaultAnimationKey:"_generated"}
  ]){try{buildDatapack(bad)}catch{rejected++}}
  for(const fps of [0,21,12.5]){try{buildDatapack({...options,playbackFps:fps})}catch{rejected++}}
  assert(rejected===7,"invalid datapack metadata was accepted");
  process.stdout.write(JSON.stringify({files:files.length,animations:2}));
`;
await importTestBundle(entry, { sourcefile: "datapack-test.ts", define: {__DAP_FORCE_LANGUAGE__:"null"} });
