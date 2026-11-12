export const MAX_TRACK_GAP_SEC = 0.4;
export const HANDEDNESS_CONFIDENCE_MIN = 0.75;
export const FINGERTIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
export const FINGERTIP_PAIRS = [["thumb","index"],["thumb","middle"],["thumb","ring"],["thumb","pinky"],["index","middle"],["index","ring"],["index","pinky"],["middle","ring"],["middle","pinky"],["ring","pinky"]];
export const JOINT_ANGLES = [[1,2,3,"thumb_mcp"],[2,3,4,"thumb_ip"],[5,6,7,"index_pip"],[6,7,8,"index_dip"],[9,10,11,"middle_pip"],[10,11,12,"middle_dip"],[13,14,15,"ring_pip"],[14,15,16,"ring_dip"],[17,18,19,"pinky_pip"],[18,19,20,"pinky_dip"]];
export const WORLD_COORDINATE_SEMANTICS = "Hand-centered world coordinates (m); changes are relative to the estimated hand center, not camera-fixed translation.";
export const LEGACY_FEATURE_NAMES = ["wrist_speed_norm_s", "wrist_speed_world_m_s", "direction_change_deg", ...JOINT_ANGLES.map(x=>`angle_${x[3]}_deg`), ...Object.keys(FINGERTIPS).flatMap(k=>[`relative_${k}_x_norm`,`relative_${k}_y_norm`,`relative_${k}_z_norm`,`${k}_displacement_norm`,`${k}_speed_norm_s`,`${k}_speed_world_m_s`])];
export const NEW_FEATURE_NAMES = [...JOINT_ANGLES.map(x=>`angle_${x[3]}_change_deg`), ...FINGERTIP_PAIRS.map(([a,b])=>`distance_${a}_${b}_norm`)];
export const FEATURE_NAMES = [...LEGACY_FEATURE_NAMES,...NEW_FEATURE_NAMES];
export const STUDY_METADATA_COLUMNS = ["camera_angle","camera_height_cm","camera_to_hand_distance_cm","writing_surface","pen_type","task_type","capture_notes","writing_hand","source_video_mirrored","world_coordinate_semantics"];
export function captureStudyMetadata(input={}) {
  const positiveNumber=v=>{if(v===undefined||v===null||String(v).trim()==="")return "";const n=Number(v);return Number.isFinite(n)&&n>0?n:"";};
  const writingHand=["left","right"].includes(input.writingHand)?input.writingHand:"right";
  return Object.freeze({participantId:String(input.participantId||"").trim(),trialId:String(input.trialId||"").trim(),filename:String(input.filename||""),cameraAngle:String(input.cameraAngle||""),cameraHeightCm:positiveNumber(input.cameraHeightCm),cameraToHandDistanceCm:positiveNumber(input.cameraToHandDistanceCm),writingSurface:String(input.writingSurface||""),penType:String(input.penType||""),taskType:String(input.taskType||""),captureNotes:String(input.captureNotes||""),writingHand,sourceVideoMirrored:Boolean(input.sourceVideoMirrored),worldCoordinateSemantics:WORLD_COORDINATE_SEMANTICS});
}
export function studyMetadataValues(meta={}) { return [meta.cameraAngle||"",meta.cameraHeightCm??"",meta.cameraToHandDistanceCm??"",meta.writingSurface||"",meta.penType||"",meta.taskType||"",meta.captureNotes||"",meta.writingHand||"",Boolean(meta.sourceVideoMirrored),meta.worldCoordinateSemantics||WORLD_COORDINATE_SEMANTICS]; }
export function serializeCsv(header,rows) { if(rows.some(row=>row.length!==header.length))throw new Error("CSV列数とデータ列数が一致しません");return "\uFEFF"+[header.join(","),...rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(","))].join("\r\n"); }

const validPoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function angleDeg(a,b,c) { if(!validPoint(a)||!validPoint(b)||!validPoint(c))return null;const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z],nu=Math.hypot(...u),nv=Math.hypot(...v);if(nu<1e-12||nv<1e-12)return null;const cosine=u.reduce((s,x,i)=>s+x*v[i],0)/(nu*nv);return Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI; }
function vectorsAngle(a,b) { if(!a||!b)return null;const na=Math.hypot(...a),nb=Math.hypot(...b);if(na<1e-12||nb<1e-12)return null;return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/(na*nb))))*180/Math.PI; }

