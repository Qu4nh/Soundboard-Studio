// Independent implementation of the mode matrix observed in the shipped inspector.
const modeOptions={
 restart:{loop:{value:false,disabled:true},stopOthers:{value:false,disabled:false},muteOthers:{value:false,disabled:false},muteVoice:{value:false,disabled:false}},
 pause:{loop:{value:false,disabled:false},stopOthers:{value:false,disabled:true},muteOthers:{value:false,disabled:false},muteVoice:{value:false,disabled:false}},
 stop:{loop:{value:false,disabled:false},stopOthers:{value:false,disabled:false},muteOthers:{value:false,disabled:false},muteVoice:{value:false,disabled:false}},
 overlap:{loop:{value:false,disabled:true},stopOthers:{value:false,disabled:true},muteOthers:{value:false,disabled:true},muteVoice:{value:false,disabled:false}},
 hold:{loop:{value:true,disabled:true},stopOthers:{value:false,disabled:false},muteOthers:{value:false,disabled:false},muteVoice:{value:false,disabled:false}}
};
function applyMode(sound,mode){const options=modeOptions[mode];if(!options)return sound;return {...sound,mode,...Object.fromEntries(Object.entries(options).map(([key,{value}])=>[key,value]))};}
function enforceMode(sound){const options=modeOptions[sound.mode]||modeOptions.restart;return {...sound,...Object.fromEntries(Object.entries(options).filter(([,o])=>o.disabled).map(([key,o])=>[key,o.value]))};}
module.exports={modeOptions,applyMode,enforceMode};
