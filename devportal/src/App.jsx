import { useState, useEffect, useRef, useCallback, memo } from "react";

const AI_URL    = "http://localhost:8000";
const BKSTG_URL = "";

const DS = {
  bg0:"#050C17",bg1:"#080F1C",bg2:"#0C1524",bg3:"#101B2C",bg4:"#142033",bg5:"#1A2840",
  b1:"rgba(255,255,255,0.05)",b2:"rgba(255,255,255,0.08)",b3:"rgba(255,255,255,0.12)",b4:"rgba(255,255,255,0.20)",
  t1:"#F2F6FC",t2:"#A8BDCF",t3:"#6580A0",t4:"#344D68",
  ac:"#2478E4",acH:"#3D8EF2",acGlow:"rgba(36,120,228,0.18)",
  ok:"#16A362",okBg:"rgba(22,163,98,0.12)",okBd:"rgba(22,163,98,0.25)",
  wa:"#D08B00",waBg:"rgba(208,139,0,0.12)",waBd:"rgba(208,139,0,0.25)",
  er:"#D43B3B",erBg:"rgba(212,59,59,0.12)",erBd:"rgba(212,59,59,0.25)",
  inBg:"rgba(36,120,228,0.10)",inBd:"rgba(36,120,228,0.22)",
  puBg:"rgba(107,86,232,0.10)",puBd:"rgba(107,86,232,0.22)",
  teBg:"rgba(12,165,165,0.10)",teBd:"rgba(12,165,165,0.22)",te:"#0CA5A5",
  sh1:"0 1px 2px rgba(0,0,0,0.4)",sh2:"0 2px 8px rgba(0,0,0,0.35)",
  shAc:"0 0 0 1px rgba(36,120,228,0.4), 0 0 12px rgba(36,120,228,0.15)",
  sans:"'DM Sans',system-ui,sans-serif",mono:"'DM Mono','Fira Code',monospace",
  r6:6,r8:8,r10:10,
};

const GLOBAL=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden}
body{font-family:'DM Sans',system-ui,sans-serif;background:#050C17;color:#A8BDCF;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
input,textarea,select,button{font-family:inherit}
button{cursor:pointer}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes growIn{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.page-enter{animation:fadeUp .2s cubic-bezier(.16,1,.3,1) both}
.s1{animation:fadeUp .2s .04s cubic-bezier(.16,1,.3,1) both}
.s2{animation:fadeUp .2s .08s cubic-bezier(.16,1,.3,1) both}
.s3{animation:fadeUp .2s .12s cubic-bezier(.16,1,.3,1) both}
.s4{animation:fadeUp .2s .16s cubic-bezier(.16,1,.3,1) both}
`;

const BADGE={
  green:{bg:"rgba(22,163,98,0.12)",c:"#22C77A",bd:"rgba(22,163,98,0.25)"},
  amber:{bg:"rgba(208,139,0,0.12)",c:"#F0B429",bd:"rgba(208,139,0,0.25)"},
  red:{bg:"rgba(212,59,59,0.12)",c:"#F07070",bd:"rgba(212,59,59,0.25)"},
  blue:{bg:"rgba(36,120,228,0.10)",c:"#60A8F8",bd:"rgba(36,120,228,0.22)"},
  teal:{bg:"rgba(12,165,165,0.10)",c:"#2DBDBD",bd:"rgba(12,165,165,0.22)"},
  purple:{bg:"rgba(107,86,232,0.10)",c:"#A594F5",bd:"rgba(107,86,232,0.22)"},
  gray:{bg:"rgba(255,255,255,0.06)",c:"#6580A0",bd:"rgba(255,255,255,0.10)"},
};

const Badge=memo(({color="gray",children})=>{
  const s=BADGE[color]||BADGE.gray;
  return <span style={{display:"inline-flex",alignItems:"center",fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,border:`1px solid ${s.bd}`,background:s.bg,color:s.c,whiteSpace:"nowrap"}}>{children}</span>;
});

const Dot=({status="ok",animated=false})=>{
  const c={ok:DS.ok,warn:DS.wa,err:DS.er,info:DS.ac}[status]||DS.ok;
  return <span style={{width:7,height:7,borderRadius:"50%",background:c,flexShrink:0,display:"inline-block",animation:animated?"pulse 2s ease-in-out infinite":undefined}}/>;
};

const Spinner=({size=14})=>(
  <div style={{width:size,height:size,border:`1.5px solid rgba(255,255,255,0.08)`,borderTopColor:DS.ac,borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
);

const Card=({children,style={},onClick})=>(
  <div onClick={onClick} style={{background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:DS.r10,overflow:"hidden",boxShadow:DS.sh1,transition:"border-color .15s,box-shadow .15s",cursor:onClick?"pointer":undefined,...style}}
    onMouseEnter={ev=>{ev.currentTarget.style.borderColor=DS.b3;ev.currentTarget.style.boxShadow=DS.sh2;}}
    onMouseLeave={ev=>{ev.currentTarget.style.borderColor=DS.b2;ev.currentTarget.style.boxShadow=DS.sh1;}}>
    {children}
  </div>
);

const CardHeader=({left,right,sub})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${DS.b1}`}}>
    <div>
      <div style={{fontSize:12,fontWeight:600,color:DS.t1}}>{left}</div>
      {sub&&<div style={{fontSize:10.5,color:DS.t4,marginTop:2}}>{sub}</div>}
    </div>
    {right}
  </div>
);

const Row=({label,value,mono=false,last=false})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:last?"none":`1px solid ${DS.b1}`,fontSize:12}}>
    <span style={{color:DS.t3}}>{label}</span>
    <span style={{fontWeight:500,color:DS.t1,fontFamily:mono?DS.mono:undefined,fontSize:mono?11:undefined}}>{value}</span>
  </div>
);

const Bar=({pct,color=DS.ac,height=4})=>(
  <div style={{width:"100%",height,background:DS.bg5,borderRadius:height}}>
    <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:height,transformOrigin:"left",animation:"growIn .6s cubic-bezier(.16,1,.3,1) both"}}/>
  </div>
);

const NAV=[
  {sec:"OVERVIEW",items:[{id:"dashboard",label:"Dashboard"}]},
  {sec:"CATALOG",items:[{id:"catalog",label:"Service catalog"},{id:"insights",label:"Tech insights"}]},
  {sec:"INTELLIGENCE",items:[{id:"copilot",label:"AI copilot",live:true}]},
  {sec:"PLATFORM",items:[{id:"health",label:"Platform health"},{id:"infra",label:"Infrastructure"},{id:"golden",label:"Golden thread"}]},
  {sec:"CREATE",items:[{id:"newservice",label:"New service"}]},
];