// Greedy one-to-one assignment uses wrist distance, handedness, and a movement gate.
// Tracks survive consecutive sampled frames only; close competing matches remain unknown.
export function assignTrackIds(frames) {
  let active=[],nextId=1;
  for(const frame of frames){
    if(!frame.hands.length){active=[];continue;}
    active=active.filter(t=>frame.frameIndex-t.frameIndex===1&&frame.time-t.time>0&&frame.time-t.time<=MAX_TRACK_GAP_SEC);
    const pairs=[];
    for(let hi=0;hi<frame.hands.length;hi++){const hand=frame.hands[hi],wrist=hand.landmarks?.[0];if(!validPoint(wrist))continue;for(let ti=0;ti<active.length;ti++){const t=active[ti],dt=frame.time-t.time,d=dist(wrist,t.wrist),gate=0.12+1.2*dt;if(d>gate)continue;const mismatch=hand.handedness!=="unknown"&&t.handedness!=="unknown"&&hand.handedness!==t.handedness;pairs.push({hi,ti,cost:d+(mismatch?0.12:0)});}}
    pairs.sort((a,b)=>a.cost-b.cost);const usedH=new Set(),usedT=new Set(),assigned=new Map();
    for(const p of pairs){if(usedH.has(p.hi)||usedT.has(p.ti))continue;const alternatives=pairs.filter(q=>q.hi===p.hi&&q.ti!==p.ti&&!usedT.has(q.ti)).sort((a,b)=>a.cost-b.cost);if(alternatives.length&&alternatives[0].cost-p.cost<0.035)continue;assigned.set(p.hi,active[p.ti].id);usedH.add(p.hi);usedT.add(p.ti);}
    frame.hands.forEach((h,i)=>{if(assigned.has(i)){h.trackId=assigned.get(i);h.trackingStatus="matched";}else if(pairs.some(p=>p.hi===i)){h.trackId=null;h.trackingStatus="unknown";}else if(validPoint(h.landmarks?.[0])){h.trackId=nextId++;h.trackingStatus="new";}else{h.trackId=null;h.trackingStatus="unknown";}});
    active=frame.hands.filter(h=>h.trackId!==null).map(h=>({id:h.trackId,frameIndex:frame.frameIndex,time:frame.time,wrist:h.landmarks[0],handedness:h.handedness}));
  }
  return frames;
}

export function classifyWritingHands(frames,{writingHand="right",mirrored=false,minConfidence=HANDEDNESS_CONFIDENCE_MIN}={}) {
  if(!["left","right"].includes(writingHand))throw new Error("writingHand must be 'left' or 'right'");
  for(const frame of frames){
    const candidates=frame.hands.map(hand=>{const label=String(hand.handedness||"unknown").toLowerCase();const score=Number(hand.handednessScore);if(!["left","right"].includes(label)||!Number.isFinite(score)||score<minConfidence)return "unknown";return mirrored?(label==="left"?"right":"left"):label;});
    const unknownCount=candidates.filter(x=>x==="unknown").length,desired=candidates.reduce((a,x,i)=>x===writingHand?[...a,i]:a,[]),ambiguous=desired.length>1||(desired.length===1&&unknownCount>0);
    frame.writerDetected=false;frame.writingHandStatus=frame.hands.length?"missing":"missing";
    frame.hands.forEach((hand,i)=>{hand.analysisHand=candidates[i];hand.isWritingHand=false;if(candidates[i]==="unknown"){hand.writingSideStatus="unknown";}else if(ambiguous&&candidates[i]===writingHand){hand.writingSideStatus="ambiguous";}else if(candidates[i]===writingHand){hand.isWritingHand=true;hand.writingSideStatus="selected";frame.writerDetected=true;}else{hand.writingSideStatus="other";}});
    if(frame.writerDetected)frame.writingHandStatus="detected";else if(ambiguous)frame.writingHandStatus="ambiguous";else if(frame.hands.some(h=>h.writingSideStatus==="unknown"))frame.writingHandStatus="unknown";
  }
  return frames;
}

