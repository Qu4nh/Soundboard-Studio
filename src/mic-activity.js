// Input activity, not speech recognition. Hysteresis keeps syllables readable.
export function microphoneActivity(sample,previous={},now=performance.now()){
 const db=Math.max(-60,Math.min(0,Number.isFinite(sample.db)?sample.db:-60));
 const state=!sample.enabled?'off':!sample.available?'disconnected':sample.muted?'muted':null;
 if(state)return state===previous.state?previous:{state,db:-60,levelDb:-60,bars:0,clip:false,lastSignal:-Infinity,lastClip:-Infinity};
 const threshold=previous.state==='active'?-54:-48,lastSignal=db>=threshold?now:previous.lastSignal??-Infinity,lastClip=sample.peak>=.98?now:previous.lastClip??-Infinity,clip=now-lastClip<400,levelDb=Math.max(db,(previous.levelDb??-60)-4);
 return {state:now-lastSignal<300?'active':'quiet',db,levelDb,bars:Math.max(0,Math.min(8,Math.ceil((levelDb+60)/60*8))),clip,lastSignal,lastClip};
}
