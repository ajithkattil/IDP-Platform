/**
 * Idp IDP Portal — Production Grade v2
 * Design language: Refined dark utility — precision, depth, clarity.
 * Fonts: Geist (UI) + Geist Mono (code/data)
 * Differentiator: AI-native, live Backstage integration, superior to Cortex.io
 *
 * API endpoints (via port-forward):
 *   localhost:8000  → idp-platform-ai (Claude Sonnet 4)
 *   localhost:7007  → Backstage headless catalog
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";

// ─── ENDPOINTS ─────────────────────────────────────────────────────────────────
const AI_URL    = "http://localhost:8000";
const BKSTG_URL = "http://localhost:7007";

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const DS = {
  // Background scale — each step slightly lighter
  bg0: "#050C17",   // deepest
  bg1: "#080F1C",   // app shell
  bg2: "#0C1524",   // sidebar
  bg3: "#101B2C",   // card
  bg4: "#142033",   // card hover / elevated
  bg5: "#1A2840",   // input / chip

  // Border scale
  b1:  "rgba(255,255,255,0.05)",   // hairline
  b2:  "rgba(255,255,255,0.08)",   // card border
  b3:  "rgba(255,255,255,0.12)",   // hover
  b4:  "rgba(255,255,255,0.20)",   // focus / active

  // Text scale
  t1:  "#F2F6FC",   // primary — headings
  t2:  "#A8BDCF",   // secondary — labels
  t3:  "#6580A0",   // tertiary — metadata
  t4:  "#344D68",   // disabled / placeholder

  // Brand accent
  ac:  "#2478E4",   // blue — primary action
  acH: "#3D8EF2",   // hover
  acL: "#1A5CB8",   // pressed
  acGlow: "rgba(36,120,228,0.18)",

  // Semantic
  ok:  "#16A362",  okBg: "rgba(22,163,98,0.12)",  okBd: "rgba(22,163,98,0.25)",
  wa:  "#D08B00",  waBg: "rgba(208,139,0,0.12)",  waBd: "rgba(208,139,0,0.25)",
  er:  "#D43B3B",  erBg: "rgba(212,59,59,0.12)",  erBd: "rgba(212,59,59,0.25)",
  in:  "#2478E4",  inBg: "rgba(36,120,228,0.10)",  inBd: "rgba(36,120,228,0.22)",
  pu:  "#6B56E8",  puBg: "rgba(107,86,232,0.10)",  puBd: "rgba(107,86,232,0.22)",
  te:  "#0CA5A5",  teBg: "rgba(12,165,165,0.10)",  teBd: "rgba(12,165,165,0.22)",

  // Spacing
  r4: 4, r6: 6, r8: 8, r10: 10, r12: 12,

  // Font stacks
  sans: "'Geist', 'DM Sans', system-ui, sans-serif",
  mono: "'Geist Mono', 'DM Mono', 'Fira Code', monospace",

  // Shadows
  sh1: "0 1px 2px rgba(0,0,0,0.4)",
  sh2: "0 2px 8px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.4)",
  sh3: "0 4px 16px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.5)",
  shAc: "0 0 0 1px rgba(36,120,228,0.4), 0 0 12px rgba(36,120,228,0.15)",
};

// ─── GLOBAL CSS ────────────────────────────────────────────────────────────────
const GLOBAL = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; overflow: hidden; }
body {
  font-family: 'DM Sans', system-ui, sans-serif;
  background: ${DS.bg0};
  color: ${DS.t2};
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${DS.b3}; border-radius: 4px; }
input, textarea, select, button { font-family: inherit; }
button { cursor: pointer; }
a { color: inherit; text-decoration: none; }

/* Animations */
@keyframes fadeUp   { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
@keyframes slideIn  { from { opacity:0; transform:translateX(-6px); } to { opacity:1; transform:none; } }
@keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.4} }
@keyframes spin     { to { transform:rotate(360deg); } }
@keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes shimmer  { from{background-position:-200% 0} to{background-position:200% 0} }
@keyframes growIn   { from{transform:scaleX(0)} to{transform:scaleX(1)} }

.page-enter { animation: fadeUp .2s cubic-bezier(.16,1,.3,1) both; }
.stagger-1  { animation: fadeUp .2s .04s cubic-bezier(.16,1,.3,1) both; }
.stagger-2  { animation: fadeUp .2s .08s cubic-bezier(.16,1,.3,1) both; }
.stagger-3  { animation: fadeUp .2s .12s cubic-bezier(.16,1,.3,1) both; }
.stagger-4  { animation: fadeUp .2s .16s cubic-bezier(.16,1,.3,1) both; }
.pulse      { animation: pulse 2.4s ease-in-out infinite; }
.spin       { animation: spin 1s linear infinite; }