export function enrichFrames(frames) {
  assignTrackIds(frames);let previous=new Map();
  for(const frame of frames){
    if(!frame.hands.length){previous.clear();continue;}
    const current=new Map();
    for(const hand of frame.hands){
      const pts=hand.landmarks||[],wrist=pts[0],prev=hand.trackId==null?null:previous.get(hand.trackId),dt=prev?frame.time-prev.time:NaN;
      const continuous=Boolean(prev&&hand.trackingStatus==="matched"&&dt>0&&dt<=MAX_TRACK_GAP_SEC&&frame.frameIndex===prev.frameIndex+1),f=hand.features={};
      f.wrist_speed_norm_s=continuous&&validPoint(wrist)&&validPoint(prev.wrist)?dist(wrist,prev.wrist)/dt:null;
      f.wrist_speed_world_m_s=continuous&&validPoint(hand.worldLandmarks?.[0])&&validPoint(prev.worldWrist)?dist(hand.worldLandmarks[0],prev.worldWrist)/dt:null;
      for(const [a,b,c,name] of JOINT_ANGLES){const key=`angle_${name}_deg`;f[key]=angleDeg(pts[a],pts[b],pts[c]);f[`angle_${name}_change_deg`]=continuous&&Number.isFinite(f[key])&&Number.isFinite(prev.features?.[key])?f[key]-prev.features[key]:null;}
      for(const [name,index] of Object.entries(FINGERTIPS)){
        const tip=pts[index];if(validPoint(tip)&&validPoint(wrist)){f[`relative_${name}_x_norm`]=tip.x-wrist.x;f[`relative_${name}_y_norm`]=tip.y-wrist.y;f[`relative_${name}_z_norm`]=tip.z-wrist.z;}else{f[`relative_${name}_x_norm`]=f[`relative_${name}_y_norm`]=f[`relative_${name}_z_norm`]=null;}
        const old=prev?.landmarks?.[index],oldWorld=prev?.worldLandmarks?.[index];f[`${name}_displacement_norm`]=continuous&&validPoint(tip)&&validPoint(old)?dist(tip,old):null;f[`${name}_speed_norm_s`]=f[`${name}_displacement_norm`]!=null?f[`${name}_displacement_norm`]/dt:null;f[`${name}_speed_world_m_s`]=continuous&&validPoint(hand.worldLandmarks?.[index])&&validPoint(oldWorld)?dist(hand.worldLandmarks[index],oldWorld)/dt:null;
      }
      for(const [a,b] of FINGERTIP_PAIRS){const p=pts[FINGERTIPS[a]],q=pts[FINGERTIPS[b]];f[`distance_${a}_${b}_norm`]=validPoint(p)&&validPoint(q)?dist(p,q):null;}
      const oldVector=prev&&validPoint(wrist)&&validPoint(prev.wrist)?[wrist.x-prev.wrist.x,wrist.y-prev.wrist.y,wrist.z-prev.wrist.z]:null;f.direction_change_deg=continuous?vectorsAngle(prev.priorVector,oldVector):null;
      if(hand.trackId!=null)current.set(hand.trackId,{time:frame.time,frameIndex:frame.frameIndex,wrist,worldWrist:hand.worldLandmarks?.[0],landmarks:pts,worldLandmarks:hand.worldLandmarks,priorVector:oldVector,features:f});
    }
    previous=current;
  }
  return frames;
}

