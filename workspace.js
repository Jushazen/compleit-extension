'use strict';

function pad(n){return String(n).padStart(2,'0');}
function fmt(s){s=Math.max(0,Math.floor(s));return`${pad(Math.floor(s/60))}:${pad(s%60)}`;}
function getToday(){const d=new Date();return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function timeToMins(t){if(!t)return 0;const[h,m]=t.split(':').map(Number);return h*60+m;}
function fmtTime(t){if(!t)return'';const[h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';const h12=h===0?12:h>12?h-12:h;return`${h12}:${pad(m)} ${ap}`;}
function fmtRange(s,e){
  if(!s||!e)return'';
  const[sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);
  const sAP=sh>=12?'PM':'AM',eAP=eh>=12?'PM':'AM';
  const sh12=sh===0?12:sh>12?sh-12:sh,eh12=eh===0?12:eh>12?eh-12:eh;
  if(sAP===eAP)return`${sh12}:${pad(sm)}–${eh12}:${pad(em)} ${eAP}`;
  return`${sh12}:${pad(sm)} ${sAP}–${eh12}:${pad(em)} ${eAP}`;
}

// ── Pomodoro state ───────────────────────────────────────────────────────────
let pS={work:25,shortBreak:5,longBreak:15};
let pT={phase:'work',startedAt:null,remaining:25*60,count:0};
let ticker=null;

function phaseDur(ph){if(ph==='shortBreak')return pS.shortBreak*60;if(ph==='longBreak')return pS.longBreak*60;return pS.work*60;}
function phaseLabel(ph){if(ph==='shortBreak')return'Short Break';if(ph==='longBreak')return'Long Break';return'Work';}
function phaseCls(ph){if(ph==='shortBreak')return'brk';if(ph==='longBreak')return'lbrk';return'';}
function actualRem(){if(!pT.startedAt)return pT.remaining;return Math.max(0,pT.remaining-(Date.now()-pT.startedAt)/1000);}
function isRun(){return pT.startedAt!==null;}
function nextPhase(){
  if(pT.phase==='work'){const c=pT.count+1;const next=c%4===0?'longBreak':'shortBreak';pT={phase:next,startedAt:null,remaining:phaseDur(next),count:c};}
  else{pT={phase:'work',startedAt:null,remaining:phaseDur('work'),count:pT.count};}
}
async function savePom(){chrome.storage.local.set({pomodoroState:pT,pomodoroSettings:pS}).catch(()=>{});}

function renderPom(){
  const rem=actualRem(),cls=phaseCls(pT.phase);
  const timeEl=document.getElementById('ws-time');
  timeEl.textContent=fmt(rem);
  timeEl.className=`ws-time${cls?' '+cls:''}${isRun()?' run':''}`;
  const phEl=document.getElementById('ws-phase');
  phEl.textContent=phaseLabel(pT.phase);
  phEl.className=`ws-phase${cls?' '+cls:''}`;
  document.getElementById('ws-cnt').textContent=pT.count?`${pT.count} done`:'';
  const sb=document.getElementById('ws-start');
  sb.textContent=isRun()?'Pause':(rem<phaseDur(pT.phase)?'Resume':'Start');
  sb.className=`ws-ctrl-main${isRun()?' paused':''}${cls?' '+cls:''}`;
  const dotsEl=document.getElementById('ws-dots'); dotsEl.innerHTML='';
  for(let i=0;i<4;i++){
    const d=document.createElement('div');const s=pT.count%4;
    d.className='ws-p-dot'+(i<s?' filled':'')+(i===s&&pT.phase==='work'?' cur':'');
    dotsEl.appendChild(d);
  }
  document.getElementById('ws-pw').value=pS.work;
  document.getElementById('ws-ps').value=pS.shortBreak;
  document.getElementById('ws-pl').value=pS.longBreak;
  updateCompUI();
}

function startTick(){
  if(ticker)return;
  ticker=setInterval(async()=>{
    const rem=actualRem();renderPom();
    if(rem<=0){
      clearInterval(ticker);ticker=null;
      await new Promise(r=>setTimeout(r,300));
      nextPhase();await savePom();renderPom();
    }
  },250);
}
function stopTick(){clearInterval(ticker);ticker=null;}

// ── Completion state ─────────────────────────────────────────────────────────
let task=null, difficulty='medium';
let activeSeconds=0, requiredActiveSecs=900, initialPomoCount=0;
let activeTimer=null, confirmTimer=null, confirmSecs=90;
let isDone=false;

function pomoDone(){return pT.count>initialPomoCount;}
function activeMet(){return activeSeconds>=requiredActiveSecs;}
function allMediumMet(){return pomoDone()&&activeMet();}
function isPastEnd(){
  if(!task?.endTime)return false;
  const now=new Date();
  const[eh,em]=task.endTime.split(':').map(Number);
  return now.getHours()*60+now.getMinutes()>=eh*60+em;
}
function secsUntilEnd(){
  if(!task?.endTime)return 0;
  const now=new Date();
  const[eh,em]=task.endTime.split(':').map(Number);
  const endSecs=(eh*60+em)*60;
  const nowSecs=(now.getHours()*60+now.getMinutes())*60+now.getSeconds();
  return Math.max(0,endSecs-nowSecs);
}
function calcRequiredActive(){
  if(!task?.startTime||!task?.endTime)return 15*60;
  const dur=timeToMins(task.endTime)-timeToMins(task.startTime);
  return Math.min(Math.max(Math.round(dur*0.5),5),25)*60;
}

// ── Active time tracking ─────────────────────────────────────────────────────
function startActiveTracking(){
  if(activeTimer||document.visibilityState!=='visible')return;
  activeTimer=setInterval(()=>{
    activeSeconds++;
    if(activeSeconds%15===0)saveActiveTime();
    updateCompUI();
  },1000);
}
function stopActiveTracking(){clearInterval(activeTimer);activeTimer=null;}
async function saveActiveTime(){
  if(!task)return;
  const{taskActiveTime={}}=await chrome.storage.local.get('taskActiveTime');
  taskActiveTime[task.id]=activeSeconds;
  chrome.storage.local.set({taskActiveTime});
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')startActiveTracking();
  else{stopActiveTracking();saveActiveTime();}
});

// ── Completion UI ─────────────────────────────────────────────────────────────
function updateCompUI(){
  if(!task||isDone)return;
  const mark=document.getElementById('ws-mark');

  if(difficulty==='easy'){
    if(document.getElementById('ws-cdown').style.display==='none')
      mark.className='ws-mark-btn ready';

  }else if(difficulty==='medium'){
    const pd=pomoDone(),am=activeMet();
    document.getElementById('ws-pdot').className=`ws-dot${pd?' met':''}`;
    document.getElementById('ws-plbl').className=`ws-req-lbl${pd?' met':''}`;
    document.getElementById('ws-plbl').textContent=`Pomodoro: ${Math.max(0,pT.count-initialPomoCount)} / 1 session`;
    document.getElementById('ws-adot').className=`ws-dot${am?' met':''}`;
    document.getElementById('ws-albl').className=`ws-req-lbl${am?' met':''}`;
    document.getElementById('ws-albl').textContent=`Active: ${Math.floor(activeSeconds/60)} / ${Math.floor(requiredActiveSecs/60)} min`;
    const ready=pd&&am;
    mark.className=`ws-mark-btn${ready?' ready':''}`;
    mark.textContent=ready&&!isPastEnd()?'Mark as done (early)':'Mark as done';

  }else if(difficulty==='hard'){
    const past=isPastEnd();
    mark.className=`ws-mark-btn${past?' ready':''}`;
    if(!past){
      const s=secsUntilEnd(),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
      document.getElementById('ws-htime').textContent=h>0?`${h}:${pad(m)}:${pad(sec)}`:`${pad(m)}:${pad(sec)}`;
      document.getElementById('ws-hsub').textContent=`until ${fmtTime(task.endTime)}`;
    }else{
      document.getElementById('ws-htime').textContent='';
      document.getElementById('ws-hsub').textContent='Time window complete';
    }
  }
}

// ── Completion actions ───────────────────────────────────────────────────────
async function markComplete(){
  if(isDone)return; isDone=true;
  stopTick();stopActiveTracking();clearInterval(confirmTimer);
  if(isRun()){pT.remaining=actualRem();pT.startedAt=null;} await savePom();
  await saveNotes();

  const{tasks=[],completionHistory={},taskActiveTime={}}=
    await chrome.storage.local.get(['tasks','completionHistory','taskActiveTime']);
  const today=getToday();
  const updated=tasks.map(t=>{
    if(t.id!==task.id)return t;
    return t.repeat?.type==='off'?{...t,completed:true}:{...t,lastCompletedDate:today};
  });
  completionHistory[today]=(completionHistory[today]||0)+1;
  delete taskActiveTime[task.id];
  await chrome.storage.local.set({tasks:updated,completionHistory,taskActiveTime});

  const isRepeat=task.repeat?.type!=='off';
  document.getElementById('ws-done-title').textContent=isRepeat?'Done for today':'Task complete';
  document.getElementById('ws-done-sub').textContent=isRepeat?'Resets tomorrow':'Marked as complete';
  document.getElementById('ws-done').style.display='flex';
}

function startCountdown(){
  document.getElementById('ws-mark').style.display='none';
  document.getElementById('ws-cdown').style.display='flex';
  confirmSecs=90;
  const tick=()=>{
    document.getElementById('ws-cdlbl').textContent=`Confirming in ${fmt(confirmSecs)}`;
    confirmSecs--;
    if(confirmSecs<0){clearInterval(confirmTimer);markComplete();}
  };
  tick();confirmTimer=setInterval(tick,1000);
}

function showReflection(){
  const mins=Math.round(secsUntilEnd()/60);
  document.getElementById('ws-rlbl').textContent=`Completing ${mins} min early — what did you accomplish?`;
  document.getElementById('ws-mark').style.display='none';
  document.getElementById('ws-reflect').style.display='flex';
  document.getElementById('ws-rta').value='';
  document.getElementById('ws-rcnt').textContent='0 / 30';
  document.getElementById('ws-rsub').disabled=true;
  setTimeout(()=>document.getElementById('ws-rta').focus(),50);
}

// ── Notes auto-save ──────────────────────────────────────────────────────────
let saveTimer=null;
async function saveNotes(){
  if(!task)return;
  const text=document.getElementById('ws-notes').value;
  const{taskNotes={}}=await chrome.storage.local.get('taskNotes');
  taskNotes[task.id]=text;
  await chrome.storage.local.set({taskNotes});
  const st=document.getElementById('ws-save-status');
  st.textContent='Saved';setTimeout(()=>{if(st.textContent==='Saved')st.textContent='';},2000);
}
document.getElementById('ws-notes').addEventListener('input',()=>{
  clearTimeout(saveTimer);saveTimer=setTimeout(saveNotes,3000);
});

// ── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('ws-start').addEventListener('click',async()=>{
  if(isRun()){pT.remaining=actualRem();pT.startedAt=null;stopTick();}
  else{pT.startedAt=Date.now();startTick();}
  await savePom();renderPom();
});
document.getElementById('ws-reset').addEventListener('click',async()=>{stopTick();pT.remaining=phaseDur(pT.phase);pT.startedAt=null;await savePom();renderPom();});
document.getElementById('ws-skip').addEventListener('click',async()=>{stopTick();nextPhase();await savePom();renderPom();});
document.getElementById('ws-psave').addEventListener('click',async()=>{
  const w=parseInt(document.getElementById('ws-pw').value,10);
  const s=parseInt(document.getElementById('ws-ps').value,10);
  const l=parseInt(document.getElementById('ws-pl').value,10);
  if(!w||!s||!l)return;
  pS={work:w,shortBreak:s,longBreak:l};
  if(!isRun()){pT.remaining=phaseDur(pT.phase);pT.startedAt=null;}
  await savePom();renderPom();
});

