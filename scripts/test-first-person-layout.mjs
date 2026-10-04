import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

await importTestBundle(`
import {fitFirstPersonViewport, FIRST_PERSON_ASPECT, applyFirstPersonScale} from ${JSON.stringify(fileURLToPath(new URL('../src/first-person-panel.ts',import.meta.url)))};
if (FIRST_PERSON_ASPECT !== 1986/1112) throw new Error("aspect must match approved screenshot");
const m={elements:[2,0,0,0,0,3,0,0,0,0,-1,-1,0,0,-2,0]};
applyFirstPersonScale(m);
if(m.elements[0]!==2.62 || m.elements[5]!==3.93 || m.elements[8]!==0 || m.elements[9]!==0) throw new Error('fixed framing failed');
if(m.elements[10]!==-1 || m.elements[14]!==-2) throw new Error('depth projection changed');
for (const aspect of [FIRST_PERSON_ASPECT, 1161/791, 1, 9/16]) {
  for (const [width,height] of [[600,400],[300,400],[150,400],[600,100],[1,1]]) {
    const fit=fitFirstPersonViewport(width,height,aspect);
    if(Math.abs(fit.width/fit.height-aspect)>1e-12) throw new Error('aspect changed');
    if(fit.width>width+1e-10 || fit.height>height+1e-10) throw new Error('preview clipped');
    if(Math.abs(fit.width-width)>1e-10 && Math.abs(fit.height-height)>1e-10) throw new Error('preview does not fill either axis');
    const smaller=fitFirstPersonViewport(width/2,height/2,aspect);
    if(Math.abs(smaller.width-fit.width/2)>1e-10 || Math.abs(smaller.height-fit.height/2)>1e-10) throw new Error('nonuniform scaling');
  }
}
process.stdout.write('First-person layout: 20 aspect/size combinations passed.\\n');
`, {sourcefile:'first-person-layout-test.ts'});