export function stats(values,minN=3) { const clean=values.filter(Number.isFinite),n=clean.length;if(n<minN)return {mean:null,sd:null,n};const mean=clean.reduce((s,x)=>s+x,0)/n,sd=Math.sqrt(clean.reduce((s,x)=>s+(x-mean)**2,0)/(n-1));return {mean,sd,n}; }
export function coefficientOfVariation(values,minN=3) { const result=stats(values,minN);return result.mean!==null&&Math.abs(result.mean)>1e-12?result.sd/Math.abs(result.mean):null; }
function intervalMedian(frames) { const d=frames.slice(1).map((f,i)=>f.time-frames[i].time).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);return d.length?d[Math.floor(d.length/2)]:null; }
function writerQuality(frames,useSelectedHand=true) {
  const dt=intervalMedian(frames);let runs=0,run=0,longest=0,switches=0,unknown=0,lastTrack=null,detected=0;
  for(const frame of frames){const selected=useSelectedHand?frame.hands.filter(h=>h.isWritingHand===true):frame.hands;const present=useSelectedHand?selected.length===1:frame.detected===true;if(present){detected++;if(run){runs++;longest=Math.max(longest,run);run=0;}const id=selected.length===1?selected[0].trackId:null;if(id!=null&&lastTrack!=null&&id!==lastTrack)switches++;if(id!=null)lastTrack=id;}else{run++;if(frame.hands.some(h=>["unknown","ambiguous"].includes(h.writingSideStatus)))unknown++;}}
  if(run){runs++;longest=Math.max(longest,run);}return {writingHandDetectedFrameCount:detected,writingHandMissingFrameCount:frames.length-detected,writingHandUnknownFrameCount:unknown,writingHandDetectionRate:frames.length?detected/frames.length:null,writingHandMissingRate:frames.length?(frames.length-detected)/frames.length:null,missingRunCount:runs,longestMissingRunFrames:longest,longestMissingRunSec:dt===null?null:longest*dt,trackSwitchCount:switches};
}
export function summarizeTrial(frames,meta={}) {
  const detected=frames.filter(f=>f.detected).length,total=frames.length,useSelectedHand=["left","right"].includes(meta.writingHand);
  const scopedFrames=useSelectedHand?frames.map(f=>({...f,hands:f.hands.filter(h=>h.isWritingHand===true)})):frames;
  const row={participant_id:meta.participantId||"",trial_id:meta.trialId||"",video_filename:meta.filename||"",frame_count:total,detected_frame_count:detected,detection_rate:total?detected/total:null,missing_rate:total?(total-detected)/total:null};
  for(const name of LEGACY_FEATURE_NAMES){const s=stats(scopedFrames.flatMap(f=>f.hands.map(h=>h.features?.[name]).filter(Number.isFinite)));row[`${name}_mean`]=s.mean;row[`${name}_sd`]=s.sd;row[`${name}_n`]=s.n;}
  STUDY_METADATA_COLUMNS.slice(0,7).forEach((key,i)=>row[key]=studyMetadataValues(meta)[i]);
  for(const name of NEW_FEATURE_NAMES){const s=stats(scopedFrames.flatMap(f=>f.hands.map(h=>h.features?.[name]).filter(Number.isFinite)));row[`${name}_mean`]=s.mean;row[`${name}_sd`]=s.sd;row[`${name}_n`]=s.n;}
  row.wrist_speed_norm_s_cv=coefficientOfVariation(scopedFrames.flatMap(f=>f.hands.map(h=>h.features?.wrist_speed_norm_s).filter(Number.isFinite)));
  for(const [a,b] of FINGERTIP_PAIRS){const name=`distance_${a}_${b}_norm`;row[`${name}_cv`]=coefficientOfVariation(scopedFrames.flatMap(f=>f.hands.map(h=>h.features?.[name]).filter(Number.isFinite)));}
  const quality=writerQuality(frames,useSelectedHand);row.writing_hand_detected_frame_count=quality.writingHandDetectedFrameCount;row.writing_hand_missing_frame_count=quality.writingHandMissingFrameCount;row.writing_hand_unknown_frame_count=quality.writingHandUnknownFrameCount;row.writing_hand_detection_rate=quality.writingHandDetectionRate;row.writing_hand_missing_rate=quality.writingHandMissingRate;row.missing_run_count=quality.missingRunCount;row.longest_missing_run_frames=quality.longestMissingRunFrames;row.longest_missing_run_sec=quality.longestMissingRunSec;row.track_switch_count=quality.trackSwitchCount;
  STUDY_METADATA_COLUMNS.slice(7).forEach((key,i)=>row[key]=studyMetadataValues(meta)[7+i]);return row;
}

