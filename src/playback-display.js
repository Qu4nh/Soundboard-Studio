function sameIds(a,b){
  return a.size===b.size&&[...a].every(id=>b.has(id));
}

// Progress changes often. Board and library subscribers only need changes in activity.
export function createPlaybackDisplay(){
  const listeners=new Set();
  let voices=[],pads=new Map();
  let activity={boardAudio:false,playingPadIds:new Set(),previewIds:new Set()};
  return {
    subscribe(listener){
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    },
    getVoices:()=>voices,
    getActivity:()=>activity,
    getPad:id=>pads.get(id),
    update(next){
      if(!next.length&&!voices.length)return;
      const previewIds=new Set(),playingPadIds=new Set();
      const nextPads=new Map();
      for(const voice of next){
        if(voice.preview)previewIds.add(voice.id);
        else if(!nextPads.has(voice.id)){
          nextPads.set(voice.id,voice);
          if(!voice.paused)playingPadIds.add(voice.id);
        }
      }
      const boardAudio=nextPads.size>0;
      if(boardAudio!==activity.boardAudio||!sameIds(playingPadIds,activity.playingPadIds)||!sameIds(previewIds,activity.previewIds)){
        activity={boardAudio,playingPadIds,previewIds};
      }
      voices=next;
      pads=nextPads;
      for(const listener of listeners)listener();
    },
  };
}
