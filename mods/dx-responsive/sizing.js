export function workspaceSizing(width) {
  if(width < 900) return {mode:"compact",sidebar:76,panel:null};
  if(width < 1200) return {mode:"medium",sidebar:224,panel:null};
  return {mode:"wide",sidebar:Math.round(Math.min(360,Math.max(280,width*0.22))),panel:Math.round(Math.min(420,width*0.26))};
}