/* Skeleton loader */
.skeleton {
  background: linear-gradient(90deg, ${DS.bg4} 25%, ${DS.bg5} 50%, ${DS.bg4} 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  border-radius: 4px;
}

/* Focus ring */
*:focus-visible { outline: 2px solid ${DS.ac}; outline-offset: 2px; border-radius: 4px; }
`;

// ─── PRIMITIVES ────────────────────────────────────────────────────────────────

// Semantic badge variants
const BADGE = {
  green:  { bg: DS.okBg,  c: "#22C77A", bd: DS.okBd  },
  amber:  { bg: DS.waBg,  c: "#F0B429", bd: DS.waBd  },
  red:    { bg: DS.erBg,  c: "#F07070", bd: DS.erBd  },
  blue:   { bg: DS.inBg,  c: "#60A8F8", bd: DS.inBd  },
  teal:   { bg: DS.teBg,  c: "#2DBDBD", bd: DS.teBd  },
  purple: { bg: DS.puBg,  c: "#A594F5", bd: DS.puBd  },
  gray:   { bg: DS.bg5,   c: DS.t3,     bd: DS.b2    },
};

const Badge = memo(({ color="gray", size="sm", dot=false, children }) => {
  const s = BADGE[color] || BADGE.gray;
  const sz = size==="xs" ? { fontSize:9, padding:"1px 5px" } : { fontSize:10, padding:"2px 7px" };
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      fontWeight:600, letterSpacing:".02em",
      borderRadius: DS.r4,
      border: `1px solid ${s.bd}`,
      background: s.bg, color: s.c,
      whiteSpace:"nowrap", lineHeight:1.4,
      ...sz
    }}>
      {dot && <span style={{width:5,height:5,borderRadius:"50%",background:s.c,flexShrink:0}}/>}
      {children}
    </span>
  );
});

const StatusDot = ({ status="ok", animated=false }) => {
  const c = {ok:DS.ok, warn:DS.wa, err:DS.er, info:DS.ac}[status]||DS.ok;
  return (
    <span style={{
      width:7,height:7,borderRadius:"50%",
      background:c,flexShrink:0,display:"inline-block",
      animation: animated ? "pulse 2s ease-in-out infinite" : undefined
    }}/>
  );
};

const Spinner = ({ size=14 }) => (
  <div style={{
    width:size, height:size,
    border:`1.5px solid ${DS.b3}`,
    borderTopColor: DS.ac,
    borderRadius:"50%",
    animation:"spin 0.8s linear infinite",
    flexShrink:0
  }}/>
);

// Card with optional shimmer on hover
const Card = ({ children, style={}, hover=true, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: DS.bg3,
      border: `1px solid ${DS.b2}`,
      borderRadius: DS.r10,
      overflow:"hidden",
      boxShadow: DS.sh1,
      transition:"border-color .15s, box-shadow .15s, background .15s",
      cursor: onClick ? "pointer" : undefined,
      ...style
    }}
    onMouseEnter={hover&&!onClick?ev=>{ev.currentTarget.style.borderColor=DS.b3; ev.currentTarget.style.boxShadow=DS.sh2;}:undefined}
    onMouseLeave={hover&&!onClick?ev=>{ev.currentTarget.style.borderColor=DS.b2; ev.currentTarget.style.boxShadow=DS.sh1;}:undefined}
  >
    {children}
  </div>
);

const CardHeader = ({ left, right, subtext }) => (
  <div style={{
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"12px 16px",
    borderBottom:`1px solid ${DS.b1}`
  }}>
    <div>
      <div style={{fontSize:12, fontWeight:600, color:DS.t1, letterSpacing:"-.01em"}}>{left}</div>
      {subtext && <div style={{fontSize:10.5, color:DS.t3, marginTop:2}}>{subtext}</div>}
    </div>
    {right}
  </div>
);

const TextBtn = ({ children, onClick, color=DS.ac }) => (
  <button onClick={onClick} style={{background:"none",border:"none",padding:0,color,fontSize:11,fontWeight:500,cursor:"pointer",letterSpacing:".01em",display:"flex",alignItems:"center",gap:3}}>
    {children}
  </button>
);

// Divider row — used in data tables
const Row = ({ label, value, valueColor, mono=false, last=false }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:last?"none":`1px solid ${DS.b1}`,fontSize:12}}>
    <span style={{color:DS.t3}}>{label}</span>
    <span style={{fontWeight:500,color:valueColor||DS.t1,fontFamily:mono?DS.mono:undefined,fontSize:mono?11:undefined}}>{value}</span>
  </div>
);

// Thin progress bar
const Bar = ({ pct, color=DS.ac, height=4 }) => (
  <div style={{width:"100%",height,background:DS.bg5,borderRadius:height}}>
    <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:height,transformOrigin:"left",animation:"growIn .6s cubic-bezier(.16,1,.3,1) both"}}/>
  </div>
);

// Icon button
const IconBtn = ({ children, onClick, active=false, badge=false }) => (
  <button onClick={onClick} style={{
    width:32, height:32, borderRadius:DS.r8,
    background:"transparent", border:`1px solid ${DS.b2}`,
    display:"flex",alignItems:"center",justifyContent:"center",
    color:active?DS.t1:DS.t3, cursor:"pointer",
    transition:"all .12s", position:"relative",
    flexShrink:0
  }}
  onMouseEnter={ev=>{ev.currentTarget.style.background=DS.bg4;ev.currentTarget.style.borderColor=DS.b3;ev.currentTarget.style.color=DS.t1;}}
  onMouseLeave={ev=>{ev.currentTarget.style.background="transparent";ev.currentTarget.style.borderColor=DS.b2;ev.currentTarget.style.color=active?DS.t1:DS.t3;}}>
    {children}
    {badge && <div style={{position:"absolute",top:7,right:7,width:5,height:5,borderRadius:"50%",background:DS.er,border:`1.5px solid ${DS.bg1}`}}/>}
  </button>
);

// ─── SVG ICONS ─────────────────────────────────────────────────────────────────
const ICONS = {
  dashboard: <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity=".85"/></svg>,
  catalog:   <svg viewBox="0 0 16 16" fill="none"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  insights:  <svg viewBox="0 0 16 16" fill="none"><path d="M2 11.5l3.5-4 2.5 2.5 3.5-5 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  copilot:   <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 14.5l2-3h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="7" r="1" fill="currentColor"/><circle cx="8" cy="7" r="1" fill="currentColor"/><circle cx="10.5" cy="7" r="1" fill="currentColor"/></svg>,
  health:    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 8h3l1.5-3 2.5 6 1.5-3h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  infra:     <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  golden:    <svg viewBox="0 0 16 16" fill="none"><circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="13" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4.5 8h2M9.5 8h2" stroke="currentColor" strokeWidth="1.3"/></svg>,
  newservice:<svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  search:    <svg viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  bell:      <svg viewBox="0 0 16 16" fill="none"><path d="M8 1.5a5 5 0 015 5v2.5l1.5 2H1.5L3 9V6.5a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 12.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3"/></svg>,
  clock:     <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  plus:      <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  chevRight: <svg viewBox="0 0 12 12" fill="none"><path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  external:  <svg viewBox="0 0 12 12" fill="none"><path d="M7 1.5h3.5v3.5M10.5 1.5L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M5 3H2.5A1 1 0 001.5 4v5.5A1 1 0 002.5 10.5H8A1 1 0 009 9.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  idpLogo:  <svg viewBox="0 0 20 20" fill="none"><path d="M3 10L10 3L17 10L10 17Z" stroke="white" strokeWidth="1.8" fill="none"/><circle cx="10" cy="10" r="3" fill="white"/></svg>,
  aiSpark:   <svg viewBox="0 0 16 16" fill="none"><path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
};

const Icon = ({ id, size=14 }) => (
  <span style={{width:size,height:size,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    {ICONS[id] ? <span style={{width:"100%",height:"100%",display:"flex"}}>{ICONS[id]}</span> : null}
  </span>
);

// ─── SIDEBAR ───────────────────────────────────────────────────────────────────
const NAV = [
  { sec:"OVERVIEW",   items:[{id:"dashboard",label:"Dashboard"}] },
  { sec:"CATALOG",    items:[{id:"catalog",label:"Service catalog",count:null},{id:"insights",label:"Tech insights"}] },
  { sec:"INTELLIGENCE",items:[{id:"copilot",label:"AI copilot",live:true}] },
  { sec:"PLATFORM",   items:[{id:"health",label:"Platform health"},{id:"infra",label:"Infrastructure"},{id:"golden",label:"Golden thread"}] },
  { sec:"CREATE",     items:[{id:"newservice",label:"New service"}] },
];

function Sidebar({ active, onNav, live, entityCount }) {
  return (
    <aside style={{
      width:216, flexShrink:0,
      background:DS.bg2,
      borderRight:`1px solid ${DS.b1}`,
      display:"flex", flexDirection:"column",
      height:"100vh",
    }}>
      {/* Wordmark */}
      <div style={{padding:"16px 14px 14px", borderBottom:`1px solid ${DS.b1}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:13}}>
          <div style={{width:28,height:28,borderRadius:8,background:DS.ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 0 0 1px ${DS.acGlow}, ${DS.sh1}`}}>
            <Icon id="idpLogo" size={16}/>
          </div>
          <div>
            <div style={{fontSize:13.5,fontWeight:700,color:DS.t1,letterSpacing:"-.03em",lineHeight:1.2}}>Idp DevPortal</div>
            <div style={{fontSize:9,color:DS.t4,textTransform:"uppercase",letterSpacing:".1em",marginTop:1}}>Platform Engineering</div>
          </div>
        </div>

        {/* Global search */}
        <button onClick={()=>onNav("copilot")} style={{
          width:"100%",display:"flex",alignItems:"center",gap:7,
          background:DS.bg5, border:`1px solid ${DS.b2}`,
          borderRadius:DS.r8, padding:"7px 10px",
          color:DS.t4, fontSize:12, cursor:"pointer",
          transition:"all .12s", textAlign:"left"
        }}
        onMouseEnter={ev=>{ev.currentTarget.style.background=DS.bg4;ev.currentTarget.style.borderColor=DS.b3;}}
        onMouseLeave={ev=>{ev.currentTarget.style.background=DS.bg5;ev.currentTarget.style.borderColor=DS.b2;}}>
          <Icon id="search" size={12}/> Search or ask AI…
          <kbd style={{marginLeft:"auto",background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:4,padding:"1px 5px",fontFamily:DS.mono,fontSize:9.5,color:DS.t4}}>⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav style={{flex:1,overflowY:"auto",padding:"8px 8px"}}>
        {NAV.map(group => (
          <div key={group.sec} style={{marginBottom:4}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",color:DS.t4,padding:"10px 8px 5px",textTransform:"uppercase"}}>{group.sec}</div>
            {group.items.map(item => {
              const isActive = active===item.id;
              return (
                <button key={item.id} onClick={()=>onNav(item.id)} style={{
                  width:"100%",display:"flex",alignItems:"center",gap:8,
                  padding:"6px 8px", borderRadius:DS.r6,
                  background: isActive ? DS.acGlow : "transparent",
                  border:`1px solid ${isActive ? DS.inBd : "transparent"}`,
                  color: isActive ? DS.t1 : DS.t3,
                  cursor:"pointer", fontSize:13, fontWeight:isActive?500:400,
                  transition:"all .1s", textAlign:"left", marginBottom:1,
                  boxShadow: isActive ? DS.shAc : "none",
                }}
                onMouseEnter={ev=>{if(!isActive){ev.currentTarget.style.background=DS.bg4;ev.currentTarget.style.color=DS.t2;}}}
                onMouseLeave={ev=>{if(!isActive){ev.currentTarget.style.background="transparent";ev.currentTarget.style.color=DS.t3;}}}>
                  <Icon id={item.id} size={14}/>
                  <span style={{flex:1}}>{item.label}</span>
                  {item.live && (
                    <span style={{display:"flex",alignItems:"center",gap:3,fontSize:9,fontWeight:700,color:DS.ok,background:DS.okBg,border:`1px solid ${DS.okBd}`,borderRadius:10,padding:"1px 5px"}}>
                      <span style={{width:4,height:4,borderRadius:"50%",background:DS.ok,animation:"pulse 2s infinite"}}/>
                      LIVE
                    </span>
                  )}
                  {item.count!=null && <span style={{fontSize:9.5,fontWeight:600,color:DS.t4,background:DS.bg5,borderRadius:10,padding:"0 5px"}}>{item.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Live indicator */}
      <div style={{padding:"10px 12px", borderTop:`1px solid ${DS.b1}`}}>
        {live==="connected"
          ? <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:DS.ok,fontWeight:500}}>
              <StatusDot status="ok" animated/>
              Connected to POC · EKS us-east-1
            </div>
          : live==="loading"
          ? <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:DS.t3}}><Spinner size={10}/>Connecting to services…</div>
          : <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10.5,color:DS.t4}}><StatusDot status="warn"/>Demo mode · start port-forwards</div>}
      </div>

      {/* User */}
      <div style={{padding:"10px 12px",borderTop:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${DS.ac},${DS.te})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"white",flexShrink:0}}>AJ</div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12.5,fontWeight:600,color:DS.t1,lineHeight:1.2}}>Ajith Kattil</div>
          <div style={{fontSize:10,color:DS.t4,marginTop:1}}>Platform Lead · Foundation</div>
        </div>
      </div>
    </aside>
  );
}

// ─── TOPBAR ────────────────────────────────────────────────────────────────────
const CRUMBS = {dashboard:"Dashboard",catalog:"Service catalog",insights:"Tech insights",copilot:"AI copilot",health:"Platform health",infra:"Infrastructure",golden:"Golden thread",newservice:"New service"};

function Topbar({ screen, onNav }) {
  return (
    <header style={{
      height:50, flexShrink:0,
      background:DS.bg2, borderBottom:`1px solid ${DS.b1}`,
      display:"flex", alignItems:"center", padding:"0 20px", gap:12,
    }}>
      {/* Breadcrumb */}
      <div style={{flex:1,display:"flex",alignItems:"center",gap:6,fontSize:12,color:DS.t4}}>
        <span>Platform</span>
        <Icon id="chevRight" size={10}/>
        <span style={{color:DS.t2,fontWeight:500}}>{CRUMBS[screen]||screen}</span>
      </div>

      {/* Actions */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <IconBtn><Icon id="clock" size={13}/></IconBtn>
        <IconBtn badge><Icon id="bell" size={13}/></IconBtn>

        {/* New service CTA */}
        <button onClick={()=>onNav("newservice")} style={{
          display:"flex",alignItems:"center",gap:6,
          background:DS.ac, border:"none", borderRadius:DS.r8,
          padding:"7px 14px", color:"white", fontWeight:600, fontSize:12.5,
          cursor:"pointer", transition:"background .12s",
          boxShadow:`0 1px 3px ${DS.acGlow}`
        }}
        onMouseEnter={ev=>ev.currentTarget.style.background=DS.acH}
        onMouseLeave={ev=>ev.currentTarget.style.background=DS.ac}>
          <Icon id="plus" size={11}/>
          New service
        </button>
      </div>
    </header>
  );
}

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ live, onNav }) {
  const dora = live?.dora || {df:"3.2",lt:"2.1",cfr:"8",mttr:"47"};

  // ── DORA Metric Card ──
  const DoraCard = ({ label, value, unit, trend, up, delay="", pct }) => (
    <div className={`stagger-${delay}`} style={{
      background:DS.bg3, border:`1px solid ${DS.b2}`,
      borderRadius:DS.r10, padding:"16px 18px",
      boxShadow:DS.sh1, transition:"all .15s"
    }}
    onMouseEnter={ev=>{ev.currentTarget.style.borderColor=DS.b3;ev.currentTarget.style.boxShadow=DS.sh2;}}
    onMouseLeave={ev=>{ev.currentTarget.style.borderColor=DS.b2;ev.currentTarget.style.boxShadow=DS.sh1;}}>
      <div style={{fontSize:10,fontWeight:600,color:DS.t4,textTransform:"uppercase",letterSpacing:".09em",marginBottom:12}}>{label}</div>
      <div style={{fontSize:28,fontWeight:700,color:DS.t1,letterSpacing:"-.05em",lineHeight:1,marginBottom:6}}>
        {value}<span style={{fontSize:14,fontWeight:400,color:DS.t3,letterSpacing:0}}> {unit}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:up?"#22C77A":DS.er,marginBottom:10,fontWeight:500}}>
        <span>{up?"↑":"↓"}</span><span>{trend}</span>
      </div>
      {pct && <Bar pct={pct} color={up?DS.ok:DS.er}/>}
    </div>
  );

  const pipelines = [
    {name:"idp-platform-ai", stages:[1,1,1,1,1,1,1], status:"green", time:"4m 12s"},
    {name:"spring-orders-poc", stages:[1,1,1,1,1,2,0], status:"blue",  time:"running"},
    {name:"billing-service",   stages:[1,3,0,0,0,0,0], status:"red",   time:"2m 08s"},
    {name:"auth-gateway",      stages:[1,1,1,1,1,1,1], status:"green", time:"3m 55s"},
  ];
  const SC = {1:DS.ok, 2:DS.ac, 3:DS.er, 0:DS.b3};
  const SL = {green:"passed",blue:"running",red:"failed"};

  const activity = [
    {c:DS.ok, label:"Deploy",  text:<><strong style={{color:DS.t1}}>idp-platform-ai</strong> v1.0.0-909fea02 deployed · ArgoCD sync · 1/1 healthy</>,   time:"2m ago"},
    {c:DS.ac, label:"Pipeline",text:<><strong style={{color:DS.t1}}>spring-orders-poc</strong> pipeline running · stage 6/7 · ECR push in progress</>,    time:"14m ago"},
    {c:DS.wa, label:"Alert",   text:<>AWS SSO credentials expire in <strong style={{color:DS.t1}}>6 hours</strong> · update GitLab CI/CD group variables</>,time:"31m ago"},
    {c:DS.ok, label:"Catalog", text:<>Backstage: <strong style={{color:DS.t1}}>2 services</strong> registered · catalog API healthy · all entities indexed</>,time:"1h ago"},
    {c:DS.te, label:"AI",      text:<>Copilot: <strong style={{color:DS.t1}}>12 queries</strong> answered · Claude Sonnet 4 · avg latency 960ms</>,         time:"2h ago"},
    {c:DS.er, label:"Notice",  text:<>ArgoCD applicationset <strong style={{color:DS.t1}}>CrashLoopBackOff</strong> · non-critical · other apps healthy</>,  time:"3h ago"},
  ];

  const integrations = [
    {name:"GitLab CI/CD",  st:"ok",  val:"8 pipelines · 6 green"},
    {name:"ArgoCD",        st:"ok",  val:"3/3 apps healthy"},
    {name:"EKS",           st:"ok",  val:"3 pods running"},
    {name:"Backstage",     st:"ok",  val:`${live?.entities?.length||2} entities`},
    {name:"Claude API",    st:live?.health?"ok":"warn", val:live?.health?"~960ms latency":"not connected"},
    {name:"AWS SSO",       st:"warn",val:"expires ~6h"},
  ];

  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Page heading */}
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Good morning, Ajith</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Foundation phase · {live?.services||47} services cataloged · EKS us-east-1 · all systems operational</div>
      </div>

      {/* Status ribbon */}
      <div className="stagger-2" style={{
        display:"flex",flexWrap:"wrap",alignItems:"center",gap:0,
        background:DS.okBg, border:`1px solid ${DS.okBd}`,
        borderRadius:DS.r8, overflow:"hidden"
      }}>
        {[["ok","GitLab CI/CD"],["ok","ArgoCD"],["ok","EKS"],["ok","Claude API"],["ok","Backstage"],["ok","ECR"],["warn","AWS SSO · expires 6h"]].map(([s,l],i,arr)=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRight:i<arr.length-1?`1px solid ${DS.okBd}`:"none",fontSize:11}}>
            <StatusDot status={s}/><span style={{color:s==="warn"?DS.wa:DS.t2,fontWeight:s==="warn"?500:400}}>{l}</span>
          </div>
        ))}
      </div>

      {/* DORA row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <DoraCard label="Deploy frequency" value={dora.df} unit="/day"  trend="+0.4 vs last week" up pct={64} delay="1"/>
        <DoraCard label="Lead time"        value={dora.lt} unit="days"  trend="−0.6d improvement" up pct={72} delay="2"/>
        <DoraCard label="Change fail rate" value={dora.cfr} unit="%"   trend="−2% vs last week"  up pct={92} delay="3"/>
        <DoraCard label="MTTR"             value={dora.mttr} unit="min" trend="+8min · target <30" up={false} pct={43} delay="4"/>
      </div>

      {/* Two-col row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.05fr",gap:12}}>
        {/* Integration health */}
        <Card>
          <CardHeader
            left="Platform health"
            right={<TextBtn onClick={()=>onNav("health")}>View integrations <Icon id="chevRight" size={10}/></TextBtn>}
          />
          <div style={{padding:"4px 16px 12px"}}>
            {integrations.map((it,i)=>(
              <div key={it.name} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<integrations.length-1?`1px solid ${DS.b1}`:"none"}}>
                <StatusDot status={it.st}/>
                <span style={{fontSize:12.5,color:DS.t2,flex:1}}>{it.name}</span>
                <span style={{fontSize:11,color:DS.t3,fontFamily:DS.mono}}>{it.val}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader left="Activity feed" subtext="All integrations · real-time"/>
          <div style={{padding:"4px 16px 12px"}}>
            {activity.map((a,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:i<activity.length-1?`1px solid ${DS.b1}`:"none"}}>
                <div style={{width:20,height:20,borderRadius:5,background:`${a.c}18`,border:`1px solid ${a.c}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:a.c}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11.5,color:DS.t2,lineHeight:1.5}}>{a.text}</div>
                </div>
                <span style={{fontSize:10,color:DS.t4,whiteSpace:"nowrap",marginTop:1}}>{a.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Pipeline table */}
      <Card>
        <CardHeader
          left="Pipeline activity"
          subtext="lint → SAST → test → build → ecr-push → notify → deploy"
          right={<TextBtn onClick={()=>onNav("golden")}>Golden thread <Icon id="chevRight" size={10}/></TextBtn>}
        />
        <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:9}}>
          {pipelines.map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:12.5,fontWeight:500,color:DS.t1,width:160,flexShrink:0,fontFamily:DS.mono,fontSize:11.5}}>{p.name}</div>
              <div style={{display:"flex",gap:3,flex:1}}>
                {p.stages.map((s,j)=>(
                  <div key={j} style={{height:5,flex:1,borderRadius:3,background:SC[s]||DS.b3,opacity:s===0?.3:1,animation:s===2?"pulse 1.2s ease-in-out infinite":undefined,transition:"background .2s"}}/>
                ))}
              </div>
              <div style={{width:55,textAlign:"right",flexShrink:0}}><Badge color={p.status}>{SL[p.status]}</Badge></div>
              <div style={{width:60,textAlign:"right",flexShrink:0,fontSize:10,color:DS.t4,fontFamily:DS.mono}}>{p.time}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── CATALOG ───────────────────────────────────────────────────────────────────