const ICONS={
  dashboard:<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/></svg>,
  catalog:<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  insights:<svg viewBox="0 0 16 16" fill="none"><path d="M2 11.5l3.5-4 2.5 2.5 3.5-5 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  copilot:<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3"/><circle cx="5.5" cy="7" r="1" fill="currentColor"/><circle cx="8" cy="7" r="1" fill="currentColor"/><circle cx="10.5" cy="7" r="1" fill="currentColor"/></svg>,
  health:<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 8h3l1.5-3 2.5 6 1.5-3h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  infra:<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  golden:<svg viewBox="0 0 16 16" fill="none"><circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="13" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4.5 8h2M9.5 8h2" stroke="currentColor" strokeWidth="1.3"/></svg>,
  newservice:<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  search:<svg viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  bell:<svg viewBox="0 0 16 16" fill="none"><path d="M8 1.5a5 5 0 015 5v2.5l1.5 2H1.5L3 9V6.5a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 12.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3"/></svg>,
  plus:<svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  chevRight:<svg viewBox="0 0 12 12" fill="none"><path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  logo:<svg viewBox="0 0 20 20" fill="none"><path d="M3 10L10 3L17 10L10 17Z" stroke="white" strokeWidth="1.8"/><circle cx="10" cy="10" r="3" fill="white"/></svg>,
  ai:<svg viewBox="0 0 16 16" fill="none"><path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
};

