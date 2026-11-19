// A microphone-only gate. It never gates the soundboard or preview buses.
class SoundboardNoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'enabled',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},{name:'threshold',defaultValue:-50,minValue:-60,maxValue:0,automationRate:'k-rate'}];}
  constructor(){super();this.gain=1;this.hold=0;}
  process(inputs,outputs,params){
    const input=inputs[0],output=outputs[0];if(!output?.length)return true;
    let sum=0,count=0;for(const channel of input||[])for(const x of channel){sum+=x*x;count++;}
    const rms=count?Math.sqrt(sum/count):0,open=!params.enabled[0]||rms>=10**(params.threshold[0]/20);
    if(open)this.hold=sampleRate*.08;else this.hold=Math.max(0,this.hold-(output[0]?.length||128));
    const target=open||this.hold>0?1:0,coefficient=Math.exp(-1/(sampleRate*(target?0.003:0.025)));
    for(let i=0;i<output[0].length;i++){this.gain=target+(this.gain-target)*coefficient;for(let c=0;c<output.length;c++)output[c][i]=(input?.[c]?.[i]??input?.[0]?.[i]??0)*this.gain;}
    return true;
  }
}
registerProcessor('soundboard-noise-gate',SoundboardNoiseGate);