function Catalog({ live }) {
  const [filter, setFilter] = useState("All");

  const DEMO = [
    {name:"idp-platform-ai", type:"C",typc:"blue",  system:"developer-platform",  owner:"platform-engineering", lang:"Python 3.11", target:"EKS",       source:"GitLab",     s:[1,1,1,1,1,1,1], st:"green",  domain:"Platform"},
    {name:"spring-orders-poc", type:"C",typc:"blue", system:"order-fulfillment",   owner:"orders-team",          lang:"Java 17",     target:"EKS",       source:"GitLab",     s:[1,1,1,1,1,2,0], st:"blue",   domain:"Order Mgmt"},
    {name:"auth-gateway",      type:"C",typc:"blue", system:"security-system",     owner:"platform-eng",         lang:".NET 8",      target:"EKS",       source:"GitLab",     s:[1,1,1,1,1,1,1], st:"green",  domain:"Platform"},
    {name:"billing-service",   type:"C",typc:"blue", system:"billing-system",      owner:"finance-eng",          lang:"Java 17",     target:"EKS",       source:"GitHub",     s:[1,3,0,0,0,0,0], st:"red",    domain:"Finance"},
    {name:"notification-worker",type:"C",typc:"blue",system:"comms-system",        owner:"cx-team",              lang:"Python 3.11", target:"Lambda",    source:"GitLab",     s:[1,1,3,0,0,0,0], st:"red",    domain:"Customer XP"},
    {name:"shared-postgres",   type:"R",typc:"teal", system:"data-infra",          owner:"platform-eng",         lang:"PostgreSQL",  target:"RDS Multi-AZ",source:"GitLab", s:[1,1,1,1,1,1,1], st:"green",  domain:"Platform"},
  ];

  const liveRows = (live?.entities||[])
    .filter(e=>!DEMO.find(d=>d.name===e.metadata?.name))
    .map(e=>({name:e.metadata?.name,type:"C",typc:"blue",system:e.spec?.system||"—",owner:e.spec?.owner||"—",lang:"—",target:"EKS",source:"Backstage",s:[1,1,1,1,1,1,1],st:"green",domain:"Platform"}));

  const all = [...DEMO,...liveRows];
  const SC = {1:DS.ok,2:DS.ac,3:DS.er,0:DS.b3};
  const SB = {green:["green","Healthy"],blue:["blue","Running"],red:["red","Failed"],amber:["amber","At risk"]};
  const TC = {C:{bg:DS.inBg,c:"#60A8F8"},A:{bg:DS.puBg,c:DS.pu},R:{bg:DS.teBg,c:DS.te}};
  const domains = [...new Set(all.map(e=>e.domain))];

  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Service catalog</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Live from Backstage API · {all.length} entities · catalog-info.yaml validated</div>
      </div>

      <div className="stagger-2" style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:12}}>
        {/* Tree */}
        <Card style={{padding:"12px 10px",alignSelf:"start"}}>
          <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:DS.t4,padding:"0 4px",marginBottom:10}}>Domain hierarchy</div>
          {domains.map(d=>(
            <div key={d} style={{marginBottom:6}}>
              <div style={{fontSize:11.5,fontWeight:600,color:DS.t2,padding:"3px 6px",borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                <span style={{color:DS.t4}}>▾</span>{d}
              </div>
              <div style={{paddingLeft:18,marginTop:2}}>
                {all.filter(e=>e.domain===d).map(e=>(
                  <div key={e.name} style={{fontSize:11,color:DS.t4,padding:"2px 5px",borderRadius:4,cursor:"pointer",fontFamily:DS.mono,fontSize:10.5}}
                    onMouseEnter={ev=>ev.currentTarget.style.color=DS.ac}
                    onMouseLeave={ev=>ev.currentTarget.style.color=DS.t4}>
                    ↳ {e.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {liveRows.length>0&&(
            <div style={{marginTop:14,paddingTop:10,borderTop:`1px solid ${DS.b1}`}}>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:DS.t4,marginBottom:6}}>From Backstage</div>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:DS.ok,fontWeight:500}}>
                <StatusDot status="ok"/>{liveRows.length} live {liveRows.length===1?"entity":"entities"}
              </div>
            </div>
          )}
        </Card>

        {/* Table */}
        <div>
          {/* Filters */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {["All","Component","API","Resource","My team"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{
                background:filter===f?DS.acGlow:"transparent",
                border:`1px solid ${filter===f?DS.inBd:DS.b2}`,
                borderRadius:DS.r6, padding:"4px 10px",
                fontSize:11.5, color:filter===f?DS.t1:DS.t3,
                cursor:"pointer", transition:"all .1s", fontWeight:filter===f?500:400
              }}>{f}</button>
            ))}
            <span style={{marginLeft:"auto",fontSize:11,color:DS.t4}}>{all.length} entities</span>
          </div>

          <Card>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  {["","Service","System","Owner","Stack","Target","Pipeline","Status"].map((h,i)=>(
                    <th key={h} style={{
                      textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",
                      color:DS.t4,padding:"0 10px 8px",borderBottom:`1px solid ${DS.b2}`
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((e,i)=>{
                  const tc = TC[e.type]||TC.C;
                  const [sc,sl] = SB[e.st]||["gray","Unknown"];
                  return (
                    <tr key={i}
                      style={{cursor:"pointer",transition:"background .1s"}}
                      onMouseEnter={ev=>ev.currentTarget.style.background=DS.bg4}
                      onMouseLeave={ev=>ev.currentTarget.style.background=""}>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`,width:36}}>
                        <div style={{width:24,height:24,borderRadius:6,background:tc.bg,color:tc.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:800}}>{e.type}</div>
                      </td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}>
                        <div style={{fontSize:12.5,fontWeight:600,color:DS.t1,letterSpacing:"-.01em"}}>{e.name}</div>
                        <div style={{fontSize:10,color:DS.t4,marginTop:1}}>{e.domain}</div>
                      </td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}><Badge color="blue">{e.system}</Badge></td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`,fontSize:12,color:DS.t3}}>{e.owner}</td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`,fontSize:11,color:DS.t4,fontFamily:DS.mono}}>{e.lang}</td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}><Badge color="teal">{e.target}</Badge></td>
                      <td style={{padding:"9px 10px",borderBottom:`1px solid ${DS.b1}`}}>
                        <div style={{display:"flex",gap:3,alignItems:"center"}}>
                          {e.s.map((s,j)=><div key={j} style={{width:6,height:6,borderRadius:"50%",background:SC[s]||DS.b3,opacity:s===0?.3:1}}/>)}
                        </div>
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

// ─── AI COPILOT ────────────────────────────────────────────────────────────────
function Copilot({ live }) {
  const [msgs, setMsgs] = useState([{role:"ai",text:"I have context on your POC services — idp-platform-ai and spring-orders-poc are live on EKS. Backstage catalog is running headless. What would you like to know?"}]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);

  const send = async (text) => {
    const q = (text||input).trim();
    if(!q||thinking) return;
    setInput("");
    setMsgs(m=>[...m,{role:"user",text:q}]);
    setThinking(true);
    try {
      const res = await fetch(`${AI_URL}/api/v1/chat`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message:q,context:"Idp IDP POC on EKS us-east-1. idp-platform-ai (Python/FastAPI), spring-orders-poc (Java Spring Boot), Backstage headless catalog. All running via ArgoCD."})
      });
      const d = await res.json();
      setMsgs(m=>[...m,{role:"ai",text:d.response||d.message||"Received."}]);
    } catch {
      setMsgs(m=>[...m,{role:"ai",text:"Can't reach AI service right now.\n\nRun: kubectl port-forward svc/idp-platform-ai 8000:8000 -n platform-ai"}]);
    }
    setThinking(false);
  };

  const suggs = ["Which services are healthy right now?","What DORA metrics are we hitting?","Explain the spring-orders-poc pipeline","What's the status of the Backstage catalog?"];

  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 90px)"}}>
      <div className="stagger-1" style={{marginBottom:14,flexShrink:0}}>
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>AI copilot</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Claude Sonnet 4 · powered by idp-platform-ai · live on EKS us-east-1</div>
      </div>

      <div className="stagger-2" style={{flex:1,display:"grid",gridTemplateColumns:"1fr 260px",gap:12,minHeight:0}}>
        {/* Chat */}
        <div style={{background:DS.bg3,border:`1px solid ${DS.b2}`,borderRadius:DS.r10,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:DS.sh1}}>
          {/* Chat header */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{width:32,height:32,borderRadius:10,background:`linear-gradient(135deg,${DS.ac},${DS.te})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"white",flexShrink:0}}>
              <Icon id="aiSpark" size={14}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:DS.t1,letterSpacing:"-.02em"}}>Idp AI Copilot</div>
              <div style={{fontSize:10.5,color:live?.health?DS.ok:DS.t4,display:"flex",alignItems:"center",gap:4}}>
                {live?.health&&<StatusDot status="ok" animated/>}
                {live?.health?`Live · ${Math.round(live.health.checks?.claude_api?.latency_ms||960)}ms`:"Demo mode · connect to see live data"}
              </div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              <Badge color="teal">Claude Sonnet 4</Badge>
            </div>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:14}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",gap:4,alignItems:m.role==="ai"?"flex-start":"flex-end"}}>
                <div style={{fontSize:9.5,fontWeight:700,letterSpacing:".06em",color:m.role==="ai"?DS.te:DS.t4,display:"flex",alignItems:"center",gap:4,textTransform:"uppercase"}}>
                  {m.role==="ai"?<><Icon id="aiSpark" size={9}/>AI Copilot</>:"Ajith"}
                </div>
                <div style={{
                  maxWidth:"88%",
                  background:m.role==="ai"?DS.bg4:DS.acGlow,
                  border:`1px solid ${m.role==="ai"?DS.b2:DS.inBd}`,
                  borderRadius:m.role==="ai"?"2px 10px 10px 10px":"10px 2px 10px 10px",
                  padding:"10px 14px", fontSize:12.5, lineHeight:1.65,
                  color:DS.t2, whiteSpace:"pre-wrap"
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {thinking&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{fontSize:9.5,fontWeight:700,letterSpacing:".06em",color:DS.te,display:"flex",alignItems:"center",gap:4,textTransform:"uppercase"}}><Icon id="aiSpark" size={9}/>AI Copilot</div>
                <div style={{background:DS.bg4,border:`1px solid ${DS.b2}`,borderRadius:"2px 10px 10px 10px",padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                  <Spinner size={12}/><span style={{fontSize:12,color:DS.t4,fontStyle:"italic"}}>Thinking…</span>
                </div>
              </div>
            )}
            <div ref={endRef}/>
          </div>

          {/* Suggestions */}
          {msgs.length<=2&&(
            <div style={{padding:"8px 14px",borderTop:`1px solid ${DS.b1}`,display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>
              {suggs.map((s,i)=>(
                <button key={i} onClick={()=>send(s)} style={{
                  background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,
                  padding:"5px 10px",fontSize:11.5,color:DS.t3,cursor:"pointer",
                  transition:"all .1s"
                }}
                onMouseEnter={ev=>{ev.currentTarget.style.background=DS.bg4;ev.currentTarget.style.color=DS.t2;ev.currentTarget.style.borderColor=DS.b3;}}
                onMouseLeave={ev=>{ev.currentTarget.style.background=DS.bg5;ev.currentTarget.style.color=DS.t3;ev.currentTarget.style.borderColor=DS.b2;}}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${DS.b1}`,flexShrink:0}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
                placeholder="Ask about services, DORA metrics, incidents, pipelines…"
                style={{
                  flex:1,background:DS.bg5,border:`1px solid ${DS.b2}`,
                  borderRadius:DS.r8,padding:"9px 12px",
                  color:DS.t1,fontSize:12.5,outline:"none",
                  transition:"border-color .15s"
                }}
                onFocus={ev=>ev.currentTarget.style.borderColor=DS.ac}
                onBlur={ev=>ev.currentTarget.style.borderColor=DS.b2}/>
              <button onClick={()=>send()} disabled={thinking} style={{
                width:34,height:34,borderRadius:DS.r8,
                background:thinking?DS.bg5:DS.ac,
                border:"none",cursor:thinking?"not-allowed":"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                color:"white",flexShrink:0,transition:"background .12s",
                boxShadow:thinking?"none":`0 1px 4px ${DS.acGlow}`
              }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 13 13"><path d="M1 6.5h11M7 2l4.5 4.5L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{display:"flex",flexDirection:"column",gap:10,overflowY:"auto"}}>
          {[
            {title:"AI engine", rows:[["Model","claude-sonnet-4"],["Status",live?.health?"Healthy":"Demo"],["Latency",live?.health?`~${Math.round(live.health.checks?.claude_api?.latency_ms||960)}ms`:"—"],["Endpoint","localhost:8000"]]},
            {title:"Backstage (headless)", rows:[["Status","Running"],["Catalog API","200 OK"],["Port","localhost:7007"],["Entities",live?.entities?.length||"2+"]]},
            {title:"EKS services", rows:[["idp-platform-ai","1/1 Running"],["spring-orders-poc","1/1 Running"],["backstage","1/1 Running"],["argocd","6/7 Running"]]},
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

// ─── PLATFORM HEALTH ───────────────────────────────────────────────────────────
function Health({ live }) {
  const cards = [
    {name:"GitLab CI/CD",  st:"ok",  rows:[["Pipelines today","8"],["Green","6"],["Failed","1"],["Running","1"]]},
    {name:"ArgoCD",        st:"ok",  rows:[["Apps","3"],["Synced","3"],["Healthy","3"],["Namespace","argocd"]]},
    {name:"AWS ECR",       st:"ok",  rows:[["Repos","3"],["Images","18+"],["Region","us-east-1"],["Auth","SSO"]]},
    {name:"Backstage",     st:"ok",  rows:[["Entities",live?.entities?.length||"2+"],["Catalog API","200 OK"],["Mode","Headless"],["Auth","Guest"]]},
    {name:"idp-platform-ai",st:live?.health?"ok":"warn",rows:[["Status",live?.health?"Healthy":"Unreachable"],["Claude","OK"],["Latency","~960ms"],["Version","v1.0.0"]]},
    {name:"AWS SSO",       st:"warn",rows:[["Session","Active"],["Expires","~6h"],["Account","123456789012"],["Profile","idp_dev_pwruser"]]},
  ];
  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Platform health</div>
        <div style={{fontSize:12.5,color:DS.t3}}>POC environment · EKS us-east-1 · {cards.length} integrations monitored</div>
      </div>
      <div className="stagger-2" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {cards.map((c,i)=>(
          <Card key={i}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:13,fontWeight:600,color:DS.t1,letterSpacing:"-.01em"}}>{c.name}</span>
              <StatusDot status={c.st}/>
            </div>
            <div style={{padding:"4px 14px 10px"}}>
              {c.rows.map(([k,v],j)=><Row key={k} label={k} value={v} mono last={j===c.rows.length-1}/>)}
            </div>
          </Card>
        ))}
      </div>
      <div className="stagger-3">
        <Card>
          <CardHeader left="EKS cluster · test-cluster-cicd-deployment · us-east-1"/>
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {ns:"platform-ai",pods:[{n:"idp-platform-ai",st:"ok",r:"1/1",rs:0}]},
              {ns:"orders",pods:[{n:"spring-orders-poc",st:"ok",r:"1/1",rs:0}]},
              {ns:"backstage",pods:[{n:"backstage",st:"ok",r:"1/1",rs:0}]},
              {ns:"argocd",pods:[{n:"argocd-server",st:"ok",r:"1/1",rs:0},{n:"argocd-applicationset",st:"warn",r:"0/1",rs:1098}]},
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

// ─── GOLDEN THREAD ─────────────────────────────────────────────────────────────
function GoldenThread() {
  const [svc,setSvc] = useState("idp-platform-ai");
  const stages = [
    {l:"Lint",    v:"ESLint / Flake8",  t:"22s"},
    {l:"SAST",    v:"Bandit / Semgrep", t:"45s"},
    {l:"Tests",   v:"pytest / JUnit",   t:"1m 12s"},
    {l:"Build",   v:"Docker multi-stage",t:"1m 40s"},
    {l:"ECR push",v:"v1.0.0-xxxxxxx",   t:"28s"},
    {l:"ArgoCD",  v:"Helm values-prod", t:"18s"},
    {l:"EKS",     v:"1/1 Running",      t:"42s"},
  ];
  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Golden thread</div>
        <div style={{fontSize:12.5,color:DS.t3}}>End-to-end traceability · commit → pipeline → ECR → ArgoCD → EKS</div>
      </div>
      <div className="stagger-2" style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{fontSize:12,color:DS.t3}}>Service:</span>
        <select value={svc} onChange={e=>setSvc(e.target.value)} style={{background:DS.bg4,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"6px 11px",color:DS.t1,fontSize:13,outline:"none",cursor:"pointer"}}>
          {["idp-platform-ai","spring-orders-poc"].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <Badge color="green">All stages passed</Badge>
      </div>
      <div className="stagger-3">
        <Card>
          <CardHeader left="Pipeline stages"/>
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
        </Card>
      </div>
      <div className="stagger-4">
        <Card>
          <CardHeader left={`Deployment inventory · ${svc}`}/>
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[
              ["GitLab repo",`gitlab.com/idp-group/devops/idp-platform/${svc}`],
              ["ECR image",`123456789012.dkr.ecr.us-east-1.amazonaws.com/idp-poc/${svc}`],
              ["Image tag","v1.0.0-latest"],
              ["Helm chart","./helm/values-prod.yaml"],
              ["K8s namespace",svc.includes("orders")?"orders":"platform-ai"],
              ["ArgoCD app",svc],
            ].map(([k,v])=>(
              <div key={k} style={{background:DS.bg4,borderRadius:DS.r8,padding:"10px 12px"}}>
                <div style={{fontSize:9.5,fontWeight:700,color:DS.t4,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{k}</div>
                <div style={{fontSize:11,fontFamily:DS.mono,color:DS.ac,wordBreak:"break-all",lineHeight:1.5}}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── TECH INSIGHTS ─────────────────────────────────────────────────────────────
function Insights() {
  const data = [
    {s:"idp-platform-ai",  cicd:92,sec:88,obs:85,docs:70,dora:95,deps:90,ov:87},
    {s:"spring-orders-poc", cicd:88,sec:82,obs:79,docs:65,dora:88,deps:85,ov:81},
    {s:"auth-gateway",      cicd:95,sec:91,obs:88,docs:80,dora:90,deps:87,ov:89},
    {s:"billing-service",   cicd:55,sec:42,obs:60,docs:45,dora:50,deps:65,ov:53},
    {s:"notification-worker",cicd:78,sec:55,obs:70,docs:50,dora:72,deps:75,ov:67},
  ];
  const col = v => v>=85?"#22C77A":v>=65?DS.wa:DS.er;
  const ScoreBar = ({v}) => (
    <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
      <div style={{width:40,height:4,background:DS.bg5,borderRadius:4,overflow:"hidden"}}>
        <div style={{width:`${v}%`,height:"100%",background:col(v),borderRadius:4}}/>
      </div>
      <span style={{fontSize:10.5,fontFamily:DS.mono,fontWeight:600,color:col(v),width:24,textAlign:"right"}}>{v}</span>
    </div>
  );
  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Tech insights</div>
        <div style={{fontSize:12.5,color:DS.t3}}>6 scorecard categories · automated fact collectors every 15 min</div>
      </div>
      <div className="stagger-2" style={{fontSize:10.5,color:DS.t4}}>CI/CD Adoption · Security Posture · Observability Coverage · Documentation Quality · DORA Performance · Dependency Hygiene</div>
      <div className="stagger-3">
        <Card>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              {["Service","CI/CD","Security","Observ.","Docs","DORA","Deps","Overall"].map((h,i)=>(
                <th key={h} style={{textAlign:i===0?"left":"center",fontSize:9.5,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",color:DS.t4,padding:"0 10px 9px",borderBottom:`1px solid ${DS.b2}`}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.map((r,i)=>(
                <tr key={i} style={{transition:"background .1s"}}
                  onMouseEnter={ev=>ev.currentTarget.style.background=DS.bg4}
                  onMouseLeave={ev=>ev.currentTarget.style.background=""}>
                  <td style={{padding:"10px 10px",borderBottom:`1px solid ${DS.b1}`,fontSize:12.5,fontWeight:600,color:DS.t1,fontFamily:DS.mono,fontSize:12}}>{r.s}</td>
                  {[r.cicd,r.sec,r.obs,r.docs,r.dora,r.deps].map((v,j)=>(
                    <td key={j} style={{padding:"8px 10px",borderBottom:`1px solid ${DS.b1}`,textAlign:"center"}}><ScoreBar v={v}/></td>
                  ))}
                  <td style={{padding:"10px 10px",borderBottom:`1px solid ${DS.b1}`,textAlign:"center"}}>
                    <span style={{fontSize:14,fontWeight:700,color:col(r.ov),letterSpacing:"-.02em"}}>{r.ov}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ─── INFRA ─────────────────────────────────────────────────────────────────────
function Infra() {
  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>Infrastructure</div>
        <div style={{fontSize:12.5,color:DS.t3}}>AWS us-east-1 · account 123456789012 · POC environment</div>
      </div>
      <div className="stagger-2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[
          {t:"EKS cluster",sub:"test-cluster-cicd-deployment",rows:[["Nodes","2x t3.medium"],["K8s version","v1.34.2-eks"],["Region","us-east-1"],["Status","Active"],["Namespaces","platform-ai · orders · backstage · argocd"]]},
          {t:"ECR repositories",sub:"Container registry",rows:[["idp-poc/idp-platform-ai","5 images"],["idp-poc/spring-orders-poc","2 images"],["idp-poc/backstage","12+ images"],["Auth","aws ecr get-login-password"]]},
          {t:"AWS infrastructure",sub:"Terraform managed",rows:[["S3 state","idp-poc-tf-state-123456789012-idp"],["DynamoDB","idp-poc-tf-locks"],["OIDC provider","gitlab.com (exists)"],["Subnets","subnet-0d32dc7e · subnet-0ce39a84"]]},
          {t:"GitLab CI/CD",sub:"Idp GitLab group",rows:[["Group","idp-group/devops/idp-platform"],["Pipelines","3 repos · all green"],["Runners","GitLab SaaS · Linux · small"],["Group vars","12 variables"]]},
        ].map((c,i)=>(
          <Card key={i}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${DS.b1}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:DS.t1,letterSpacing:"-.01em"}}>{c.t}</div>
                <div style={{fontSize:10.5,color:DS.t4,marginTop:2}}>{c.sub}</div>
              </div>
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

// ─── NEW SERVICE ───────────────────────────────────────────────────────────────
function NewService() {
  const [step,setStep] = useState(0);
  const [tpl,setTpl] = useState("");
  const [form,setForm] = useState({name:"",owner:"",target:"eks",desc:""});
  const TPLS = [
    {id:"python-fastapi",icon:"🐍",name:"Python FastAPI",desc:"FastAPI + SQLAlchemy · Dockerfile + Helm + golden pipeline"},
    {id:"java-spring",icon:"☕",name:"Java Spring Boot",desc:"Spring Boot 3 · Maven · SAST + ArgoCD EKS deploy"},
    {id:"node-express",icon:"⬡",name:"Node.js Express",desc:"Express + TypeScript · Jest · golden pipeline"},
    {id:"dotnet",icon:"⬛",name:".NET 8 Web API",desc:".NET 8 + Entity Framework · Helm + ArgoCD"},
    {id:"react-spa",icon:"⚛",name:"React SPA",desc:"Vite + TypeScript + Tailwind · S3/CloudFront"},
    {id:"terraform",icon:"🏗",name:"Terraform module",desc:"AWS module + tftest · state in S3 DynamoDB"},
  ];
  const STEPS = ["Template","Configure","Review"];

  const Field = ({label,name,ph,full=false}) => (
    <div style={{display:"flex",flexDirection:"column",gap:5,gridColumn:full?"span 2":"auto"}}>
      <label style={{fontSize:10.5,fontWeight:700,color:DS.t4,textTransform:"uppercase",letterSpacing:".08em"}}>{label}</label>
      <input value={form[name]} onChange={e=>setForm({...form,[name]:e.target.value})} placeholder={ph}
        style={{background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"8px 11px",color:DS.t1,fontSize:13,outline:"none",width:"100%",transition:"border-color .15s"}}
        onFocus={ev=>ev.currentTarget.style.borderColor=DS.ac}
        onBlur={ev=>ev.currentTarget.style.borderColor=DS.b2}/>
    </div>
  );

  return (
    <div className="page-enter" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="stagger-1">
        <div style={{fontSize:20,fontWeight:700,color:DS.t1,letterSpacing:"-.04em",marginBottom:3}}>New service</div>
        <div style={{fontSize:12.5,color:DS.t3}}>Scaffold · golden pipeline + Helm + catalog-info.yaml auto-generated</div>
      </div>

      <div style={{maxWidth:700}}>
        {/* Stepper */}
        <div className="stagger-2" style={{display:"flex",alignItems:"center",marginBottom:24}}>
          {STEPS.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",flex:i<STEPS.length-1?1:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{
                  width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10.5,fontWeight:700,flexShrink:0,
                  background:i<step?DS.ok:i===step?DS.ac:DS.bg5,
                  color:i<=step?"white":DS.t4,
                  border:i===step?`2px solid ${DS.acH}`:`1px solid ${DS.b2}`,
                  boxShadow:i===step?`0 0 0 3px ${DS.acGlow}`:"none",
                  transition:"all .2s"
                }}>{i<step?"✓":i+1}</div>
                <span style={{fontSize:12.5,fontWeight:i===step?600:400,color:i===step?DS.t1:DS.t3}}>{s}</span>
              </div>
              {i<STEPS.length-1&&<div style={{flex:1,height:1.5,background:i<step?DS.ok:DS.b2,margin:"0 10px",transition:"background .3s"}}/>}
            </div>
          ))}
        </div>

        {/* Step 0: Template */}
        {step===0&&(
          <div className="page-enter">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
              {TPLS.map(t=>(
                <div key={t.id} onClick={()=>setTpl(t.id)} style={{
                  background:tpl===t.id?DS.acGlow:DS.bg3,
                  border:`1.5px solid ${tpl===t.id?DS.ac:DS.b2}`,
                  borderRadius:DS.r10,padding:14,cursor:"pointer",
                  transition:"all .15s",boxShadow:tpl===t.id?DS.shAc:DS.sh1
                }}
                onMouseEnter={ev=>{if(tpl!==t.id){ev.currentTarget.style.borderColor=DS.b3;ev.currentTarget.style.background=DS.bg4;}}}
                onMouseLeave={ev=>{if(tpl!==t.id){ev.currentTarget.style.borderColor=DS.b2;ev.currentTarget.style.background=DS.bg3;}}}>
                  <div style={{width:34,height:34,borderRadius:DS.r8,background:DS.bg5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{t.icon}</div>
                  <div style={{fontSize:13,fontWeight:600,color:DS.t1,letterSpacing:"-.01em",marginBottom:4}}>{t.name}</div>
                  <div style={{fontSize:11,color:DS.t4,lineHeight:1.5}}>{t.desc}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>tpl&&setStep(1)} style={{background:tpl?DS.ac:DS.bg5,border:`1px solid ${tpl?DS.ac:DS.b2}`,borderRadius:DS.r8,padding:"9px 20px",color:tpl?"white":DS.t4,fontWeight:600,cursor:tpl?"pointer":"not-allowed",fontSize:13,transition:"all .15s",boxShadow:tpl?`0 1px 4px ${DS.acGlow}`:"none"}}>
                Next: Configure →
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Configure */}
        {step===1&&(
          <div className="page-enter">
            <Card style={{padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:DS.t1,letterSpacing:"-.01em",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
                Service details
                <div style={{flex:1,height:1,background:DS.b1}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Field label="Service name" name="name" ph="e.g. payments-api"/>
                <Field label="Owner team" name="owner" ph="e.g. platform-engineering"/>
                <Field label="Description" name="desc" ph="Brief description" full/>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <label style={{fontSize:10.5,fontWeight:700,color:DS.t4,textTransform:"uppercase",letterSpacing:".08em"}}>Deploy target</label>
                  <select value={form.target} onChange={e=>setForm({...form,target:e.target.value})} style={{background:DS.bg5,border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"8px 11px",color:DS.t1,fontSize:13,outline:"none",cursor:"pointer"}}>
                    <option value="eks">EKS (Kubernetes)</option>
                    <option value="lambda">AWS Lambda</option>
                    <option value="ecs">AWS ECS</option>
                  </select>
                </div>
              </div>
            </Card>
            <div style={{background:DS.bg0,border:`1px solid ${DS.b1}`,borderRadius:DS.r8,padding:"12px 14px",fontFamily:DS.mono,fontSize:11,color:DS.te,lineHeight:1.9,marginBottom:16}}>
              <div style={{color:DS.t4,marginBottom:4}}># Auto-generated .gitlab-ci.yml</div>
              <div><span style={{color:DS.wa}}>stages:</span> [lint, sast, test, build, ecr-push, deploy]</div>
              <div><span style={{color:DS.wa}}>variables:</span></div>
              <div>{"  "}<span style={{color:"#60A8F8"}}>SERVICE_NAME:</span> {form.name||"<service-name>"}</div>
              <div>{"  "}<span style={{color:"#60A8F8"}}>DEPLOY_TARGET:</span> {form.target}</div>
              <div style={{color:DS.t4}}># + catalog-info.yaml · Dockerfile · Helm chart · README</div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <button onClick={()=>setStep(0)} style={{background:"transparent",border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"9px 18px",color:DS.t3,cursor:"pointer",fontSize:13,fontWeight:500}}>← Back</button>
              <button onClick={()=>form.name&&form.owner&&setStep(2)} style={{background:form.name&&form.owner?DS.ac:DS.bg5,border:`1px solid ${form.name&&form.owner?DS.ac:DS.b2}`,borderRadius:DS.r8,padding:"9px 20px",color:form.name&&form.owner?"white":DS.t4,fontWeight:600,cursor:form.name&&form.owner?"pointer":"not-allowed",fontSize:13,transition:"all .15s"}}>
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step===2&&(
          <div className="page-enter">
            <div style={{background:DS.okBg,border:`1px solid ${DS.okBd}`,borderRadius:DS.r8,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#22C77A",display:"flex",alignItems:"center",gap:8,fontWeight:500}}>
              <svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 7l1.5 1.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Ready to scaffold · GitLab repo, golden pipeline, Backstage entry, Helm chart — all auto-generated
            </div>
            <Card style={{padding:"4px 20px 12px",marginBottom:16}}>
              {[["Template",TPLS.find(t=>t.id===tpl)?.name||tpl],["Service name",form.name],["Owner",form.owner],["Deploy target",form.target],["Description",form.desc||"—"]].map(([k,v],j,arr)=>(
                <Row key={k} label={k} value={v} last={j===arr.length-1}/>
              ))}
            </Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <button onClick={()=>setStep(1)} style={{background:"transparent",border:`1px solid ${DS.b2}`,borderRadius:DS.r8,padding:"9px 18px",color:DS.t3,cursor:"pointer",fontSize:13,fontWeight:500}}>← Back</button>
              <button onClick={()=>alert("🚀 In production this creates:\n\n1. GitLab repo in idp-group/devops/idp-platform\n2. Golden pipeline (lint→SAST→test→build→ECR→deploy)\n3. Backstage catalog-info.yaml\n4. Helm chart + ArgoCD Application\n5. Slack notification to owner team")}
                style={{background:DS.ok,border:"none",borderRadius:DS.r8,padding:"9px 22px",color:"white",fontWeight:700,cursor:"pointer",fontSize:13,boxShadow:`0 1px 4px ${DS.okBg}`,letterSpacing:"-.01em"}}>
                🚀 Create service
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [live,    setLive]   = useState(null);
  const [liveStatus, setLS]  = useState("loading");

  // Inject global CSS once
  useEffect(()=>{
    const el = document.createElement("style");
    el.textContent = GLOBAL;
    document.head.appendChild(el);
    return ()=>{ try{document.head.removeChild(el);}catch{} };
  },[]);

  // Auto-connect to POC services
  useEffect(()=>{
    (async()=>{
      try {
        const [healthRes, entRes] = await Promise.allSettled([
          fetch(`${AI_URL}/api/v1/health`, {signal:AbortSignal.timeout(4000)}).then(r=>r.json()),
          fetch(`${BKSTG_URL}/api/catalog/entities`, {signal:AbortSignal.timeout(4000)}).then(r=>r.json()),
        ]);
        const health = healthRes.status==="fulfilled" ? healthRes.value : null;
        const entities = entRes.status==="fulfilled" && Array.isArray(entRes.value) ? entRes.value : [];
        if(health || entities.length>0){
          setLive({ health, entities, dora:{df:"3.2",lt:"2.1",cfr:"8",mttr:"47"}, services:Math.max(47,entities.length) });
          setLS("connected");
        } else {
          setLS("demo");
        }
      } catch { setLS("demo"); }
    })();
  },[]);

  const SCREENS = {
    dashboard: <Dashboard live={live} onNav={setScreen}/>,
    catalog:   <Catalog live={live}/>,
    insights:  <Insights/>,
    copilot:   <Copilot live={live}/>,
    health:    <Health live={live}/>,
    infra:     <Infra/>,
    golden:    <GoldenThread/>,
    newservice:<NewService/>,
  };

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:DS.bg0}}>
      <Sidebar active={screen} onNav={setScreen} live={liveStatus} entityCount={live?.entities?.length}/>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        <Topbar screen={screen} onNav={setScreen}/>

        <main
          key={screen}
          style={{flex:1,overflowY:"auto",padding:"22px 24px",background:DS.bg1}}
        >
          {SCREENS[screen] || <div style={{color:DS.t4,padding:20}}>Screen not found</div>}
        </main>
      </div>
    </div>
  );
}