const Icon=({id,size=14})=>(
  <span style={{width:size,height:size,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    {ICONS[id]?<span style={{width:"100%",height:"100%",display:"flex"}}>{ICONS[id]}</span>:null}
  </span>
);

function Sidebar({active,onNav,live}){
  return(
    <aside style={{width:216,flexShrink:0,background:DS.bg2,borderRight:`1px solid ${DS.b1}`,display:"flex",flexDirection:"column",height:"100vh"}}>
      <div style={{padding:"16px 14px 14px",borderBottom:`1px solid ${DS.b1}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:13}}>
          <div style={{width:28,height:28,borderRadius:8,background:DS.ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <Icon id="logo" size={16}/>
          </div>
          <div>
            <div style={{fontSize:13.5,fontWeight:700,color:DS.t1,letterSpacing:"-.03em"}}>Zayo DevPortal</div>
            <div style={{fontSize:9,color:DS.t4,textTransform:"uppercase",letterSpacing:".1em",marginTop:1}}>Platform Engineering</div>
          </div>
        </div>
        <button onClick={()=>onNav("copilot")} style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"7px 10px",color:DS.t4,fontSize:12,cursor:"pointer",transition:"all .12s",textAlign:"left"}}
          onMouseEnter={ev=>{ev.currentTarget.style.background=DS.bg4;ev.currentTarget.style.borderColor=DS.b3;}}
          onMouseLeave={ev=>{ev.currentTarget.style.background=DS.bg5;ev.currentTarget.style.borderColor=DS.b2;}}>
          <Icon id="search" size={12}/> Search or ask AI…
          <kbd style={{marginLeft:"auto",background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:4,padding:"1px 5px",fontFamily:DS.mono,fontSize:9.5,color:DS.t4}}>⌘K</kbd>
        </button>
      </div>
      <nav style={{flex:1,overflowY:"auto",padding:"8px"}}>
        {NAV.map(group=>(
          <div key={group.sec}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",color:DS.t4,padding:"10px 8px 5px",textTransform:"uppercase"}}>{group.sec}</div>
            {group.items.map(item=>{
              const isActive=active===item.id;
              return(
                <button key={item.id} onClick={()=>onNav(item.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:DS.r6,background:isActive?DS.acGlow:"transparent",border:`1px solid ${isActive?DS.inBd:"transparent"}`,color:isActive?DS.t1:DS.t3,cursor:"pointer",fontSize:13,fontWeight:isActive?500:400,transition:"all .1s",textAlign:"left",marginBottom:1,boxShadow:isActive?DS.shAc:"none"}}
                  onMouseEnter={ev=>{if(!isActive){ev.currentTarget.style.background=DS.bg4;ev.currentTarget.style.color=DS.t2;}}}
                  onMouseLeave={ev=>{if(!isActive){ev.currentTarget.style.background="transparent";ev.currentTarget.style.color=DS.t3;}}}>
                  <Icon id={item.id} size={14}/>
                  <span style={{flex:1}}>{item.label}</span>
                  {item.live&&<span style={{fontSize:9,fontWeight:700,color:DS.ok,background:DS.okBg,border:`1px solid ${DS.okBd}`,borderRadius:10,padding:"1px 5px",display:"flex",alignItems:"center",gap:3}}><span style={{width:4,height:4,borderRadius:"50%",background:DS.ok,animation:"pulse 2s infinite"}}/>LIVE</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{padding:"10px 12px",borderTop:`1px solid ${DS.b1}`}}>
        {live==="connected"
          ?<div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:DS.ok,fontWeight:500}}><Dot status="ok" animated/>Connected · EKS us-east-1</div>
          :live==="loading"
          ?<div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:DS.t3}}><Spinner size={10}/>Connecting…</div>
          :<div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:DS.t4}}><Dot status="warn"/>Demo mode · start port-forwards</div>}
      </div>
      <div style={{padding:"10px 12px",borderTop:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${DS.ac},${DS.te})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"white",flexShrink:0}}>AJ</div>
        <div>
          <div style={{fontSize:12.5,fontWeight:600,color:DS.t1}}>Ajith Kattil</div>
          <div style={{fontSize:10,color:DS.t4}}>Platform Lead</div>
        </div>
      </div>
    </aside>
  );
}

const CRUMBS={dashboard:"Dashboard",catalog:"Service catalog",insights:"Tech insights",copilot:"AI copilot",health:"Platform health",infra:"Infrastructure",golden:"Golden thread",newservice:"New service"};

function Topbar({screen,onNav}){
  return(
    <header style={{height:50,flexShrink:0,background:DS.bg2,borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",padding:"0 20px",gap:12}}>
      <div style={{flex:1,display:"flex",alignItems:"center",gap:6,fontSize:12,color:DS.t4}}>
        <span>Platform</span>
        <Icon id="chevRight" size={10}/>
        <span style={{color:DS.t2,fontWeight:500}}>{CRUMBS[screen]||screen}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button style={{width:32,height:32,borderRadius:DS.r8,background:"transparent",border:`1px solid ${DS.b2}`,display:"flex",alignItems:"center",justifyContent:"center",color:DS.t3,position:"relative"}}>
          <Icon id="bell" size={13}/>
          <div style={{position:"absolute",top:7,right:7,width:5,height:5,borderRadius:"50%",background:DS.er,border:`1.5px solid ${DS.bg1}`}}/>
        </button>
        <button onClick={()=>onNav("newservice")} style={{display:"flex",alignItems:"center",gap:6,background:DS.ac,border:"none",borderRadius:DS.r8,padding:"7px 14px",color:"white",fontWeight:600,fontSize:12.5,cursor:"pointer"}}>
          <Icon id="plus" size={11}/>New service
        </button>
      </div>
    </header>
  );
}

function Dashboard({live,onNav}){
  const dora=live?.dora||{df:"3.2",lt:"2.1",cfr:"8",mttr:"47"};
  const stats=[
    {label:"Deploy frequency",val:dora.df,unit:"/day",trend:"+0.4 vs last week",up:true,pct:64},
    {label:"Lead time",val:dora.lt,unit:"days",trend:"−0.6d improvement",up:true,pct:72},
    {label:"Change fail rate",val:dora.cfr,unit:"%",trend:"−2% vs last week",up:true,pct:92},
    {label:"MTTR",val:dora.mttr,unit:"min",trend:"+8min · target <30",up:false,pct:43},
  ];
  const pipelines=[
    {name:"zayo-platform-ai",s:[1,1,1,1,1,1,1],st:"green",time:"4m 12s"},
    {name:"spring-orders-poc",s:[1,1,1,1,1,2,0],st:"blue",time:"running"},
    {name:"billing-service",s:[1,3,0,0,0,0,0],st:"red",time:"2m 08s"},
    {name:"auth-gateway",s:[1,1,1,1,1,1,1],st:"green",time:"3m 55s"},
  ];
  const SC={1:DS.ok,2:DS.ac,3:DS.er,0:DS.b3};
  const activity=[
    {c:DS.ok,t:<><strong style={{color:DS.t1}}>zayo-platform-ai</strong> v1.0.0 deployed · ArgoCD sync · 1/1 healthy</>,time:"2m"},
    {c:DS.ac,t:<><strong style={{color:DS.t1}}>spring-orders-poc</strong> pipeline running · stage 6/7</>,time:"14m"},
    {c:DS.wa,t:<>AWS SSO expires in <strong style={{color:DS.t1}}>6 hours</strong> · update GitLab CI/CD vars</>,time:"31m"},
    {c:DS.ok,t:<>Backstage: <strong style={{color:DS.t1}}>2 services</strong> registered · catalog healthy</>,time:"1h"},
    {c:DS.te,t:<>Copilot: <strong style={{color:DS.t1}}>12 queries</strong> · Claude Sonnet 4 · avg 960ms</>,time:"2h"},
    {c:DS.er,t:<>ArgoCD applicationset <strong style={{color:DS.t1}}>CrashLoop</strong> · non-critical</>,time:"3h"},
  ];
  const integrations=[
    {name:"GitLab CI/CD",st:"ok",val:"8 pipelines · 6 green"},
    {name:"ArgoCD",st:"ok",val:"3/3 apps healthy"},
    {name:"EKS",st:"ok",val:"3 pods running"},
    {name:"Backstage",st:"ok",val:`${live?.entities?.length||2} entities`},
    {name:"Claude API",st:live?.health?"ok":"warn",val:live?.health?"~960ms":"not connected"},
    {name:"AWS SSO",st:"warn",val:"expires ~6h"},
  ];
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div className="s1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Good morning, Ajith</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Foundation phase · {live?.services||47} services · EKS us-east-1 · all systems operational</div>
      </div>
      <div className="s2" style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:0,background:DS.okBg,border:`1px solid ${DS.okBd}`,borderRadius:DS.r8,overflow:"hidden"}}>
        {[["ok","GitLab CI/CD"],["ok","ArgoCD"],["ok","EKS"],["ok","Claude API"],["ok","Backstage"],["ok","ECR"],["warn","AWS SSO · 6h"]].map(([s,l],i,arr)=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRight:i<arr.length-1?`1px solid ${DS.okBd}`:"none",fontSize:11}}>
            <Dot status={s}/><span style={{color:s==="warn"?DS.wa:DS.t2,fontWeight:s==="warn"?500:400}}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {stats.map((s,i)=>(
          <div key={i} className={`s${i+1}`} style={{background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:DS.r10,padding:"16px 18px",boxShadow:DS.sh1,transition:"all .15s"}}
            onMouseEnter={ev=>{ev.currentTarget.style.borderColor=DS.b3;ev.currentTarget.style.boxShadow=DS.sh2;}}
            onMouseLeave={ev=>{ev.currentTarget.style.borderColor=DS.b2;ev.currentTarget.style.boxShadow=DS.sh1;}}>
            <div style={{fontSize:10,fontWeight:600,color:DS.t4,textTransform:"uppercase",letterSpacing:".09em",marginBottom:12}}>{s.label}</div>
            <div style={{fontSize:28,fontWeight:700,color:DS.t1,letterSpacing:"-.05em",lineHeight:1,marginBottom:6}}>{s.val}<span style={{fontSize:14,fontWeight:400,color:DS.t3}}> {s.unit}</span></div>
            <div style={{fontSize:11,color:s.up?"#22C77A":DS.er,marginBottom:10,fontWeight:500}}>{s.up?"↑":"↓"} {s.trend}</div>
            <Bar pct={s.pct} color={s.up?DS.ok:DS.er}/>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.05fr",gap:12}}>
        <Card>
          <CardHeader left="Platform health" right={<button onClick={()=>onNav("health")} style={{background:"none",border:"none",color:DS.ac,fontSize:11,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>View <Icon id="chevRight" size={10}/></button>}/>
          <div style={{padding:"4px 16px 12px"}}>
            {integrations.map((it,i)=>(
              <div key={it.name} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<integrations.length-1?`1px solid ${DS.b1}`:"none"}}>
                <Dot status={it.st}/><span style={{fontSize:12.5,color:DS.t2,flex:1}}>{it.name}</span>
                <span style={{fontSize:11,color:DS.t3,fontFamily:DS.mono}}>{it.val}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader left="Activity feed" sub="All integrations · real-time"/>
          <div style={{padding:"4px 16px 12px"}}>
            {activity.map((a,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:i<activity.length-1?`1px solid ${DS.b1}`:"none"}}>
                <div style={{width:20,height:20,borderRadius:5,background:`${a.c}18`,border:`1px solid ${a.c}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:a.c}}/>
                </div>
                <div style={{flex:1,fontSize:11.5,color:DS.t2,lineHeight:1.5}}>{a.t}</div>
                <span style={{fontSize:10,color:DS.t4,whiteSpace:"nowrap"}}>{a.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader left="Pipeline activity" sub="lint → SAST → test → build → ecr-push → deploy" right={<button onClick={()=>onNav("golden")} style={{background:"none",border:"none",color:DS.ac,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>Golden thread <Icon id="chevRight" size={10}/></button>}/>
        <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:9}}>
          {pipelines.map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:11.5,fontWeight:500,color:DS.t1,width:160,flexShrink:0,fontFamily:DS.mono}}>{p.name}</div>
              <div style={{display:"flex",gap:3,flex:1}}>
                {p.s.map((s,j)=><div key={j} style={{height:5,flex:1,borderRadius:3,background:SC[s]||DS.b3,opacity:s===0?.3:1,animation:s===2?"pulse 1.2s ease-in-out infinite":undefined}}/>)}
              </div>
              <div style={{width:55,textAlign:"right"}}><Badge color={p.st}>{p.st==="green"?"passed":p.st==="blue"?"running":"failed"}</Badge></div>
              <div style={{width:55,textAlign:"right",fontSize:10,color:DS.t4,fontFamily:DS.mono}}>{p.time}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Catalog({live}){
  const [filter,setFilter]=useState("All");
  const demo=[
    {name:"zayo-platform-ai",type:"C",system:"developer-platform",owner:"platform-engineering",lang:"Python 3.11",target:"EKS",s:[1,1,1,1,1,1,1],st:"green",domain:"Platform"},
    {name:"spring-orders-poc",type:"C",system:"order-fulfillment",owner:"orders-team",lang:"Java 17",target:"EKS",s:[1,1,1,1,1,2,0],st:"blue",domain:"Order Mgmt"},
    {name:"auth-gateway",type:"C",system:"security-system",owner:"platform-eng",lang:".NET 8",target:"EKS",s:[1,1,1,1,1,1,1],st:"green",domain:"Platform"},
    {name:"billing-service",type:"C",system:"billing-system",owner:"finance-eng",lang:"Java 17",target:"EKS",s:[1,3,0,0,0,0,0],st:"red",domain:"Finance"},
    {name:"notification-worker",type:"C",system:"comms-system",owner:"cx-team",lang:"Python 3.11",target:"Lambda",s:[1,1,3,0,0,0,0],st:"red",domain:"CX"},
    {name:"shared-postgres",type:"R",system:"data-infra",owner:"platform-eng",lang:"PostgreSQL",target:"RDS",s:[1,1,1,1,1,1,1],st:"green",domain:"Platform"},
  ];
  const live2=(live?.entities||[]).filter(e=>!demo.find(d=>d.name===e.metadata?.name)).map(e=>({name:e.metadata?.name,type:"C",system:e.spec?.system||"—",owner:e.spec?.owner||"—",lang:"—",target:"EKS",s:[1,1,1,1,1,1,1],st:"green",domain:"Platform"}));
  const all=[...demo,...live2];
  const SC={1:DS.ok,2:DS.ac,3:DS.er,0:DS.b3};
  const SB={green:["green","Healthy"],blue:["blue","Running"],red:["red","Failed"]};
  const TC={C:{bg:DS.inBg,c:"#60A8F8"},A:{bg:DS.puBg,c:"#A594F5"},R:{bg:DS.teBg,c:"#2DBDBD"}};
  const domains=[...new Set(all.map(e=>e.domain))];
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="s1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Service catalog</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Live from Backstage API · {all.length} entities</div>
      </div>
      <div className="s2" style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:12}}>
        <Card style={{padding:"12px 10px",alignSelf:"start"}}>
          <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:DS.t4,padding:"0 4px",marginBottom:10}}>Domains</div>
          {domains.map(d=>(
            <div key={d} style={{marginBottom:6}}>
              <div style={{fontSize:11.5,fontWeight:600,color:DS.t2,padding:"3px 6px",display:"flex",alignItems:"center",gap:5}}>▾ {d}</div>
              <div style={{paddingLeft:18,marginTop:2}}>
                {all.filter(e=>e.domain===d).map(e=>(
                  <div key={e.name} style={{fontSize:10.5,color:DS.t4,padding:"2px 5px",cursor:"pointer",fontFamily:DS.mono}}
                    onMouseEnter={ev=>ev.currentTarget.style.color=DS.ac}
                    onMouseLeave={ev=>ev.currentTarget.style.color=DS.t4}>↳ {e.name}</div>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
            {["All","Component","API","Resource"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?DS.acGlow:"transparent",border:`1px solid ${filter===f?DS.inBd:DS.b2}`,borderRadius:DS.r6,padding:"4px 10px",fontSize:11.5,color:filter===f?DS.t1:DS.t3,cursor:"pointer",fontWeight:filter===f?500:400}}>
                {f}
              </button>
            ))}
            <span style={{marginLeft:"auto",fontSize:11,color:DS.t4}}>{all.length} entities</span>
          </div>
          <Card>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                {["","Service","System","Owner","Stack","Target","Pipeline","Status"].map(h=>(
                  <th key={h} style={{textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",color:DS.t4,padding:"0 10px 8px",borderBottom:`1px solid ${DS.b2}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {all.map((e,i)=>{
                  const tc=TC[e.type]||TC.C;
                  const [sc,sl]=SB[e.st]||["gray","Unknown"];
                  return(
                    <tr key={i} style={{transition:"background .1s",cursor:"pointer"}}
                      onMouseEnter={ev=>ev.currentTarget.style.background=DS.bg4}
                      onMouseLeave={ev=>ev.currentTarget.style.background=""}>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`,width:36}}>
                        <div style={{width:24,height:24,borderRadius:6,background:tc.bg,color:tc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:800}}>{e.type}</div>
                      </td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}>
                        <div style={{fontSize:12.5,fontWeight:600,color:DS.t1}}>{e.name}</div>
                        <div style={{fontSize:10,color:DS.t4,marginTop:1}}>{e.domain}</div>
                      </td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}><Badge color="blue">{e.system}</Badge></td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`,fontSize:12,color:DS.t3}}>{e.owner}</td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`,fontSize:11,color:DS.t4,fontFamily:DS.mono}}>{e.lang}</td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}><Badge color="teal">{e.target}</Badge></td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}>
                        <div style={{display:"flex",gap:3}}>{e.s.map((s,j)=><div key={j} style={{width:6,height:6,borderRadius:"50%",background:SC[s]||DS.b3,opacity:s===0?.3:1}}/>)}</div>
                      </td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}><Badge color={sc}>{sl}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Copilot({live}){
  const [msgs,setMsgs]=useState([{role:"ai",text:"I have context on your POC — zayo-platform-ai and spring-orders-poc are live on EKS. Backstage catalog is running headless. How can I help?"}]);
  const [input,setInput]=useState("");
  const [thinking,setThinking]=useState(false);
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const send=async(text)=>{
    const q=(text||input).trim();
    if(!q||thinking)return;
    setInput("");
    setMsgs(m=>[...m,{role:"user",text:q}]);
    setThinking(true);
    try{
      const res=await fetch(`${AI_URL}/api/v1/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,context:"Zayo IDP POC on EKS us-east-1. zayo-platform-ai (Python/FastAPI), spring-orders-poc (Java Spring Boot), Backstage headless catalog."})});
      const d=await res.json();
      setMsgs(m=>[...m,{role:"ai",text:d.content||d.content||d.content||d.response||d.message||"Received."}]);
    }catch{
      setMsgs(m=>[...m,{role:"ai",text:"Can't reach AI service.\n\nRun: kubectl port-forward svc/zayo-platform-ai 8000:8000 -n platform-ai"}]);
    }
    setThinking(false);
  };
  const suggs=["Which services are healthy?","What DORA metrics are we hitting?","Explain the pipeline","Backstage catalog status?"];
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 90px)"}}>
      <div className="s1" style={{marginBottom:14,flexShrink:0}}>
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>AI copilot</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Claude Sonnet 4 · zayo-platform-ai · EKS us-east-1</div>
      </div>
      <div className="s2" style={{flex:1,display:"grid",gridTemplateColumns:"1fr 260px",gap:12,minHeight:0}}>
        <div style={{background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:DS.r10,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{width:32,height:32,borderRadius:10,background:`linear-gradient(135deg,${DS.ac},${DS.te})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon id="ai" size={14}/></div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:DS.t1}}>Zayo AI Copilot</div>
              <div style={{fontSize:10.5,color:live?.health?DS.ok:DS.t4,display:"flex",alignItems:"center",gap:4}}>
                {live?.health&&<Dot status="ok" animated/>}{live?.health?`Live · ${Math.round(live.health.checks?.claude_api?.latency_ms||960)}ms`:"Demo mode"}
              </div>
            </div>
            <div style={{marginLeft:"auto"}}><Badge color="teal">Claude Sonnet 4</Badge></div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:14}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",gap:4,alignItems:m.role==="ai"?"flex-start":"flex-end"}}>
                <div style={{fontSize:9.5,fontWeight:700,letterSpacing:".06em",color:m.role==="ai"?DS.te:DS.t4,textTransform:"uppercase",display:"flex",alignItems:"center",gap:4}}>
                  {m.role==="ai"&&<Icon id="ai" size={9}/>}{m.role==="ai"?"AI Copilot":"Ajith"}
                </div>
                <div style={{maxWidth:"88%",background:m.role==="ai"?DS.bg4:DS.acGlow,border:`1px solid ${m.role==="ai"?DS.b2:DS.inBd}`,borderRadius:m.role==="ai"?"2px 10px 10px 10px":"10px 2px 10px 10px",padding:"10px 14px",fontSize:12.5,lineHeight:1.65,color:DS.t2,whiteSpace:"pre-wrap"}}>{m.text}</div>
              </div>
            ))}
            {thinking&&<div style={{display:"flex",flexDirection:"column",gap:4}}><div style={{fontSize:9.5,fontWeight:700,color:DS.te,textTransform:"uppercase",display:"flex",alignItems:"center",gap:4}}><Icon id="ai" size={9}/>AI Copilot</div><div style={{background:DS.bg4,border:`1px solid ${DS.b2}`,borderRadius:"2px 10px 10px 10px",padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}><Spinner size={12}/><span style={{fontSize:12,color:DS.t4,fontStyle:"italic"}}>Thinking…</span></div></div>}
            <div ref={endRef}/>
          </div>
          {msgs.length<=2&&<div style={{padding:"8px 14px",borderTop:`1px solid ${DS.b1}`,display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>
            {suggs.map((s,i)=><button key={i} onClick={()=>send(s)} style={{background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"5px 10px",fontSize:11.5,color:DS.t3,cursor:"pointer"}}>{s}</button>)}
          </div>}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${DS.b1}`,flexShrink:0}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask about services, DORA, pipelines…" style={{flex:1,background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"9px 12px",color:DS.t1,fontSize:12.5,outline:"none",transition:"border-color .15s"}} onFocus={ev=>ev.currentTarget.style.borderColor=DS.ac} onBlur={ev=>ev.currentTarget.style.borderColor=DS.b2}/>
              <button onClick={()=>send()} disabled={thinking} style={{width:34,height:34,borderRadius:DS.r8,background:thinking?DS.bg5:DS.ac,border:"none",cursor:thinking?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"white",flexShrink:0}}>
                <svg width="13" height="13" fill="none" viewBox="0 0 13 13"><path d="M1 6.5h11M7 2l4.5 4.5L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,overflowY:"auto"}}>
          {[
            {title:"AI engine",rows:[["Model","claude-sonnet-4"],["Status",live?.health?"Healthy":"Demo"],["Latency",live?.health?`~${Math.round(live.health.checks?.claude_api?.latency_ms||960)}ms`:"—"],["Endpoint","localhost:8000"]]},
            {title:"Backstage",rows:[["Status","Running"],["Catalog","200 OK"],["Port","localhost:7007"],["Entities",live?.entities?.length||"2+"]]},
            {title:"EKS services",rows:[["zayo-platform-ai","1/1 Running"],["spring-orders-poc","1/1 Running"],["backstage","1/1 Running"],["argocd","6/7 Running"]]},
          ].map((p,i)=>(
            <Card key={i} style={{flexShrink:0}}>
              <CardHeader left={p.title}/>
              <div style={{padding:"4px 14px 10px"}}>
                {p.rows.map(([k,v],j)=><Row key={k} label={k} value={v} mono last={j===p.rows.length-1}/>)}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Health({live}){
  const cards=[
    {name:"GitLab CI/CD",st:"ok",rows:[["Pipelines","8"],["Green","6"],["Failed","1"],["Running","1"]]},
    {name:"ArgoCD",st:"ok",rows:[["Apps","3"],["Synced","3"],["Healthy","3"],["Namespace","argocd"]]},
    {name:"AWS ECR",st:"ok",rows:[["Repos","3"],["Images","18+"],["Region","us-east-1"],["Auth","SSO"]]},
    {name:"Backstage",st:"ok",rows:[["Entities",live?.entities?.length||"2+"],["API","200 OK"],["Mode","Headless"],["Auth","Guest"]]},
    {name:"zayo-platform-ai",st:live?.health?"ok":"warn",rows:[["Status",live?.health?"Healthy":"Unreachable"],["Claude","OK"],["Latency","~960ms"],["Version","v1.0.0"]]},
    {name:"AWS SSO",st:"warn",rows:[["Session","Active"],["Expires","~6h"],["Account","501149494381"],["Profile","idp_dev_pwruser"]]},
  ];
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="s1"><div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Platform health</div><div style={{fontSize:12.5,color:DS.t3}}>POC · EKS us-east-1 · {cards.length} integrations</div></div>
      <div className="s2" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        {cards.map((c,i)=>(
          <Card key={i}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:13,fontWeight:600,color:DS.t1}}>{c.name}</span><Dot status={c.st}/>
            </div>
            <div style={{padding:"4px 14px 10px"}}>
              {c.rows.map(([k,v],j)=><Row key={k} label={k} value={v} mono last={j===c.rows.length-1}/>)}
            </div>
          </Card>
        ))}
      </div>
      <div className="s3">
        <Card>
          <CardHeader left="EKS cluster · test-cluster-cicd-deployment · us-east-1"/>
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {ns:"platform-ai",pods:[{n:"zayo-platform-ai",st:"ok",r:"1/1"}]},
              {ns:"orders",pods:[{n:"spring-orders-poc",st:"ok",r:"1/1"}]},
              {ns:"backstage",pods:[{n:"backstage",st:"ok",r:"1/1"}]},
              {ns:"argocd",pods:[{n:"argocd-server",st:"ok",r:"1/1"},{n:"argocd-applicationset",st:"warn",r:"0/1"}]},
            ].map(({ns,pods})=>(
              <div key={ns} style={{background:DS.bg4,borderRadius:DS.r8,padding:"10px 12px"}}>
                <div style={{fontSize:10,fontFamily:DS.mono,color:DS.t3,marginBottom:8,fontWeight:500}}>{ns}</div>
                {pods.map(p=>(
                  <div key={p.n} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderTop:`1px solid ${DS.b1}`}}>
                    <span style={{fontSize:11,fontFamily:DS.mono,color:DS.t2}}>{p.n}</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:10,color:DS.t4}}>{p.r}</span>
                      <Badge color={p.st==="ok"?"green":"amber"}>{p.st==="ok"?"Running":"CrashLoop"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function GoldenThread(){
  const [svc,setSvc]=useState("zayo-platform-ai");
  const stages=[{l:"Lint",v:"ESLint/Flake8",t:"22s"},{l:"SAST",v:"Bandit/Semgrep",t:"45s"},{l:"Tests",v:"pytest/JUnit",t:"1m 12s"},{l:"Build",v:"Docker",t:"1m 40s"},{l:"ECR push",v:"v1.0.0-xxx",t:"28s"},{l:"ArgoCD",v:"Helm values",t:"18s"},{l:"EKS",v:"1/1 Running",t:"42s"}];
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="s1"><div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Golden thread</div><div style={{fontSize:12.5,color:DS.t3}}>commit → pipeline → ECR → ArgoCD → EKS</div></div>
      <div className="s2" style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:12,color:DS.t3}}>Service:</span>
        <select value={svc} onChange={e=>setSvc(e.target.value)} style={{background:DS.bg4,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"6px 11px",color:DS.t1,fontSize:13,outline:"none",cursor:"pointer"}}>
          {["zayo-platform-ai","spring-orders-poc"].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <Badge color="green">All stages passed</Badge>
      </div>
      <div className="s3"><Card><CardHeader left="Pipeline stages"/>
        <div style={{padding:"16px 20px",display:"flex",alignItems:"flex-start",overflowX:"auto",gap:0}}>
          {stages.map((s,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:100,position:"relative"}}>
              {i<stages.length-1&&<div style={{position:"absolute",top:17,left:"50%",width:"100%",height:2,background:DS.okBd,zIndex:0}}/>}
              <div style={{width:34,height:34,borderRadius:"50%",background:DS.okBg,border:`2px solid ${DS.okBd}`,color:"#22C77A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,zIndex:1,flexShrink:0,marginBottom:8}}>✓</div>
              <div style={{fontSize:11,fontWeight:600,color:DS.t2,textAlign:"center",marginBottom:2}}>{s.l}</div>
              <div style={{fontSize:9.5,color:DS.t4,textAlign:"center",fontFamily:DS.mono,marginBottom:2}}>{s.v}</div>
              <div style={{fontSize:9,color:DS.t4,textAlign:"center"}}>{s.t}</div>
            </div>
          ))}
        </div>
      </Card></div>
      <div className="s4"><Card><CardHeader left={`Deployment inventory · ${svc}`}/>
        <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[["GitLab repo",`gitlab.com/zayo-group/devops/idp-platform/${svc}`],["ECR image",`501149494381.dkr.ecr.us-east-1.amazonaws.com/zayo-poc/${svc}`],["Image tag","v1.0.0-latest"],["Helm chart","./helm/values-prod.yaml"],["K8s namespace",svc.includes("orders")?"orders":"platform-ai"],["ArgoCD app",svc]].map(([k,v])=>(
            <div key={k} style={{background:DS.bg4,borderRadius:DS.r8,padding:"10px 12px"}}>
              <div style={{fontSize:9.5,fontWeight:700,color:DS.t4,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{k}</div>
              <div style={{fontSize:11,fontFamily:DS.mono,color:DS.ac,wordBreak:"break-all",lineHeight:1.5}}>{v}</div>
            </div>
          ))}
        </div>
      </Card></div>
    </div>
  );
}

function Insights(){
  const data=[
    {s:"zayo-platform-ai",cicd:92,sec:88,obs:85,docs:70,dora:95,deps:90,ov:87},
    {s:"spring-orders-poc",cicd:88,sec:82,obs:79,docs:65,dora:88,deps:85,ov:81},
    {s:"auth-gateway",cicd:95,sec:91,obs:88,docs:80,dora:90,deps:87,ov:89},
    {s:"billing-service",cicd:55,sec:42,obs:60,docs:45,dora:50,deps:65,ov:53},
    {s:"notification-worker",cicd:78,sec:55,obs:70,docs:50,dora:72,deps:75,ov:67},
  ];
  const col=v=>v>=85?"#22C77A":v>=65?DS.wa:DS.er;
  const SBar=({v})=>(<div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}><div style={{width:40,height:4,background:DS.bg5,borderRadius:4,overflow:"hidden"}}><div style={{width:`${v}%`,height:"100%",background:col(v),borderRadius:4}}/></div><span style={{fontSize:10.5,fontFamily:DS.mono,fontWeight:600,color:col(v),width:24,textAlign:"right"}}>{v}</span></div>);
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="s1"><div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Tech insights</div><div style={{fontSize:12.5,color:DS.t3}}>6 scorecard categories · automated fact collectors</div></div>
      <div className="s2"><Card><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
        {["Service","CI/CD","Security","Observ.","Docs","DORA","Deps","Overall"].map((h,i)=>(
          <th key={h} style={{textAlign:i===0?"left":"center",fontSize:9.5,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",color:DS.t4,padding:"0 10px 9px",borderBottom:`1px solid ${DS.b2}`}}>{h}</th>
        ))}
      </tr></thead><tbody>
        {data.map((r,i)=>(
          <tr key={i} style={{transition:"background .1s"}} onMouseEnter={ev=>ev.currentTarget.style.background=DS.bg4} onMouseLeave={ev=>ev.currentTarget.style.background=""}>
            <td style={{padding:"10px 10px",borderBottom:`1px solid ${DS.b1}`,fontSize:12,fontWeight:600,color:DS.t1,fontFamily:DS.mono}}>{r.s}</td>
            {[r.cicd,r.sec,r.obs,r.docs,r.dora,r.deps].map((v,j)=>(<td key={j} style={{padding:"8px 10px",borderBottom:`1px solid ${DS.b1}`,textAlign:"center"}}><SBar v={v}/></td>))}
            <td style={{padding:"10px 10px",borderBottom:`1px solid ${DS.b1}`,textAlign:"center"}}><span style={{fontSize:14,fontWeight:700,color:col(r.ov)}}>{r.ov}</span></td>
          </tr>
        ))}
      </tbody></table></Card></div>
    </div>
  );
}

function Infra(){
  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="s1"><div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Infrastructure</div><div style={{fontSize:12.5,color:DS.t3}}>AWS us-east-1 · account 501149494381</div></div>
      <div className="s2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[
          {t:"EKS cluster",sub:"test-cluster-cicd-deployment",rows:[["Nodes","2x t3.medium"],["K8s","v1.34.2-eks"],["Region","us-east-1"],["Namespaces","platform-ai · orders · backstage · argocd"]]},
          {t:"ECR repositories",sub:"Container registry",rows:[["zayo-poc/zayo-platform-ai","5 images"],["zayo-poc/spring-orders-poc","2 images"],["zayo-poc/backstage","12+ images"],["Auth","aws ecr get-login-password"]]},
          {t:"AWS infrastructure",sub:"Terraform",rows:[["S3 state","zayo-poc-tf-state-501149494381-idp"],["DynamoDB","zayo-poc-tf-locks"],["OIDC","gitlab.com (exists)"],["Subnets","subnet-0d32dc7e · subnet-0ce39a84"]]},
          {t:"GitLab CI/CD",sub:"Zayo GitLab group",rows:[["Group","zayo-group/devops/idp-platform"],["Pipelines","3 repos · all green"],["Runners","GitLab SaaS · Linux"],["Group vars","12 variables"]]},
        ].map((c,i)=>(
          <Card key={i}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div><div style={{fontSize:13,fontWeight:600,color:DS.t1}}>{c.t}</div><div style={{fontSize:10.5,color:DS.t4,marginTop:2}}>{c.sub}</div></div>
              <Badge color="teal">AWS</Badge>
            </div>
            <div style={{padding:"4px 14px 10px"}}>
              {c.rows.map(([k,v],j)=><Row key={k} label={k} value={v} mono last={j===c.rows.length-1}/>)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NewService(){
  const [step,setStep]=useState(0);
  const [tpl,setTpl]=useState("");
  const [form,setForm]=useState({name:"",owner:"",target:"eks",desc:""});
  const [taskLogs,setTaskLogs]=useState([]);
  const [taskStatus,setTaskStatus]=useState(null);
  const [result,setResult]=useState(null);

  const TPLS=[
    {id:"java-spring-boot-service",icon:"☕",name:"Java Spring Boot",desc:"Spring Boot 3 · Maven · SAST + ArgoCD · golden pipeline",live:true},
    {id:"python-fastapi",icon:"🐍",name:"Python FastAPI",desc:"Coming soon",live:false},
    {id:"node-express",icon:"⬡",name:"Node.js Express",desc:"Coming soon",live:false},
    {id:"dotnet",icon:"⬛",name:".NET 8 Web API",desc:"Coming soon",live:false},
    {id:"react-spa",icon:"⚛",name:"React SPA",desc:"Coming soon",live:false},
    {id:"terraform",icon:"🏗",name:"Terraform module",desc:"Coming soon",live:false},
  ];

  const pollTask=async(id)=>{
    let attempts=0;
    const poll=async()=>{
      try{
        const r=await fetch(`${BKSTG_URL}/api/scaffolder/v2/tasks/${id}/eventstream`);
        const text=await r.text();
        const lines=text.split("\n").filter(l=>l.startsWith("data:"));
        const logs=[];
        let status="processing";
        let links=[];
        lines.forEach(l=>{
          try{
            const d=JSON.parse(l.replace("data: ",""));
            if(d.body?.message) logs.push(d.body.message);
            if(d.type==="completion"){
              status=d.body?.message?.includes("failed")?"failed":"completed";
              if(d.body?.output?.links) links=d.body.output.links;
            }
          }catch{}
        });
        setTaskLogs(logs);
        setTaskStatus(status);
        if(status==="completed"){setResult(links);setStep(4);}
        else if(status==="failed"){setStep(5);}
        else if(attempts<30){attempts++;setTimeout(poll,2000);}
      }catch{if(attempts<30){attempts++;setTimeout(poll,3000);}}
    };
    poll();
  };

  const handleCreate=async()=>{
    if(tpl!=="java-spring-boot-service"){
      alert("Only Java Spring Boot is available in MVP. More templates coming soon!");
      return;
    }
    setStep(3);
    setTaskLogs(["Starting scaffolder..."]);
    try{
      const r=await fetch(`${BKSTG_URL}/api/scaffolder/v2/tasks`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          templateRef:`template:default/${tpl}`,
          values:{service_name:form.name,owner_team:form.owner,description:form.desc||`${form.name} microservice`,system_name:"developer-platform"}
        })
      });
      const d=await r.json();
      if(d.id){
        setTaskLogs(["Task created: "+d.id,"Scaffolding in progress..."]);
        pollTask(d.id);
      }else{setTaskLogs(["Failed: "+JSON.stringify(d)]);setStep(5);}
    }catch(e){setTaskLogs(["Error: "+e.message]);setStep(5);}
  };

  const gitlabUrl=result?.find(l=>l.title==="GitLab repository")?.url;

  return(
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="s1"><div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>New service</div><div style={{fontSize:12.5,color:DS.t3}}>Scaffold · golden pipeline + Helm + catalog-info.yaml auto-generated</div></div>
      <div style={{maxWidth:700}}>
        {step<3&&<div className="s2" style={{display:"flex",alignItems:"center",marginBottom:24}}>
          {["Template","Configure","Review"].map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",flex:i<2?1:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10.5,fontWeight:700,flexShrink:0,background:i<step?DS.ok:i===step?DS.ac:DS.bg5,color:i<=step?"white":DS.t4,border:i===step?`2px solid ${DS.acH}`:`1px solid ${DS.b2}`,boxShadow:i===step?`0 0 0 3px ${DS.acGlow}`:"none"}}>{i<step?"✓":i+1}</div>
                <span style={{fontSize:12.5,fontWeight:i===step?600:400,color:i===step?DS.t1:DS.t3}}>{s}</span>
              </div>
              {i<2&&<div style={{flex:1,height:1.5,background:i<step?DS.ok:DS.b2,margin:"0 10px"}}/>}
            </div>
          ))}
        </div>}
        {step===0&&(
          <div className="page-enter">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
              {TPLS.map(t=>(
                <div key={t.id} onClick={()=>t.live&&setTpl(t.id)} style={{background:tpl===t.id?DS.acGlow:DS.bg3,border:`1.5px solid ${tpl===t.id?DS.ac:DS.b2}`,borderRadius:DS.r10,padding:14,cursor:t.live?"pointer":"not-allowed",transition:"all .15s",opacity:t.live?1:0.45}}>
                  <div style={{width:34,height:34,borderRadius:DS.r8,background:DS.bg5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{t.icon}</div>
                  <div style={{fontSize:13,fontWeight:600,color:DS.t1,marginBottom:4}}>{t.name}{t.live&&<span style={{fontSize:9,background:DS.ok,color:"white",borderRadius:4,padding:"1px 5px",marginLeft:6}}>MVP</span>}</div>
                  <div style={{fontSize:11,color:DS.t4,lineHeight:1.5}}>{t.desc}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>tpl&&setStep(1)} style={{background:tpl?DS.ac:DS.bg5,border:`1px solid ${tpl?DS.ac:DS.b2}`,borderRadius:DS.r8,padding:"9px 20px",color:tpl?"white":DS.t4,fontWeight:600,cursor:tpl?"pointer":"not-allowed",fontSize:13}}>Next: Configure</button>
            </div>
          </div>
        )}
        {step===1&&(
          <div className="page-enter">
            <Card style={{padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:DS.t1,marginBottom:16}}>Service details</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Service name","name","e.g. payments-api"],["Owner team","owner","e.g. platform-engineering"]].map(([l,k,ph])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:5}}>
                    <label style={{fontSize:10.5,fontWeight:700,color:DS.t4,textTransform:"uppercase",letterSpacing:".08em"}}>{l}</label>
                    <input value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph} style={{background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"8px 11px",color:DS.t1,fontSize:13,outline:"none"}} onFocus={ev=>ev.currentTarget.style.borderColor=DS.ac} onBlur={ev=>ev.currentTarget.style.borderColor=DS.b2}/>
                  </div>
                ))}
                <div style={{display:"flex",flexDirection:"column",gap:5,gridColumn:"span 2"}}>
                  <label style={{fontSize:10.5,fontWeight:700,color:DS.t4,textTransform:"uppercase",letterSpacing:".08em"}}>Description</label>
                  <input value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="Brief description" style={{background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"8px 11px",color:DS.t1,fontSize:13,outline:"none"}} onFocus={ev=>ev.currentTarget.style.borderColor=DS.ac} onBlur={ev=>ev.currentTarget.style.borderColor=DS.b2}/>
                </div>
              </div>
            </Card>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <button onClick={()=>setStep(0)} style={{background:"transparent",border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"9px 18px",color:DS.t3,cursor:"pointer",fontSize:13}}>Back</button>
              <button onClick={()=>form.name&&form.owner&&setStep(2)} style={{background:form.name&&form.owner?DS.ac:DS.bg5,border:`1px solid ${form.name&&form.owner?DS.ac:DS.b2}`,borderRadius:DS.r8,padding:"9px 20px",color:form.name&&form.owner?"white":DS.t4,fontWeight:600,cursor:form.name&&form.owner?"pointer":"not-allowed",fontSize:13}}>Next: Review</button>
            </div>
          </div>
        )}
        {step===2&&(
          <div className="page-enter">
            <div style={{background:DS.okBg,border:`1px solid ${DS.okBd}`,borderRadius:DS.r8,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#22C77A",display:"flex",alignItems:"center",gap:8,fontWeight:500}}>
              Ready to scaffold · GitLab repo · golden pipeline · Backstage entry · Helm chart · Terraform
            </div>
            <Card style={{padding:"4px 20px 12px",marginBottom:16}}>
              {[["Template",TPLS.find(t=>t.id===tpl)?.name||tpl],["Service name",form.name],["Owner",form.owner],["Deploy target","EKS us-east-1"],["Description",form.desc||"—"]].map(([k,v],j,arr)=>(
                <Row key={k} label={k} value={v} last={j===arr.length-1}/>
              ))}
            </Card>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <button onClick={()=>setStep(1)} style={{background:"transparent",border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"9px 18px",color:DS.t3,cursor:"pointer",fontSize:13}}>Back</button>
              <button onClick={handleCreate} style={{background:DS.ok,border:"none",borderRadius:DS.r8,padding:"9px 22px",color:"white",fontWeight:700,cursor:"pointer",fontSize:13}}>🚀 Create service</button>
            </div>
          </div>
        )}
        {step===3&&(
          <div className="page-enter">
            <div style={{background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:DS.r10,padding:20,marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:DS.t1,marginBottom:16}}>Creating {form.name}...</div>
              {[
                {label:"Fetch skeleton",done:taskLogs.some(l=>l.includes("Finished step Fetch"))},
                {label:"Create GitLab repo",done:taskLogs.some(l=>l.includes("Finished step Create"))},
                {label:"Register in catalog",done:taskLogs.some(l=>l.includes("Finished step Register"))},
              ].map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:s.done?DS.ok:DS.bg5,border:`1px solid ${s.done?DS.ok:DS.b2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"white",flexShrink:0}}>{s.done?"✓":"…"}</div>
                  <span style={{fontSize:12.5,color:s.done?DS.t1:DS.t3,fontWeight:s.done?600:400}}>{s.label}</span>
                </div>
              ))}
              <div style={{background:DS.bg0,borderRadius:DS.r8,padding:"10px 12px",marginTop:14,fontFamily:DS.mono,fontSize:10.5,color:DS.te,maxHeight:120,overflowY:"auto"}}>
                {taskLogs.slice(-6).map((l,i)=>(
                  <div key={i} style={{marginBottom:2}}>{l.replace(/\x1b\[[0-9;]*m/g,"")}</div>
                ))}
              </div>
            </div>
          </div>
        )}
        {step===4&&(
          <div className="page-enter">
            <div style={{background:DS.okBg,border:`1px solid ${DS.okBd}`,borderRadius:DS.r10,padding:24,textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:8}}>🎉</div>
              <div style={{fontSize:16,fontWeight:700,color:DS.t1,marginBottom:6}}>{form.name} is live!</div>
              <div style={{fontSize:12,color:DS.t3,marginBottom:16}}>Service scaffolded · pipeline running · registered in catalog</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                {gitlabUrl&&<a href={gitlabUrl} target="_blank" rel="noopener noreferrer" style={{background:DS.ac,color:"white",padding:"7px 16px",borderRadius:DS.r8,fontSize:12,fontWeight:600,textDecoration:"none"}}>GitLab repo</a>}
                <a href="http://localhost:7007" target="_blank" rel="noopener noreferrer" style={{background:DS.bg5,color:DS.t1,padding:"7px 16px",borderRadius:DS.r8,fontSize:12,fontWeight:600,textDecoration:"none",border:`1px solid ${DS.b2}`}}>Backstage catalog</a>
              </div>
            </div>
            <div style={{background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"12px 16px",fontSize:12,color:DS.t3,lineHeight:1.8}}>
              <div style={{fontWeight:600,color:DS.t1,marginBottom:6}}>What happens next:</div>
              <div>1. GitLab pipeline running — lint, SAST, test, build, ECR push, deploy</div>
              <div>2. Terraform provisioning ECR repo, EKS namespace, ArgoCD app</div>
              <div>3. ArgoCD syncs and deploys to EKS in ~10 minutes</div>
              <div>4. Service appears in catalog with health status</div>
            </div>
            <div style={{display:"flex",justifyContent:"center",marginTop:16}}>
              <button onClick={()=>{setStep(0);setTpl("");setForm({name:"",owner:"",target:"eks",desc:""});setResult(null);setTaskLogs([]);}} style={{background:"transparent",border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"9px 18px",color:DS.t3,cursor:"pointer",fontSize:13}}>Create another service</button>
            </div>
          </div>
        )}
        {step===5&&(
          <div className="page-enter">
            <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:DS.r10,padding:24,textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:8}}>❌</div>
              <div style={{fontSize:14,fontWeight:600,color:DS.er,marginBottom:12}}>Scaffolding failed</div>
              <div style={{fontFamily:DS.mono,fontSize:10.5,color:DS.t3,marginBottom:16,textAlign:"left",background:DS.bg0,borderRadius:DS.r8,padding:"8px 12px",maxHeight:120,overflowY:"auto"}}>
                {taskLogs.slice(-5).map((l,i)=><div key={i}>{l.replace(/\x1b\[[0-9;]*m/g,"")}</div>)}
              </div>
              <button onClick={()=>setStep(2)} style={{background:DS.ac,border:"none",borderRadius:DS.r8,padding:"8px 18px",color:"white",cursor:"pointer",fontSize:13,fontWeight:600}}>Try again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App(){
  const [screen,setScreen]=useState("dashboard");
  const [live,setLive]=useState(null);
  const [liveStatus,setLS]=useState("loading");

  useEffect(()=>{
    const el=document.createElement("style");
    el.textContent=GLOBAL;
    document.head.appendChild(el);
    return()=>{try{document.head.removeChild(el);}catch{}};
  },[]);

  useEffect(()=>{
    (async()=>{
      try{
        const [hRes,eRes]=await Promise.allSettled([
          fetch(`${AI_URL}/api/v1/health`,{signal:AbortSignal.timeout(4000)}).then(r=>r.json()),
          fetch(`${BKSTG_URL}/api/catalog/entities`,{signal:AbortSignal.timeout(4000)}).then(r=>r.json()),
        ]);
        const h=hRes.status==="fulfilled"?hRes.value:null;
        const e=eRes.status==="fulfilled"&&Array.isArray(eRes.value)?eRes.value:[];
        if(h||e.length>0){setLive({health:h,entities:e,dora:{df:"3.2",lt:"2.1",cfr:"8",mttr:"47"},services:Math.max(47,e.length)});setLS("connected");}
        else setLS("demo");
      }catch{setLS("demo");}
    })();
  },[]);

  const SCREENS={
    dashboard:<Dashboard live={live} onNav={setScreen}/>,
    catalog:<Catalog live={live}/>,
    insights:<Insights/>,
    copilot:<Copilot live={live}/>,
    health:<Health live={live}/>,
    infra:<Infra/>,
    golden:<GoldenThread/>,
    newservice:<NewService/>,
  };

  return(
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:DS.bg0}}>
      <Sidebar active={screen} onNav={setScreen} live={liveStatus}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        <Topbar screen={screen} onNav={setScreen}/>
        <main key={screen} style={{flex:1,overflowY:"auto",padding:"22px 24px",background:DS.bg1}}>
          {SCREENS[screen]||<div style={{color:DS.t4,padding:20}}>Screen not found</div>}
        </main>
      </div>
    </div>
  );
}
