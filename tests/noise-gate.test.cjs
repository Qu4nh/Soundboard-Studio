const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/noise-gate.js','utf8');
function gate(){let Constructor;vm.runInNewContext(source,{AudioWorkletProcessor:class{},sampleRate:48000,registerProcessor:(_,value)=>Constructor=value});return new Constructor();}
function process(g,amplitude,enabled=1,threshold=-40,blocks=80){let result;for(let n=0;n<blocks;n++){const input=new Float32Array(128).fill(amplitude),output=new Float32Array(128);g.process([[input]],[[output]],{enabled:[enabled],threshold:[threshold]});result=output;}return Math.sqrt(result.reduce((s,v)=>s+v*v,0)/result.length);}
test('microphone gate attenuates sub-threshold PCM and passes above-threshold speech',()=>{const g=gate();assert.ok(process(g,.001)<.00001);assert.ok(Math.abs(process(g,.1)-.1)<.00001);});
test('gate bypass preserves quiet PCM; hold prevents abrupt closure between speech blocks',()=>{const g=gate();assert.ok(Math.abs(process(g,.001,0)-.001)<.00001);process(g,.1);assert.ok(process(g,.001,1,-40,1)>.0009);assert.ok(process(g,.001,1,-40,100)<.00001);});
