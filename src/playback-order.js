export const remainingTime=voice=>voice.loop||voice.paused?Infinity:Math.max(0,(voice.end-voice.position)/(voice.speed||1));
export function orderPlaying(voices){return [...voices].sort((a,b)=>{const left=remainingTime(a),right=remainingTime(b);return left===right?0:left>right?-1:1;});}
