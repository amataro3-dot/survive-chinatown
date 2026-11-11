// ひとり用のテスト(Claude 用): node tests/solo_test.js
// にせの THREE と画面で main.js を動かし、5つのミッション・逮捕・手配度を自動で確かめる
const fs=require('fs');

const code=fs.readFileSync(require('path').join(__dirname,'..','main.js'),'utf8');
function S(){const store={};const f=function(){};return new Proxy(f,{get(t,k){if(k in store)return store[k];if(k===Symbol.toPrimitive)return ()=>NaN;if(k==='then')return undefined;store[k]=S();return store[k];},set(t,k,v){store[k]=v;return true;},apply(){return S();},construct(){return S();}});}
const els={};
function el(id){if(!els[id]){els[id]={id,style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){(this._l=this._l||{})[t]=f;},setPointerCapture(){},getContext(){return S();},textContent:'',innerHTML:'',width:0,height:0};}return els[id];}
global.window=global;global.THREE=S();global.SC_NO_INTRO=1;
global.document={getElementById:el,addEventListener(){},createElement:()=>({getContext:()=>S(),width:0,height:0}),body:{classList:{add(){},remove(){},toggle(){}}}};
global.innerWidth=800;global.innerHeight=400;let raf=null;global.requestAnimationFrame=f=>{raf=f;};
global.addEventListener=(t,f)=>{(global._l=global._l||{})[t]=f;};
let now=0;global.performance={now:()=>now};global.setTimeout=(f,ms)=>{pending.push([now+ms,f]);};const pending=[];
global.location={reload(){}};
eval(fs.readFileSync(require('path').join(__dirname,'..','i18n.js'),'utf8'));
eval(code);
el('goSolo')._l.click();
function step(n,keys){for(let i=0;i<n;i++){now+=16;for(let j=pending.length-1;j>=0;j--)if(pending[j][0]<=now){const f=pending[j][1];pending.splice(j,1);f();}raf(now);}}
const kd=c=>global._l.keydown({code:c,preventDefault(){}}),ku=c=>global._l.keyup({code:c});
step(30);
kd('KeyW');step(20);ku('KeyW');
kd('KeyE');ku('KeyE');step(5);
console.log('mission text',els.mission.innerHTML);
kd('KeyW');step(200);kd('KeyA');step(100);ku('KeyA');step(300);ku('KeyW');
console.log('speed',els.speed.textContent,'money',els.money.textContent,'stars',(els.stars.innerHTML.match(/ffd23f/g)||[]).length);

const D={G:SC.G,player:SC.player,cars:SC.cars,MISSIONS:SC.MISSIONS,peds:SC.peds};console.log('hooked',!!D);
function tp(x,z){const c=D.player.car;if(c){c.x=x;c.z=z;}D.player.x=x;D.player.z=z;}
for(let m=0;m<6;m++){const G=D.G;if(G.mi>=D.MISSIONS.length)break;step(200);
 for(let k=0;k<6;k++){const mm=D.MISSIONS[G.mi];if(!mm)break;const st=mm.steps[G.si];if(!st||!st.pos)break;tp(st.pos.x,st.pos.z);step(10);console.log('m',G.mi,'s',G.si,'wanted',G.wanted,'police',D.cars.filter(c=>c.kind==='police').length,'money',G.money,els.toast.textContent);}
}
console.log('story',!!D.G.story);if(D.G.story)els.storySkip._l.click({stopPropagation(){}});
step(300);console.log('over',D.G.over,'mi',D.G.mi,els.toast.textContent);
// bust test
D.G.wanted=3;step(600);const pol=D.cars.filter(c=>c.kind==='police');console.log('police',pol.length,pol.map(c=>Math.hypot(c.x-D.player.x,c.z-D.player.z)|0));
step(1500);console.log('after chase wanted',D.G.wanted,'money',D.G.money,'mode',D.player.mode,els.toast.textContent);
console.log('nan check',D.cars.some(c=>isNaN(c.x)||isNaN(c.z)),D.peds.some(p=>isNaN(p.x)));
