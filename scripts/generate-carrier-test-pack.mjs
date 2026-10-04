/** Generate an isolated server regression pack; does not connect to or modify a running server. */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/generate-carrier-test-pack.mjs <new-output-directory>');
if (fs.existsSync(output)) throw new Error('Use a new directory for each test build');
const bundle = await build({entryPoints:['src/datapack.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {buildDatapack} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
globalThis.tl = key=>key;
const project='audit_all_slots';
const base=`jsb:${project}`;
const storage=`${base}/test`;
const tag='dap_carrier_audit';
const files=buildDatapack({packName:'Carrier regression',projectName:project,baseItem:'minecraft:stick',itemDisplayName:'Carrier regression',frameObjective:'dap_audit_f',modeObjective:'dap_audit_m',maxFrameObjective:'dap_audit_x',playingTag:'dap_audit_p',playbackFps:12,animations:[{key:'idle',displayName:'Idle',frameCount:4},{key:'fire',displayName:'Fire',frameCount:6}],defaultAnimationKey:'idle',description:'Isolated carrier regression fixture',debugEnabled:false});
const item={id:'minecraft:stick',count:1,components:{'minecraft:item_model':base,'minecraft:custom_model_data':{strings:['idle','part_kept'],floats:[0,42]},'minecraft:custom_data':{unrelated:'kept',jsb:{project,animation:'idle',frame:0,mode:0,max:3,phase:0}}}};
const commands=[`data modify storage ${storage} result set value {}`,`execute unless block ~ ~ ~ air run return 0`,`setblock ~ ~ ~ minecraft:oak_shelf`];
const assert=(name,condition)=>commands.push(`execute store success storage ${storage} result.${name} byte 1 run execute ${condition}`);
const carriers=[['item','Item'],['item_frame','Item'],['glow_item_frame','Item'],['item_display','item']];
for(const [type,key] of carriers){
 commands.push(`summon minecraft:${type} ~ ~2 ~ {Tags:["${tag}","${tag}_${type}"],NoGravity:1b,Invulnerable:1b,Fixed:1b,Age:-32768s,PickupDelay:32767s,${key}:${JSON.stringify(item)}}`);
 commands.push(`execute as @e[tag=${tag}_${type},limit=1] at @s run function ${base}/play {animation:"fire",mode:"loop"}`);
}
commands.push(`summon minecraft:armor_stand ~ ~2 ~ {Tags:["${tag}","${tag}_equipment"],NoGravity:1b,Invulnerable:1b,equipment:{mainhand:${JSON.stringify(item)},offhand:${JSON.stringify(item)},head:${JSON.stringify(item)}}}`);
for(const slot of ['weapon.mainhand','weapon.offhand','armor.head']) commands.push(`execute as @e[tag=${tag}_equipment,limit=1] at @s run function ${base}/play_slot {slot:"${slot}",animation:"fire",mode:"loop"}`);
for(let slot=0;slot<3;slot++){
 commands.push(`item replace block ~ ~ ~ container.${slot} with minecraft:stick[minecraft:item_model="${base}",minecraft:custom_model_data={strings:["idle","part_kept"],floats:[0.0f,42.0f]},minecraft:custom_data={unrelated:"kept",jsb:{project:"${project}",animation:"idle",frame:0,mode:0,max:3,phase:0}}]`);
 commands.push(`function ${base}/block/play {slot:${slot},animation:"fire",mode:"loop"}`);
 commands.push(`function ${base}/block/register {slot:${slot}}`);
}
commands.push(`function ${base}/tick`,`function ${base}/tick`);
for(const [type,key] of carriers){
 assert(type,`if data entity @e[tag=${tag}_${type},limit=1] ${key}.components."minecraft:custom_data".jsb{frame:2,phase:4,mode:1,animation:"fire"}`);
 assert(type+'_preserved',`if data entity @e[tag=${tag}_${type},limit=1] ${key}.components."minecraft:custom_data"{unrelated:"kept"}`);
 assert(type+'_parts',`if data entity @e[tag=${tag}_${type},limit=1] ${key}.components."minecraft:custom_model_data"{strings:["fire","part_kept"],floats:[2.0f,42.0f]}`);
}
for(const slot of ['mainhand','offhand','head']) assert(slot,`if data entity @e[tag=${tag}_equipment,limit=1] equipment.${slot}.components."minecraft:custom_data".jsb{frame:2,phase:4,mode:1}`);
for(let slot=0;slot<3;slot++) assert('shelf_'+slot,`if data block ~ ~ ~ Items[{Slot:${slot}b}].components."minecraft:custom_data".jsb{frame:2,phase:4,mode:1}`);
commands.push(`execute as @e[tag=${tag}_equipment,limit=1] run function ${base}/stop_slot {slot:"weapon.offhand"}`);
assert('offhand_stop',`if data entity @e[tag=${tag}_equipment,limit=1] equipment.offhand.components."minecraft:custom_data".jsb{mode:0,frame:0,animation:"idle"}`);
assert('mainhand_independent',`if data entity @e[tag=${tag}_equipment,limit=1] equipment.mainhand.components."minecraft:custom_data".jsb{mode:1,frame:2,animation:"fire"}`);
commands.push(`function ${base}/block/frame {slot:1,animation:"fire",frame:999}`);
assert('block_frame_clamped',`if data block ~ ~ ~ Items[{Slot:1b}].components."minecraft:custom_data".jsb{frame:5,mode:0}`);
commands.push(`function ${base}/block/stop {slot:1}`);
assert('block_stop',`if data block ~ ~ ~ Items[{Slot:1b}].components."minecraft:custom_data".jsb{frame:0,mode:0,animation:"idle"}`);
assert('block_independent',`if data block ~ ~ ~ Items[{Slot:0b}].components."minecraft:custom_data".jsb{frame:2,mode:1}`);
commands.push(`execute as @e[tag=${tag}_item_display,limit=1] at @s run function ${base}/play {animation:"fire",mode:"once"}`);
for(let n=0;n<9;n++) commands.push(`function ${base}/tick`);
assert('once_resets',`if data entity @e[tag=${tag}_item_display,limit=1] item.components."minecraft:custom_data".jsb{frame:0,mode:0,animation:"idle"}`);
commands.push(`execute as @e[tag=${tag}_equipment,limit=1] run function ${base}/play_slot {slot:"invalid",animation:"fire",mode:"loop"}`);
assert('invalid_slot_preserves_offhand',`if data entity @e[tag=${tag}_equipment,limit=1] equipment.offhand.components."minecraft:custom_data".jsb{mode:0,frame:0}`);
commands.push(`setblock ~ ~ ~ air`,`function ${base}/tick`);
assert('marker_cleanup',`unless entity @e[type=minecraft:marker,tag=jsb.${project}.block,distance=..1]`);
commands.push(`kill @e[tag=${tag}]`,`data modify storage ${storage} completed set value 1b`);
files.push({path:`data/jsb/function/${project}/_test/run.mcfunction`,content:commands.join('\n')+'\n'});
// A server-level caller freezes ticks and invokes this function at an unused, loaded air block.
for(const file of files){const target=path.join(output,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content);}
console.log(JSON.stringify({output,files:files.length,assertions:commands.filter(c=>c.includes('store success storage')).length}));
