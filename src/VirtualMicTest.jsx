import React,{useEffect,useRef,useState} from 'react';
import {Headphones,Mic,Square} from './Icons';
import {t} from './i18n';
import {routePreviewOutput} from './preview-routing';
import {Recorder} from './recorder';
import {findVirtualMicInput,inputLevel} from './virtual-mic-test';

const testDuration=5000;
const signalThreshold=-50;

export default function VirtualMicTest({endpointName,settings,disabled}){
  const [phase,setPhase]=useState('idle'),[level,setLevel]=useState(-60),[seconds,setSeconds]=useState(5);
  const [result,setResult]=useState(null),[error,setError]=useState(''),[playing,setPlaying]=useState(false);
  const capture=useRef(null),preview=useRef(null);

  function releaseCapture(session){
    clearInterval(session.timer);
    session.recorder.close();
    if(capture.current===session)capture.current=null;
  }

  function releasePreview(){
    const current=preview.current;
    if(!current)return;
    preview.current=null;
    current.audio.pause();
    current.audio.removeAttribute('src');
    current.audio.load();
    URL.revokeObjectURL(current.url);
  }

  useEffect(()=>{
    const devicesChanged=()=>{releasePreview();setPlaying(false);};
    navigator.mediaDevices.addEventListener('devicechange',devicesChanged);
    return()=>{
      navigator.mediaDevices.removeEventListener('devicechange',devicesChanged);
      if(capture.current)releaseCapture(capture.current);
      releasePreview();
    };
  },[]);

  useEffect(()=>{
    releasePreview();
    setPlaying(false);
  },[settings.monitorDevice,settings.monitorVolume,settings.monitorMuted]);

  async function finish(session){
    if(!session||capture.current!==session||session.finishing)return;
    session.finishing=true;
    clearInterval(session.timer);
    try{
      const frames=session.recorder.frames.mic||[];
      const detected=frames.some(frame=>inputLevel(frame)>=signalThreshold);
      const blob=frames.length?await session.recorder.stop():null;
      if(capture.current===session)setResult({blob,detected});
    }catch(e){
      if(capture.current===session)setError(e.message);
    }finally{
      if(capture.current===session){releaseCapture(session);setPhase('idle');}
    }
  }

  async function start(){
    if(capture.current||disabled)return;
    releasePreview();
    setPlaying(false);setResult(null);setError('');setLevel(-60);setSeconds(5);setPhase('starting');
    const session={recorder:new Recorder()};
    capture.current=session;
    try{
      const input=findVirtualMicInput(await navigator.mediaDevices.enumerateDevices(),endpointName);
      if(capture.current!==session)return;
      if(!input)throw Error('Virtual mic input unavailable. Refresh devices and try again.');
      await session.recorder.start(input.deviceId);
      if(capture.current!==session){session.recorder.close();return;}
      session.recorder.streams[0]?.getAudioTracks()[0]?.addEventListener('ended',()=>{
        if(capture.current!==session)return;
        releaseCapture(session);setPhase('idle');setError('Virtual mic disconnected during the test.');
      },{once:true});
      const end=performance.now()+testDuration;
      setPhase('recording');
      session.timer=setInterval(()=>{
        const left=Math.max(0,end-performance.now());
        setLevel(inputLevel(session.recorder.frames.mic?.at(-1)));
        setSeconds(Math.ceil(left/1000));
        if(!left)finish(session);
      },70);
    }catch(e){
      if(capture.current===session){releaseCapture(session);setPhase('idle');setError(e.message);}
      else session.recorder.close();
    }
  }

  async function listen(){
    if(preview.current){releasePreview();setPlaying(false);return;}
    if(!result?.blob||capture.current)return;
    setError('');
    const volume=Math.max(0,Math.min(1,(settings.monitorVolume??70)/100));
    if(settings.monitorMuted||!volume){setError('Unmute headphones and raise the volume to listen.');return;}
    const audio=new Audio(),url=URL.createObjectURL(result.blob);
    const current={audio,url};
    preview.current=current;
    audio.muted=true;
    audio.src=url;
    audio.onended=()=>{if(preview.current===current){releasePreview();setPlaying(false);}};
    try{
      await routePreviewOutput(audio,settings.monitorDevice||'default');
      if(preview.current!==current)return;
      audio.volume=volume;
      audio.muted=false;
      await audio.play();
      if(preview.current===current)setPlaying(true);
    }catch(e){
      if(preview.current===current){releasePreview();setPlaying(false);setError(e.message);}
    }
  }

  return <div className="vm-test">
    <div className="vm-test-controls">
      {phase==='recording'?<button type="button" onClick={()=>finish(capture.current)}><Square size={14} aria-hidden="true"/>{t('Finish mic test')}</button>:
        <button type="button" disabled={disabled||phase==='starting'} onClick={start}><Mic size={14} aria-hidden="true"/>{t(phase==='starting'?'Opening virtual mic…':'Test virtual mic')}</button>}
      {phase==='recording'&&<span className="vm-test-time" aria-hidden="true">{seconds}s</span>}
      {result?.blob&&<button type="button" onClick={listen}><Headphones size={14} aria-hidden="true"/>{t(playing?'Stop listening':'Listen back')}</button>}
    </div>
    {phase==='recording'&&<>
      <meter className="vm-test-level" min={-60} max={0} low={-50} optimum={0} value={Math.round(level)} aria-label={t('Virtual mic input level')}/>
      <p>{t('Speak or play a sound with a shortcut.')}</p>
    </>}
    {result&&<p role="status">{t(result.detected?'Signal detected on virtual mic.':'No signal detected on virtual mic.')}</p>}
    {error&&<p className="vm-error" role="alert">{t(error)}</p>}
  </div>;
}