document.getElementById('ws-mark').addEventListener('click',()=>{
  const mark=document.getElementById('ws-mark');
  if(!mark.classList.contains('ready'))return;
  if(difficulty==='easy'){startCountdown();}
  else if(difficulty==='medium'){if(!allMediumMet())return;if(!isPastEnd())showReflection();else markComplete();}
  else if(difficulty==='hard'){if(isPastEnd())markComplete();}
});
document.getElementById('ws-cancel').addEventListener('click',()=>{
  clearInterval(confirmTimer);
  document.getElementById('ws-cdown').style.display='none';
  document.getElementById('ws-mark').style.display='block';
  updateCompUI();
});
document.getElementById('ws-rta').addEventListener('input',e=>{
  const n=e.target.value.trim().length;
  document.getElementById('ws-rcnt').textContent=`${n} / 30`;
  document.getElementById('ws-rsub').disabled=n<30;
});
document.getElementById('ws-rsub').addEventListener('click',markComplete);

window.addEventListener('beforeunload',()=>{
  if(isRun()){pT.remaining=actualRem();pT.startedAt=null;savePom();}
  saveActiveTime();saveNotes();
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init(){
  const taskId=new URLSearchParams(window.location.search).get('taskId');
  const{tasks=[],settings:s={},pomodoroState,pomodoroSettings,taskActiveTime={},taskNotes={}}=
    await chrome.storage.local.get(['tasks','settings','pomodoroState','pomodoroSettings','taskActiveTime','taskNotes']);

  task=tasks.find(t=>t.id===taskId);
  if(!task){
    document.getElementById('ws-title').textContent='Task not found';
    document.getElementById('ws-timerange').textContent='This task no longer exists.';
    return;
  }

  if(pomodoroSettings)pS={...pS,...pomodoroSettings};
  difficulty=s.difficulty||'medium';

  if(pomodoroState){
    pT=pomodoroState;
    if(pT.startedAt){const rem=actualRem();if(rem<=0)nextPhase();else{pT.remaining=rem;pT.startedAt=null;}}
  }else{pT.remaining=phaseDur(pT.phase);}

  document.title=`${task.name} — Compleit`;
  document.getElementById('ws-title').textContent=task.name;
  document.getElementById('ws-timerange').textContent=fmtRange(task.startTime,task.endTime)||'No time set';

  const badge=document.getElementById('ws-diff-badge');
  badge.textContent=difficulty.charAt(0).toUpperCase()+difficulty.slice(1);
  badge.className=`diff-badge ${difficulty}`;

  document.getElementById('ws-notes').value=taskNotes[task.id]||'';

  activeSeconds=taskActiveTime[task.id]||0;
  requiredActiveSecs=calcRequiredActive();
  initialPomoCount=pT.count;

  document.getElementById('ws-req').style.display=difficulty==='medium'?'flex':'none';
  document.getElementById('ws-hard').style.display=difficulty==='hard'?'flex':'none';

  if(difficulty==='hard'&&!isPastEnd())setInterval(updateCompUI,1000);

  renderPom();
  if(isRun())startTick();
  startActiveTracking();
}

init();
