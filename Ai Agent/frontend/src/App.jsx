import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_GW   = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const CORE_URL = 'http://localhost:8081';

const NAV = [
  { id:'dashboard',      icon:'⚡', label:'Dashboard',       section:'CORE' },
  { id:'agents',         icon:'🤖', label:'Agent Fleet',     section:'CORE' },
  { id:'memory',         icon:'🧠', label:'Memory & RAG',    section:'CORE' },
  { id:'observability',  icon:'📡', label:'Observability',   section:'CORE' },
  { id:'audit',          icon:'📋', label:'Audit Logs',      section:'CORE' },
  { id:'rlhf',           icon:'🎓', label:'RLHF Training',   section:'AI' },
  { id:'predictive',     icon:'🔮', label:'Predictive AI',   section:'AI' },
  { id:'knowledge',      icon:'🕸️', label:'Knowledge Graph', section:'AI' },
  { id:'constitution',   icon:'⚖️', label:'AI Constitution', section:'AI' },
  { id:'scheduler',      icon:'⏰', label:'Scheduler',       section:'AI' },
  { id:'explainability', icon:'💡', label:'Explainability',  section:'AI' },
];

const AGENT_META = {
  DevOps:   { icon:'🔧', color:'#0ea5e9', bg:'rgba(14,165,233,0.12)',  tools:['k8s_metrics','app_logs','ci_cd'],        role:'Infrastructure & Logs' },
  Data:     { icon:'📊', color:'#ec4899', bg:'rgba(236,72,153,0.12)',  tools:['sql_query','kpi_dashboard'],             role:'SQL & Analytics' },
  Research: { icon:'🔬', color:'#10b981', bg:'rgba(16,185,129,0.12)', tools:['kb_search','web_search'],                role:'RAG & Web Search' },
  Support:  { icon:'🎫', color:'#f59e0b', bg:'rgba(245,158,11,0.12)', tools:['get_ticket','draft_response','escalate'], role:'Ticket Triage' },
  Security: { icon:'🔒', color:'#ef4444', bg:'rgba(239,68,68,0.12)',  tools:['access_logs','vuln_scan','threat_feeds'], role:'Threat Intelligence' },
  Memory:   { icon:'🧠', color:'#a855f7', bg:'rgba(168,85,247,0.12)', tools:['session_store','vector_search','compress'],role:'Vector Memory' },
};

const QUICK_PROMPTS = [
  { label:'🔧 K8s Triage',    text:'Inspect Kubernetes pods memory usage and check auth service logs for errors.' },
  { label:'📊 KPI Report',    text:'Generate weekly conversion rate KPI report and run sales revenue query.' },
  { label:'🔒 Security Scan', text:'Verify access logs for anomalies and check for security vulnerabilities.' },
  { label:'🎫 Support',       text:'Analyze login timeout ticket and draft a client response.' },
  { label:'🔬 Research',      text:'Research competitor AI platforms and summarize best practices from knowledge base.' },
];

const timeAgo = iso => {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  return `${Math.floor(d/3600000)}h ago`;
};
const confClass = v => v >= 0.85 ? 'high' : v >= 0.65 ? 'medium' : 'low';
const badgeCls  = s => `badge badge-${({RUNNING:'running',COMPLETED:'completed',SUSPENDED:'suspended',FAILED:'failed',DEGRADED:'degraded',PENDING:'pending'}[s]||'pending')}`;
const wfIcon    = p => { const l=p.toLowerCase(); return l.includes('k8s')||l.includes('pod')?'🔧':l.includes('security')?'🔒':l.includes('kpi')||l.includes('sql')?'📊':l.includes('ticket')?'🎫':l.includes('research')?'🔬':'⚡'; };
const fmt = n => typeof n === 'number' ? n.toFixed(2) : n;

/* ─── TOAST ─────────────────────────────────────────────── */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((type, title, msg) => {
    const id = Date.now();
    setToasts(t => [...t, { id, type, title, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, add };
}
function Toasts({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-icon">{t.type==='success'?'✅':t.type==='error'?'❌':t.type==='warning'?'⚠️':'ℹ️'}</span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.msg && <div className="toast-msg">{t.msg}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── SHARED UI ATOMS ───────────────────────────────────── */
function Sparkline({ data, color }) {
  const max = Math.max(...data, 1);
  return (
    <div className="sparkline">
      {data.map((v,i) => <div key={i} className="spark-bar" style={{height:`${(v/max)*100}%`,background:color||'rgba(99,102,241,0.4)'}}/>)}
    </div>
  );
}

function Donut({ segments }) {
  const total = segments.reduce((s,x)=>s+x.value,0)||1;
  let offset=0; const r=40,cx=50,cy=50,circ=2*Math.PI*r;
  return (
    <div className="donut-wrap">
      <svg className="donut-svg" width="100" height="100" viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12"/>
        {segments.map((seg,i) => {
          const dash=(seg.value/total)*circ, gap=circ-dash;
          const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth="12"
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="round"
            style={{transform:'rotate(-90deg)',transformOrigin:'50% 50%'}}/>;
          offset+=dash; return el;
        })}
        <text x="50" y="54" textAnchor="middle" fill="white" fontSize="11" fontWeight="800" fontFamily="Outfit">{total.toLocaleString()}</text>
      </svg>
      <div className="donut-legend">
        {segments.map((seg,i) => (
          <div key={i} className="donut-legend-item">
            <div className="donut-legend-dot" style={{background:seg.color}}/>
            <span className="donut-legend-label">{seg.label}</span>
            <span className="donut-legend-value">{seg.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentGraph({ workflow }) {
  const subtasks = workflow?.subtasks || [];
  const active = new Set(subtasks.filter(s=>s.status==='RUNNING').map(s=>s.agent_domain));
  const done   = new Set(subtasks.filter(s=>s.status==='COMPLETED').map(s=>s.agent_domain));
  const fail   = new Set(subtasks.filter(s=>s.status==='FAILED').map(s=>s.agent_domain));
  const ns = n => active.has(n)?'active':done.has(n)?'success':fail.has(n)?'error':'';
  const ec = n => `graph-edge${active.has(n)?' active':done.has(n)?' success':''}`;
  const nodes=[{key:'DevOps',cls:'node-devops'},{key:'Data',cls:'node-data'},{key:'Research',cls:'node-research'},{key:'Support',cls:'node-support'},{key:'Security',cls:'node-security'}];
  return (
    <div className="agent-graph">
      <svg className="graph-svg" viewBox="0 0 420 280" preserveAspectRatio="none">
        <path d="M210,74 Q80,140 50,220"   className={ec('DevOps')}/>
        <path d="M210,74 Q140,150 130,220" className={ec('Data')}/>
        <path d="M210,74 L210,220"         className={ec('Research')}/>
        <path d="M210,74 Q280,150 290,220" className={ec('Support')}/>
        <path d="M210,74 Q340,140 370,220" className={ec('Security')}/>
      </svg>
      <div className={`graph-node node-supervisor ${workflow?.status==='RUNNING'?'active':workflow?.status==='COMPLETED'?'success':''}`}>
        <div className="graph-node-circle" style={{background:'rgba(168,85,247,0.15)',borderColor:'#a855f7'}}>🎯</div>
        <div className="graph-node-label">Supervisor</div>
        <div className="graph-node-status">{workflow?.status||'idle'}</div>
      </div>
      {nodes.map(n => {
        const m=AGENT_META[n.key]||{};
        return (
          <div key={n.key} className={`graph-node ${n.cls} ${ns(n.key)}`}>
            <div className="graph-node-circle" style={{background:m.bg}}>{m.icon}</div>
            <div className="graph-node-label">{n.key}</div>
            <div className="graph-node-status">{ns(n.key)||'idle'}</div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{desc}</div>
    </div>
  );
}

/* ─── DASHBOARD PAGE ────────────────────────────────────── */
function DashboardPage({ workflows, selectedWorkflow, onSelect, onSubmit, onApprove, isSubmitting, pendingCount }) {
  const [prompt, setPrompt] = useState('');
  const wf = selectedWorkflow;
  const synthesis = wf?.metadata_json?.synthesis;
  const checkpoints = wf?.checkpoints || [];
  const subtasks = wf?.subtasks || [];
  const handleSubmit = e => { e.preventDefault(); if (!prompt.trim()) return; onSubmit(prompt); setPrompt(''); };

  return (
    <>
      <div className="kpi-grid">
        {[
          {label:'Total Workflows',  value:workflows.length,                                          color:'accent', icon:'⚡', delta:'Active system'},
          {label:'Completed',        value:workflows.filter(w=>w.status==='COMPLETED').length,        color:'cyan',   icon:'✅', delta:'All time'},
          {label:'Pending Approvals',value:pendingCount,                                              color:'fire',   icon:'⚠️', delta:pendingCount>0?'Action required':'All clear'},
          {label:'Agents Online',    value:6,                                                         color:'green',  icon:'🤖', delta:'All healthy'},
        ].map(k => (
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className={`kpi-icon ${k.color}`}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-value ${k.color}`}>{k.value}</div>
            <div className={`kpi-delta ${k.color==='fire'&&pendingCount>0?'down':'up'}`}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="command-box">
        <div className="command-header">
          <span>🎯</span><span className="command-label">Operator Command</span>
          <div className="command-model-badge"><span>🧠</span> GPT-5 / Claude / Llama3</div>
        </div>
        <form onSubmit={handleSubmit}>
          <textarea className="command-textarea" value={prompt} onChange={e=>setPrompt(e.target.value)}
            placeholder="Describe your operational task… e.g. 'Analyze cloud cost spikes and generate optimization recommendations'"
            onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))handleSubmit(e);}}/>
          <div className="command-footer">
            <div className="quick-prompts">
              {QUICK_PROMPTS.map((qp,i)=><button key={i} type="button" className="quick-chip" onClick={()=>setPrompt(qp.text)}>{qp.label}</button>)}
            </div>
            <button className="execute-btn" type="submit" disabled={isSubmitting||!prompt.trim()}>
              {isSubmitting?<><span className="spinner"/>Decomposing…</>:<><span>▶</span>Execute</>}
            </button>
          </div>
        </form>
      </div>

      <div className="main-grid">
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
          <div className="card">
            <div className="workflow-list-header">
              <span className="workflow-list-title">Workflows</span>
              <span className="workflow-count-badge">{workflows.length}</span>
            </div>
            {workflows.length===0
              ? <EmptyState icon="⚡" title="No workflows yet" desc="Submit a command above to start your first autonomous workflow."/>
              : <div className="workflow-list">
                  {workflows.map(w=>(
                    <div key={w.id} className={`workflow-item ${wf?.id===w.id?'selected':''}`} onClick={()=>onSelect(w.id)}>
                      <div className="workflow-item-icon" style={{background:'rgba(99,102,241,0.1)'}}>{wfIcon(w.prompt)}</div>
                      <div className="workflow-item-body">
                        <div className="workflow-item-prompt">{w.prompt}</div>
                        <div className="workflow-item-meta">{timeAgo(w.created_at)} · {w.id.slice(0,8)}</div>
                      </div>
                      <span className={badgeCls(w.status)}><span className="badge-dot"/>{w.status}</span>
                    </div>
                  ))}
                </div>
            }
          </div>

          {wf && subtasks.length>0 && (
            <div className="card">
              <div className="card-title">🔩 Agent Subtasks</div>
              <div className="subtask-list">
                {subtasks.map((s,i)=>{
                  const m=AGENT_META[s.agent_domain]||{};
                  return (
                    <div key={s.id||i} className={`subtask-item ${s.agent_domain}`} style={{animationDelay:`${i*0.08}s`}}>
                      <div className="subtask-icon" style={{background:m.bg}}>{m.icon}</div>
                      <div className="subtask-body">
                        <div className="subtask-title">{s.title}<span className={badgeCls(s.status)}><span className="badge-dot"/>{s.status}</span></div>
                        <div className="subtask-desc">{s.description}</div>
                        {s.status==='RUNNING'&&<div className="typing-indicator"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>}
                        {s.result?.insight&&<div className="subtask-result">💡 {s.result.insight}</div>}
                        {s.confidence>0&&<div className="confidence-bar"><div className="confidence-track"><div className={`confidence-fill ${confClass(s.confidence)}`} style={{width:`${s.confidence*100}%`}}/></div><span className="confidence-label">{(s.confidence*100).toFixed(0)}%</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          {wf ? (
            <>
              <div className="card exec-panel">
                <div className="exec-header">
                  <div><div className="exec-prompt">{wf.prompt}</div><div className="exec-meta">ID: {wf.id.slice(0,16)}… · {timeAgo(wf.created_at)}</div></div>
                  <span className={badgeCls(wf.status)}><span className="badge-dot"/>{wf.status}</span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-label"><span>Completion</span><span>{wf.completion_percentage||0}%</span></div>
                  <div className="progress-track"><div className="progress-fill" style={{width:`${wf.completion_percentage||0}%`}}/></div>
                </div>
                <AgentGraph workflow={wf}/>
              </div>

              {checkpoints.filter(c=>c.status==='PENDING').map(cp=>(
                <div key={cp.id} className="approval-banner">
                  <div className="approval-header"><div className="approval-icon">⚠️</div><span className="approval-title">Human Approval Required</span><span className="approval-type-badge">{cp.action_type}</span></div>
                  <div className="approval-desc">{cp.description}</div>
                  <div className="approval-actions">
                    <button className="btn-approve" onClick={()=>onApprove(cp.id,true)}>✓ Approve</button>
                    <button className="btn-reject"  onClick={()=>onApprove(cp.id,false)}>✕ Reject</button>
                  </div>
                </div>
              ))}

              {checkpoints.filter(c=>c.status!=='PENDING').map(cp=>(
                <div key={cp.id} style={{padding:'0.6rem 1rem',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)',fontSize:'0.78rem',color:'var(--text-muted)',display:'flex',gap:'0.5rem'}}>
                  {cp.status==='APPROVED'?'✅':'❌'} {cp.action_type} — {cp.status}
                </div>
              ))}

              {synthesis&&(
                <div className="synthesis-box">
                  <div className="synthesis-header"><span>🧬</span><span className="synthesis-title">Decision Engine</span><span className="synthesis-confidence">{((synthesis.confidence_level||0)*100).toFixed(0)}% conf</span></div>
                  <div className="synthesis-text">{synthesis.summary}</div>
                  <div className="synthesis-grounding"><span className="rag-badge">RAG</span>Grounded · {synthesis.grounding_context?.length||0} docs{synthesis.conflict_detected&&<span style={{color:'var(--color-warning)',marginLeft:'0.5rem'}}>⚠️ Conflict</span>}</div>
                </div>
              )}
            </>
          ) : (
            <div className="card"><EmptyState icon="🎯" title="No workflow selected" desc="Submit a command or select a workflow from the list."/></div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── AGENTS PAGE ───────────────────────────────────────── */
function AgentsPage({ workflows }) {
  const stats = Object.entries(AGENT_META).map(([name,meta])=>{
    const tasks = workflows.flatMap(w=>w.subtasks||[]).filter(s=>s.agent_domain===name);
    const done  = tasks.filter(s=>s.status==='COMPLETED').length;
    const avgC  = tasks.length ? tasks.reduce((a,s)=>a+(s.confidence||0),0)/tasks.length : 0;
    const busy  = tasks.some(s=>s.status==='RUNNING');
    return {name,meta,tasks:tasks.length,done,avgC,busy};
  });
  return (
    <div className="agents-grid">
      {stats.map(({name,meta,tasks,done,avgC,busy})=>(
        <div key={name} className="agent-card">
          <div className="agent-card-header">
            <div className="agent-avatar" style={{background:meta.bg}}>{meta.icon}</div>
            <div><div className="agent-card-name">{name} Agent</div><div className="agent-card-role">{meta.role}</div></div>
            <div className="agent-card-status"><div className={`agent-dot ${busy?'busy':'online'}`}/>{busy?'Busy':'Online'}</div>
          </div>
          {[['Tasks Executed',tasks],['Completed',done],['Avg Confidence',tasks?`${(avgC*100).toFixed(0)}%`:'—'],['LLM Provider','GPT-5 / Mock'],['Circuit Breaker','CLOSED']].map(([k,v])=>(
            <div key={k} className="agent-stat-row">
              <span className="agent-stat-key">{k}</span>
              <span className="agent-stat-val" style={k==='Circuit Breaker'?{color:'var(--color-success)'}:{}}>{v}</span>
            </div>
          ))}
          <div className="agent-tools-list">{meta.tools.map(t=><span key={t} className="tool-chip">{t}</span>)}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── MEMORY PAGE ───────────────────────────────────────── */
function MemoryPage({ workflows }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const allMem = workflows.map(w=>({
    id:w.id, type:w.status==='COMPLETED'?'workflow':'incident',
    text:`Prompt: ${w.prompt}. ${w.metadata_json?.synthesis?.summary||''}`,
    time:w.created_at, score:w.metadata_json?.synthesis?.confidence_level||0.8,
  }));

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`${CORE_URL}/workflow/list`).then(r=>r.json());
      setResults(r.filter(w=>w.prompt.toLowerCase().includes(query.toLowerCase())).map(w=>({
        id:w.id, type:'workflow', text:`Prompt: ${w.prompt}. ${w.metadata_json?.synthesis?.summary||''}`,
        time:w.created_at, score:0.85,
      })));
    } catch { setResults(allMem.filter(m=>m.text.toLowerCase().includes(query.toLowerCase()))); }
    finally { setSearching(false); }
  };

  const displayed = query ? results : allMem;
  return (
    <>
      <div className="memory-grid">
        {[
          {label:'Session Memory',    value:workflows.filter(w=>w.status==='RUNNING').length,    icon:'⚡', color:'var(--color-info)',    desc:'Active workflow contexts'},
          {label:'Long-Term Memory',  value:workflows.filter(w=>w.status==='COMPLETED').length,  icon:'💾', color:'var(--color-accent)',  desc:'Persisted workflow outcomes'},
          {label:'Vector Embeddings', value:workflows.length,                                    icon:'🔮', color:'var(--color-accent2)', desc:'Indexed knowledge entries'},
        ].map(m=>(
          <div key={m.label} className="card" style={{borderTop:`2px solid ${m.color}`}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'0.5rem'}}>
              <span style={{fontSize:'1.5rem'}}>{m.icon}</span>
              <div><div style={{fontSize:'1.6rem',fontWeight:900,fontFamily:'Outfit',color:m.color}}>{m.value}</div><div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{m.label}</div></div>
            </div>
            <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{m.desc}</div>
          </div>
        ))}
      </div>
      <div className="memory-search-box">
        <span style={{color:'var(--text-muted)'}}>🔍</span>
        <input className="memory-search-input" placeholder="Semantic search across memory…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSearch()}/>
        <button className="execute-btn" style={{padding:'0.4rem 1rem',fontSize:'0.8rem'}} onClick={handleSearch} disabled={searching}>{searching?<span className="spinner"/>:'Search'}</button>
      </div>
      <div className="card">
        <div className="card-title">🧠 Memory Entries ({displayed.length})</div>
        {displayed.length===0
          ? <EmptyState icon="🧠" title="No memory entries" desc="Execute workflows to populate long-term memory."/>
          : displayed.map((m,i)=>(
              <div key={m.id||i} className="memory-entry">
                <div className="memory-entry-header">
                  <span className={`memory-entry-type memory-type-${m.type}`}>{m.type}</span>
                  <span className="memory-entry-time">{timeAgo(m.time)}</span>
                </div>
                <div className="memory-entry-text">{m.text.slice(0,220)}{m.text.length>220?'…':''}</div>
                <div className="memory-entry-score">cosine: {m.score.toFixed(3)} · id: {String(m.id).slice(0,12)}…</div>
              </div>
            ))
        }
      </div>
    </>
  );
}

/* ─── OBSERVABILITY PAGE ────────────────────────────────── */
function ObservabilityPage({ workflows }) {
  const completed = workflows.filter(w=>w.status==='COMPLETED').length;
  const failed    = workflows.filter(w=>w.status==='FAILED'||w.status==='DEGRADED').length;
  const sparkData = Array.from({length:12},(_,i)=>Math.max(workflows.filter(w=>new Date(w.created_at).getMinutes()%12===i).length,Math.floor(Math.random()*3)));
  const tokenSegs = [{label:'DevOps',value:12400,color:'#0ea5e9'},{label:'Analyst',value:9800,color:'#ec4899'},{label:'Research',value:7200,color:'#10b981'},{label:'Support',value:5100,color:'#f59e0b'},{label:'Security',value:4300,color:'#ef4444'}];
  const cbRows = [
    {tool:'Kubernetes API',   agent:'DevOps',   state:'CLOSED',failures:0},
    {tool:'PostgreSQL Query', agent:'Analyst',  state:'CLOSED',failures:0},
    {tool:'Web Search',       agent:'Research', state:'CLOSED',failures:0},
    {tool:'Jira API',         agent:'Support',  state:'CLOSED',failures:0},
    {tool:'Access Log Feed',  agent:'Security', state:'CLOSED',failures:0},
    {tool:'ChromaDB Vector',  agent:'Memory',   state:'CLOSED',failures:0},
  ];
  const latRows = [
    {label:'Supervisor',ms:1800,color:'#6366f1'},{label:'DevOps',ms:2400,color:'#0ea5e9'},
    {label:'Analyst',ms:3100,color:'#ec4899'},{label:'Research',ms:2200,color:'#10b981'},
    {label:'Support',ms:1600,color:'#f59e0b'},{label:'Security',ms:2800,color:'#ef4444'},
    {label:'Decision Eng',ms:1200,color:'#a855f7'},
  ];
  return (
    <>
      <div className="kpi-grid">
        {[
          {label:'Workflows/hr',  value:workflows.length, color:'accent', icon:'⚡'},
          {label:'Success Rate',  value:workflows.length?`${((completed/workflows.length)*100).toFixed(0)}%`:'—', color:'green', icon:'✅'},
          {label:'Total Tokens',  value:'42.8k', color:'cyan', icon:'🧠'},
          {label:'P95 Latency',   value:'18.4s', color:'fire', icon:'⏱️'},
        ].map(k=>(
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className={`kpi-icon ${k.color}`}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-value ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>
      <div className="obs-grid">
        <div className="card"><div className="card-title">📈 Workflow Throughput (12 min)</div><Sparkline data={sparkData} color="rgba(99,102,241,0.5)"/><div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'0.5rem'}}><span>12 min ago</span><span>now</span></div></div>
        <div className="card"><div className="card-title">🧠 Token Usage by Agent</div><Donut segments={tokenSegs}/></div>
        <div className="card"><div className="card-title">⏱️ Agent P95 Latency</div><div className="latency-chart">{latRows.map(r=><div key={r.label} className="latency-row"><span className="latency-label">{r.label}</span><div className="latency-bar-track"><div className="latency-bar-fill" style={{width:`${(r.ms/5000)*100}%`,background:r.color}}/></div><span className="latency-value">{r.ms}ms</span></div>)}</div></div>
        <div className="card"><div className="card-title">📊 Status Breakdown</div><div className="latency-chart">{[{label:'Completed',value:completed,color:'var(--color-success)'},{label:'Failed',value:failed,color:'var(--color-error)'},{label:'Running',value:workflows.filter(w=>w.status==='RUNNING').length,color:'var(--color-info)'}].map(s=><div key={s.label} className="latency-row"><span className="latency-label">{s.label}</span><div className="latency-bar-track"><div className="latency-bar-fill" style={{width:`${workflows.length?(s.value/workflows.length)*100:0}%`,background:s.color}}/></div><span className="latency-value">{s.value}</span></div>)}</div></div>
        <div className="card obs-grid-full"><div className="card-title">🔌 Circuit Breaker Status</div><table className="cb-table"><thead><tr><th>Integration</th><th>Agent</th><th>State</th><th>Failures</th><th>Threshold</th></tr></thead><tbody>{cbRows.map(r=><tr key={r.tool}><td style={{color:'var(--text-primary)',fontWeight:600}}>{r.tool}</td><td>{r.agent}</td><td><span className="cb-state-closed">{r.state}</span></td><td style={{fontFamily:'var(--font-mono)'}}>{r.failures}/5</td><td style={{fontFamily:'var(--font-mono)'}}>5 consecutive</td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}

/* ─── AUDIT PAGE ────────────────────────────────────────── */
function AuditPage({ logs }) {
  const [filter, setFilter] = useState('');
  const filtered = filter ? logs.filter(l=>l.action_type?.includes(filter.toUpperCase())||l.actor?.includes(filter)) : logs;
  return (
    <>
      <div className="memory-search-box" style={{marginBottom:'1rem'}}>
        <span style={{color:'var(--text-muted)'}}>🔍</span>
        <input className="memory-search-input" placeholder="Filter by actor or action type…" value={filter} onChange={e=>setFilter(e.target.value)}/>
      </div>
      <div className="card">
        <div className="card-title">📋 Immutable Audit Ledger ({filtered.length} entries)</div>
        {filtered.length===0
          ? <EmptyState icon="📋" title="No audit records" desc="Audit entries appear as agents execute workflows."/>
          : <div style={{overflowX:'auto'}}><table className="audit-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Details</th><th>Outcome</th></tr></thead><tbody>{filtered.map(l=><tr key={l.id}><td className="audit-time">{new Date(l.timestamp).toLocaleTimeString()}</td><td className="audit-actor">{l.actor}</td><td className="audit-action">{l.action_type}</td><td className="audit-details">{JSON.stringify(l.details)}</td><td><span className={`outcome-${(l.outcome||'').toLowerCase()}`}>{l.outcome==='SUCCESS'?'✅':l.outcome==='FAILURE'?'❌':'⚠️'} {l.outcome}</span></td></tr>)}</tbody></table></div>
        }
      </div>
    </>
  );
}

/* ─── RLHF PAGE ─────────────────────────────────────────── */
function RLHFPage({ workflows, addToast }) {
  const [stats, setStats] = useState({total:0,approval_rate:0,by_agent:{}});
  const [recent, setRecent] = useState([]);
  const [submitting, setSubmitting] = useState(null);

  useEffect(()=>{
    fetch(`${CORE_URL}/rlhf/stats`).then(r=>r.json()).then(setStats).catch(()=>{});
    fetch(`${CORE_URL}/rlhf/recent`).then(r=>r.json()).then(setRecent).catch(()=>{});
  },[]);

  const submitFeedback = async (wfId, agent, output, approved) => {
    setSubmitting(`${wfId}-${agent}`);
    try {
      await fetch(`${CORE_URL}/rlhf/feedback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflow_id:wfId,agent,output,approved,actor:'operator'})});
      const s = await fetch(`${CORE_URL}/rlhf/stats`).then(r=>r.json());
      setStats(s);
      const rec = await fetch(`${CORE_URL}/rlhf/recent`).then(r=>r.json());
      setRecent(rec);
      addToast('success','RLHF Signal Recorded',`${agent} agent — ${approved?'Approved':'Rejected'}`);
    } catch { addToast('error','Failed','Could not record RLHF signal'); }
    finally { setSubmitting(null); }
  };

  const completedWfs = workflows.filter(w=>w.status==='COMPLETED'&&w.subtasks?.length>0);

  return (
    <>
      <div className="kpi-grid">
        {[
          {label:'Total Signals',   value:stats.total,                                    color:'accent', icon:'🎓'},
          {label:'Approval Rate',   value:`${((stats.approval_rate||0)*100).toFixed(0)}%`,color:'green',  icon:'✅'},
          {label:'Agents Trained',  value:Object.keys(stats.by_agent||{}).length,         color:'cyan',   icon:'🤖'},
          {label:'Dataset Size',    value:stats.total,                                    color:'fire',   icon:'📦'},
        ].map(k=>(
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className={`kpi-icon ${k.color}`}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-value ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
        <div className="card">
          <div className="card-title">🎯 Submit Feedback on Agent Outputs</div>
          {completedWfs.length===0
            ? <EmptyState icon="🎓" title="No completed workflows" desc="Run workflows first to provide RLHF feedback."/>
            : completedWfs.slice(0,5).map(wf=>
                wf.subtasks.filter(s=>s.status==='COMPLETED').map(s=>(
                  <div key={`${wf.id}-${s.agent_domain}`} style={{padding:'0.9rem',borderRadius:'10px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)',marginBottom:'0.6rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.4rem'}}>
                      <span style={{fontSize:'1rem'}}>{AGENT_META[s.agent_domain]?.icon||'🤖'}</span>
                      <span style={{fontWeight:700,fontSize:'0.85rem'}}>{s.agent_domain} Agent</span>
                      <span style={{marginLeft:'auto',fontSize:'0.7rem',color:'var(--text-muted)'}}>{wf.id.slice(0,8)}</span>
                    </div>
                    <div style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginBottom:'0.6rem',fontFamily:'var(--font-mono)'}}>{s.result?.insight||'No output'}</div>
                    <div style={{display:'flex',gap:'0.5rem'}}>
                      <button className="btn-approve" style={{flex:1,fontSize:'0.75rem',padding:'0.4rem'}} disabled={submitting===`${wf.id}-${s.agent_domain}`} onClick={()=>submitFeedback(wf.id,s.agent_domain,s.result,true)}>👍 Approve</button>
                      <button className="btn-reject"  style={{flex:1,fontSize:'0.75rem',padding:'0.4rem'}} disabled={submitting===`${wf.id}-${s.agent_domain}`} onClick={()=>submitFeedback(wf.id,s.agent_domain,s.result,false)}>👎 Reject</button>
                    </div>
                  </div>
                ))
              )
          }
        </div>

        <div className="card">
          <div className="card-title">📊 Agent Approval Rates</div>
          {Object.entries(stats.by_agent||{}).length===0
            ? <EmptyState icon="📊" title="No data yet" desc="Submit feedback to see per-agent approval rates."/>
            : Object.entries(stats.by_agent).map(([agent,data])=>(
                <div key={agent} className="latency-row" style={{marginBottom:'0.75rem'}}>
                  <span className="latency-label">{agent}</span>
                  <div className="latency-bar-track"><div className="latency-bar-fill" style={{width:`${(data.approval_rate||0)*100}%`,background:AGENT_META[agent]?.color||'var(--color-accent)'}}/></div>
                  <span className="latency-value">{((data.approval_rate||0)*100).toFixed(0)}%</span>
                </div>
              ))
          }
          <div style={{marginTop:'1rem',paddingTop:'1rem',borderTop:'1px solid var(--glass-border)'}}>
            <div className="card-title">📝 Recent Signals</div>
            {recent.slice(0,5).map((f,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.4rem 0',borderBottom:'1px solid rgba(255,255,255,0.03)',fontSize:'0.78rem'}}>
                <span>{f.approved?'✅':'❌'}</span>
                <span style={{color:'var(--text-secondary)'}}>{f.agent}</span>
                <span style={{marginLeft:'auto',color:'var(--text-muted)',fontSize:'0.7rem'}}>{timeAgo(f.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── PREDICTIVE PAGE ───────────────────────────────────── */
function PredictivePage({ addToast }) {
  const [metrics, setMetrics] = useState({});
  const [alerts, setAlerts] = useState([]);

  useEffect(()=>{
    const load = async () => {
      try {
        const m = await fetch(`${CORE_URL}/predictive/metrics`).then(r=>r.json());
        setMetrics(m);
        const a = await fetch(`${CORE_URL}/predictive/alerts`).then(r=>r.json());
        setAlerts(a);
      } catch {}
    };
    load();
    const iv = setInterval(load, 5000);
    return ()=>clearInterval(iv);
  },[]);

  const trendIcon = t => t==='rising_fast'?'🔴':t==='rising'?'🟡':t==='stable'?'🟢':t==='falling'?'🔵':'⚪';
  const levelColor = l => l==='CRITICAL'?'var(--color-error)':l==='WARNING'?'var(--color-warning)':'var(--color-success)';

  return (
    <>
      <div className="kpi-grid">
        {[
          {label:'Metrics Tracked', value:Object.keys(metrics).length,                          color:'accent', icon:'📊'},
          {label:'Active Alerts',   value:alerts.filter(a=>a.level==='CRITICAL').length,         color:'fire',   icon:'🚨'},
          {label:'Warnings',        value:alerts.filter(a=>a.level==='WARNING').length,          color:'fire',   icon:'⚠️'},
          {label:'Stable Metrics',  value:Object.values(metrics).filter(m=>m.trend==='stable').length, color:'green', icon:'✅'},
        ].map(k=>(
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className={`kpi-icon ${k.color}`}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-value ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
        <div className="card">
          <div className="card-title">📡 Live Metric Trends</div>
          {Object.entries(metrics).length===0
            ? <EmptyState icon="📡" title="Loading metrics…" desc="Predictive engine is seeding data."/>
            : Object.entries(metrics).map(([metric,data])=>(
                <div key={metric} style={{padding:'0.75rem',borderRadius:'10px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)',marginBottom:'0.6rem'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.4rem'}}>
                    <span style={{fontSize:'0.82rem',fontWeight:700,color:'var(--text-primary)'}}>{metric.replace(/_/g,' ')}</span>
                    <span style={{fontSize:'0.75rem'}}>{trendIcon(data.trend)} {data.trend}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                    <div className="latency-bar-track" style={{flex:1}}><div className="latency-bar-fill" style={{width:`${Math.min((data.current/100)*100,100)}%`,background:'var(--color-accent)'}}/></div>
                    <span style={{fontSize:'0.78rem',fontWeight:700,fontFamily:'var(--font-mono)',color:'var(--text-primary)',minWidth:'50px',textAlign:'right'}}>{fmt(data.current)}</span>
                  </div>
                </div>
              ))
          }
        </div>

        <div className="card">
          <div className="card-title">🚨 Predictive Alerts ({alerts.length})</div>
          {alerts.length===0
            ? <EmptyState icon="✅" title="No alerts" desc="All metrics within normal thresholds."/>
            : alerts.slice(-10).reverse().map((a,i)=>(
                <div key={i} style={{padding:'0.75rem',borderRadius:'10px',background:'rgba(0,0,0,0.2)',border:`1px solid ${levelColor(a.level)}33`,marginBottom:'0.6rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.3rem'}}>
                    <span style={{fontSize:'0.7rem',fontWeight:700,background:`${levelColor(a.level)}22`,color:levelColor(a.level),padding:'0.1rem 0.4rem',borderRadius:'4px'}}>{a.level}</span>
                    <span style={{fontSize:'0.8rem',fontWeight:700}}>{a.metric?.replace(/_/g,' ')}</span>
                    <span style={{marginLeft:'auto',fontSize:'0.68rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{fmt(a.value)}</span>
                  </div>
                  <div style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{a.recommendation}</div>
                  <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:'0.25rem'}}>Trend: {a.prediction} · {timeAgo(a.timestamp)}</div>
                </div>
              ))
          }
        </div>
      </div>
    </>
  );
}

/* ─── KNOWLEDGE GRAPH PAGE ──────────────────────────────── */
function KnowledgePage() {
  const [kgData, setKgData] = useState({nodes:[],edges:[]});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [causes, setCauses] = useState([]);

  useEffect(()=>{
    fetch(`${CORE_URL}/kg/graph`).then(r=>r.json()).then(setKgData).catch(()=>{});
  },[]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    try { const r = await fetch(`${CORE_URL}/kg/search?q=${encodeURIComponent(query)}`).then(r=>r.json()); setResults(r); }
    catch {}
  };

  const handleNodeClick = async (node) => {
    setSelected(node);
    try { const c = await fetch(`${CORE_URL}/kg/causes/${node.id}`).then(r=>r.json()); setCauses(c); }
    catch { setCauses([]); }
  };

  const typeColor = t => ({incident:'#ef4444',service:'#0ea5e9',metric:'#f59e0b',action:'#10b981',knowledge:'#a855f7'}[t]||'#6366f1');
  const typeIcon  = t => ({incident:'🔥',service:'⚙️',metric:'📊',action:'🔧',knowledge:'📚'}[t]||'🔵');

  return (
    <>
      <div className="memory-search-box" style={{marginBottom:'1.25rem'}}>
        <span style={{color:'var(--text-muted)'}}>🔍</span>
        <input className="memory-search-input" placeholder="Search knowledge graph nodes… (e.g. 'auth', 'incident')" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSearch()}/>
        <button className="execute-btn" style={{padding:'0.4rem 1rem',fontSize:'0.8rem'}} onClick={handleSearch}>Search</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:'1.25rem'}}>
        <div className="card">
          <div className="card-title">🕸️ Knowledge Graph ({kgData.nodes.length} nodes · {kgData.edges.length} edges)</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'0.6rem',marginBottom:'1rem'}}>
            {kgData.nodes.map(n=>(
              <div key={n.id} onClick={()=>handleNodeClick(n)} style={{padding:'0.5rem 0.9rem',borderRadius:'99px',background:`${typeColor(n.type)}18`,border:`1px solid ${typeColor(n.type)}44`,cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:typeColor(n.type),transition:'all 0.2s',boxShadow:selected?.id===n.id?`0 0 12px ${typeColor(n.type)}66`:undefined}}>
                {typeIcon(n.type)} {n.label}
              </div>
            ))}
          </div>
          <div style={{borderTop:'1px solid var(--glass-border)',paddingTop:'1rem'}}>
            <div className="card-title">🔗 Relationships</div>
            {kgData.edges.map((e,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.35rem 0',borderBottom:'1px solid rgba(255,255,255,0.03)',fontSize:'0.78rem'}}>
                <span style={{color:'var(--text-primary)',fontWeight:600,minWidth:'120px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.from}</span>
                <span style={{color:'var(--color-accent)',fontFamily:'var(--font-mono)',fontSize:'0.7rem',background:'rgba(99,102,241,0.1)',padding:'0.1rem 0.4rem',borderRadius:'4px',whiteSpace:'nowrap'}}>—{e.relation}→</span>
                <span style={{color:'var(--text-primary)',fontWeight:600}}>{e.to}</span>
                <span style={{marginLeft:'auto',color:'var(--text-muted)',fontSize:'0.68rem'}}>{e.weight?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          {selected ? (
            <div className="card">
              <div className="card-title">🔍 Node Detail</div>
              <div style={{padding:'0.75rem',borderRadius:'10px',background:`${typeColor(selected.type)}10`,border:`1px solid ${typeColor(selected.type)}33`,marginBottom:'0.75rem'}}>
                <div style={{fontSize:'1.1rem',marginBottom:'0.25rem'}}>{typeIcon(selected.type)} <strong>{selected.label}</strong></div>
                <div style={{fontSize:'0.72rem',color:typeColor(selected.type),fontWeight:700,textTransform:'uppercase'}}>{selected.type}</div>
                {Object.entries(selected.properties||{}).map(([k,v])=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',marginTop:'0.3rem'}}>
                    <span style={{color:'var(--text-muted)'}}>{k}</span><span style={{color:'var(--text-primary)',fontWeight:600}}>{String(v)}</span>
                  </div>
                ))}
              </div>
              {causes.length>0&&(
                <>
                  <div className="card-title">⚡ Causal Factors</div>
                  {causes.map((c,i)=>(
                    <div key={i} style={{padding:'0.5rem 0.75rem',borderRadius:'8px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',marginBottom:'0.4rem',fontSize:'0.78rem'}}>
                      <span style={{color:'var(--color-error)',fontWeight:700}}>{c.node?.label}</span>
                      <span style={{color:'var(--text-muted)',marginLeft:'0.5rem'}}>via {c.relation} (w={c.weight?.toFixed(2)})</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="card"><EmptyState icon="🕸️" title="Click a node" desc="Select any node in the graph to view its details and causal relationships."/></div>
          )}

          {results.length>0&&(
            <div className="card">
              <div className="card-title">🔍 Search Results ({results.length})</div>
              {results.map((r,i)=>(
                <div key={i} onClick={()=>handleNodeClick(r)} style={{padding:'0.6rem 0.75rem',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)',marginBottom:'0.4rem',cursor:'pointer',fontSize:'0.8rem'}}>
                  <span style={{color:typeColor(r.type)}}>{typeIcon(r.type)}</span> <strong>{r.label}</strong>
                  <span style={{marginLeft:'0.5rem',color:'var(--text-muted)',fontSize:'0.7rem'}}>{r.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── CONSTITUTION PAGE ─────────────────────────────────── */
function ConstitutionPage({ addToast }) {
  const [stats, setStats] = useState({total_violations:0,by_severity:{},rules_active:6});
  const [violations, setViolations] = useState([]);
  const [testAction, setTestAction] = useState('postgres_write');
  const [testPayload, setTestPayload] = useState('{"approval_granted": false}');
  const [testResult, setTestResult] = useState(null);

  useEffect(()=>{
    fetch(`${CORE_URL}/constitution/stats`).then(r=>r.json()).then(setStats).catch(()=>{});
    fetch(`${CORE_URL}/constitution/violations`).then(r=>r.json()).then(setViolations).catch(()=>{});
  },[]);

  const runTest = async () => {
    try {
      let payload = {};
      try { payload = JSON.parse(testPayload); } catch { addToast('error','Invalid JSON','Check payload format'); return; }
      const r = await fetch(`${CORE_URL}/constitution/evaluate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:testAction,payload})});
      const data = await r.json();
      setTestResult(data);
      const s = await fetch(`${CORE_URL}/constitution/stats`).then(r=>r.json());
      setStats(s);
      const v = await fetch(`${CORE_URL}/constitution/violations`).then(r=>r.json());
      setViolations(v);
      addToast(data.allowed?'success':'warning', data.allowed?'Action Allowed':'Action Blocked', `${data.violations?.length||0} rule(s) triggered`);
    } catch { addToast('error','Evaluation failed','Check backend connection'); }
  };

  const sevColor = s => s==='BLOCK'?'var(--color-error)':s==='WARN'?'var(--color-warning)':'var(--color-info)';

  const RULES = [
    {id:'C001',desc:'Never expose raw PII in outputs',sev:'BLOCK'},
    {id:'C002',desc:'No production DB writes without approval flag',sev:'BLOCK'},
    {id:'C003',desc:'No record deletion ever',sev:'BLOCK'},
    {id:'C004',desc:'Financial actions require manager approval',sev:'BLOCK'},
    {id:'C005',desc:'Security remediations require security officer',sev:'WARN'},
    {id:'C006',desc:'Prefer reversible actions',sev:'INFO'},
  ];

  return (
    <>
      <div className="kpi-grid">
        {[
          {label:'Rules Active',    value:stats.rules_active||6,                    color:'accent', icon:'⚖️'},
          {label:'Total Violations',value:stats.total_violations||0,                color:'fire',   icon:'🚫'},
          {label:'BLOCK Violations',value:stats.by_severity?.BLOCK||0,             color:'fire',   icon:'🔴'},
          {label:'WARN Violations', value:stats.by_severity?.WARN||0,              color:'cyan',   icon:'🟡'},
        ].map(k=>(
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className={`kpi-icon ${k.color}`}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-value ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
        <div className="card">
          <div className="card-title">📜 Active Policy Rules</div>
          {RULES.map(r=>(
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.65rem 0.75rem',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)',marginBottom:'0.5rem'}}>
              <span style={{fontSize:'0.65rem',fontWeight:700,background:`${sevColor(r.sev)}22`,color:sevColor(r.sev),padding:'0.15rem 0.45rem',borderRadius:'4px',minWidth:'40px',textAlign:'center'}}>{r.sev}</span>
              <span style={{fontSize:'0.72rem',fontFamily:'var(--font-mono)',color:'var(--color-accent)',fontWeight:700}}>{r.id}</span>
              <span style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>{r.desc}</span>
            </div>
          ))}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          <div className="card">
            <div className="card-title">🧪 Policy Evaluator</div>
            <div style={{marginBottom:'0.75rem'}}>
              <label style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'block',marginBottom:'0.3rem'}}>Action Type</label>
              <select value={testAction} onChange={e=>setTestAction(e.target.value)} style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--glass-border)',borderRadius:'8px',padding:'0.5rem 0.75rem',color:'var(--text-primary)',fontSize:'0.85rem',outline:'none'}}>
                {['postgres_write','postgres_read','security_remediate','financial_action','cost_action','k8s_deploy','slack_send'].map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div style={{marginBottom:'0.75rem'}}>
              <label style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'block',marginBottom:'0.3rem'}}>Payload (JSON)</label>
              <textarea value={testPayload} onChange={e=>setTestPayload(e.target.value)} style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--glass-border)',borderRadius:'8px',padding:'0.5rem 0.75rem',color:'var(--text-primary)',fontSize:'0.8rem',fontFamily:'var(--font-mono)',resize:'vertical',minHeight:'80px',outline:'none'}}/>
            </div>
            <button className="execute-btn" style={{width:'100%'}} onClick={runTest}>⚖️ Evaluate Policy</button>
            {testResult&&(
              <div style={{marginTop:'0.75rem',padding:'0.75rem',borderRadius:'8px',background:testResult.allowed?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${testResult.allowed?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`}}>
                <div style={{fontWeight:700,color:testResult.allowed?'var(--color-success)':'var(--color-error)',marginBottom:'0.4rem'}}>{testResult.allowed?'✅ Action ALLOWED':'🚫 Action BLOCKED'}</div>
                {testResult.violations?.map((v,i)=><div key={i} style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.2rem'}}>• [{v.rule_id}] {v.description}</div>)}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">🚫 Recent Violations ({violations.length})</div>
            {violations.length===0
              ? <EmptyState icon="✅" title="No violations" desc="All evaluated actions passed policy checks."/>
              : violations.slice(-5).reverse().map((v,i)=>(
                  <div key={i} style={{padding:'0.5rem 0.75rem',borderRadius:'8px',background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',marginBottom:'0.4rem',fontSize:'0.78rem'}}>
                    <span style={{color:'var(--color-error)',fontWeight:700}}>[{v.rule_id}]</span> <span style={{color:'var(--text-secondary)'}}>{v.description}</span>
                    <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:'0.15rem'}}>action: {v.action} · severity: {v.severity}</div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── SCHEDULER PAGE ────────────────────────────────────── */
function SchedulerPage({ addToast }) {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({name:'',prompt:'',cron_expr:'@daily',auto_approve:false});
  const [creating, setCreating] = useState(false);

  const loadJobs = async () => {
    try { const j = await fetch(`${CORE_URL}/scheduler/jobs`).then(r=>r.json()); setJobs(j); }
    catch {}
  };

  useEffect(()=>{ loadJobs(); const iv=setInterval(loadJobs,5000); return()=>clearInterval(iv); },[]);

  const createJob = async () => {
    if (!form.name.trim()||!form.prompt.trim()) { addToast('warning','Missing fields','Name and prompt are required'); return; }
    setCreating(true);
    try {
      await fetch(`${CORE_URL}/scheduler/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,user_id:'operator'})});
      await loadJobs();
      setForm({name:'',prompt:'',cron_expr:'@daily',auto_approve:false});
      addToast('success','Job Created',`"${form.name}" scheduled`);
    } catch { addToast('error','Failed','Could not create scheduled job'); }
    finally { setCreating(false); }
  };

  const toggleJob = async (id) => {
    try { await fetch(`${CORE_URL}/scheduler/jobs/${id}/toggle`,{method:'POST'}); await loadJobs(); }
    catch {}
  };

  const deleteJob = async (id) => {
    try { await fetch(`${CORE_URL}/scheduler/jobs/${id}`,{method:'DELETE'}); await loadJobs(); addToast('info','Job Removed','Scheduled job deleted'); }
    catch {}
  };

  const CRON_PRESETS = ['@hourly','@daily','@weekly','0 9 * * MON','0 0 1 * *','*/30 * * * *'];

  return (
    <>
      <div className="kpi-grid">
        {[
          {label:'Total Jobs',   value:jobs.length,                          color:'accent', icon:'⏰'},
          {label:'Active Jobs',  value:jobs.filter(j=>j.enabled).length,     color:'green',  icon:'▶️'},
          {label:'Paused Jobs',  value:jobs.filter(j=>!j.enabled).length,    color:'fire',   icon:'⏸️'},
          {label:'Total Runs',   value:jobs.reduce((a,j)=>a+(j.run_count||0),0), color:'cyan', icon:'🔄'},
        ].map(k=>(
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className={`kpi-icon ${k.color}`}>{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className={`kpi-value ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:'1.25rem'}}>
        <div className="card">
          <div className="card-title">⏰ Scheduled Jobs</div>
          {jobs.length===0
            ? <EmptyState icon="⏰" title="No scheduled jobs" desc="Create a job to automate recurring workflows."/>
            : jobs.map(j=>(
                <div key={j.job_id} style={{padding:'1rem',borderRadius:'12px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)',marginBottom:'0.75rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'0.5rem'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'10px',background:j.enabled?'rgba(16,185,129,0.15)':'rgba(71,85,105,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem'}}>{j.enabled?'▶️':'⏸️'}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:'0.9rem'}}>{j.name}</div>
                      <div style={{fontSize:'0.72rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{j.cron_expr}</div>
                    </div>
                    <span style={{fontSize:'0.68rem',fontWeight:700,background:j.enabled?'rgba(16,185,129,0.12)':'rgba(71,85,105,0.2)',color:j.enabled?'var(--color-success)':'var(--text-muted)',padding:'0.15rem 0.5rem',borderRadius:'4px'}}>{j.enabled?'ACTIVE':'PAUSED'}</span>
                  </div>
                  <div style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginBottom:'0.5rem',padding:'0.4rem 0.6rem',background:'rgba(0,0,0,0.2)',borderRadius:'6px',fontFamily:'var(--font-mono)'}}>{j.prompt}</div>
                  <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.72rem',color:'var(--text-muted)'}}>
                    <span>Runs: {j.run_count||0}</span>
                    <span>·</span>
                    <span>Auto-approve: {j.auto_approve?'✅':'❌'}</span>
                    <span>·</span>
                    <span>Created: {timeAgo(j.created_at)}</span>
                    <div style={{marginLeft:'auto',display:'flex',gap:'0.4rem'}}>
                      <button onClick={()=>toggleJob(j.job_id)} style={{background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',color:'var(--color-accent)',padding:'0.25rem 0.6rem',borderRadius:'6px',cursor:'pointer',fontSize:'0.72rem',fontWeight:600}}>{j.enabled?'Pause':'Resume'}</button>
                      <button onClick={()=>deleteJob(j.job_id)} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',color:'var(--color-error)',padding:'0.25rem 0.6rem',borderRadius:'6px',cursor:'pointer',fontSize:'0.72rem',fontWeight:600}}>Delete</button>
                    </div>
                  </div>
                </div>
              ))
          }
        </div>

        <div className="card">
          <div className="card-title">➕ Create Scheduled Job</div>
          {[
            {label:'Job Name',    key:'name',    type:'text',    placeholder:'e.g. Daily KPI Report'},
            {label:'Prompt',      key:'prompt',  type:'textarea',placeholder:'e.g. Generate weekly KPI report and flag anomalies'},
          ].map(f=>(
            <div key={f.key} style={{marginBottom:'0.75rem'}}>
              <label style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'block',marginBottom:'0.3rem'}}>{f.label}</label>
              {f.type==='textarea'
                ? <textarea value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--glass-border)',borderRadius:'8px',padding:'0.5rem 0.75rem',color:'var(--text-primary)',fontSize:'0.82rem',resize:'vertical',minHeight:'70px',outline:'none'}}/>
                : <input value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--glass-border)',borderRadius:'8px',padding:'0.5rem 0.75rem',color:'var(--text-primary)',fontSize:'0.82rem',outline:'none'}}/>
              }
            </div>
          ))}
          <div style={{marginBottom:'0.75rem'}}>
            <label style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'block',marginBottom:'0.3rem'}}>Schedule</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.35rem',marginBottom:'0.4rem'}}>
              {CRON_PRESETS.map(p=><button key={p} onClick={()=>setForm(f=>({...f,cron_expr:p}))} style={{fontSize:'0.68rem',fontWeight:600,background:form.cron_expr===p?'rgba(99,102,241,0.2)':'rgba(255,255,255,0.04)',border:`1px solid ${form.cron_expr===p?'var(--color-accent)':'var(--glass-border)'}`,color:form.cron_expr===p?'var(--color-accent)':'var(--text-muted)',padding:'0.2rem 0.5rem',borderRadius:'4px',cursor:'pointer',fontFamily:'var(--font-mono)'}}>{p}</button>)}
            </div>
            <input value={form.cron_expr} onChange={e=>setForm(p=>({...p,cron_expr:e.target.value}))} style={{width:'100%',background:'var(--bg-secondary)',border:'1px solid var(--glass-border)',borderRadius:'8px',padding:'0.5rem 0.75rem',color:'var(--text-primary)',fontSize:'0.82rem',fontFamily:'var(--font-mono)',outline:'none'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem'}}>
            <input type="checkbox" id="autoApprove" checked={form.auto_approve} onChange={e=>setForm(p=>({...p,auto_approve:e.target.checked}))} style={{accentColor:'var(--color-accent)'}}/>
            <label htmlFor="autoApprove" style={{fontSize:'0.8rem',color:'var(--text-secondary)',cursor:'pointer'}}>Auto-approve if confidence &gt; 95%</label>
          </div>
          <button className="execute-btn" style={{width:'100%'}} onClick={createJob} disabled={creating}>
            {creating?<><span className="spinner"/>Creating…</>:'⏰ Schedule Job'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── EXPLAINABILITY PAGE ───────────────────────────────── */
function ExplainabilityPage({ workflows }) {
  const [traces, setTraces] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(()=>{
    fetch(`${CORE_URL}/explain`).then(r=>r.json()).then(setTraces).catch(()=>{});
  },[]);

  const loadTrace = async (wfId) => {
    try {
      const t = await fetch(`${CORE_URL}/explain/${wfId}`).then(r=>r.json());
      if (!t.error) setSelected(t);
    } catch {}
  };

  const riskColor = r => r==='HIGH'?'var(--color-error)':r==='MEDIUM'?'var(--color-warning)':'var(--color-success)';

  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'320px 1fr',gap:'1.25rem'}}>
        <div className="card">
          <div className="card-title">💡 Workflow Traces ({workflows.length})</div>
          {workflows.length===0
            ? <EmptyState icon="💡" title="No workflows" desc="Run workflows to generate explainability traces."/>
            : workflows.map(w=>(
                <div key={w.id} onClick={()=>loadTrace(w.id)} style={{padding:'0.75rem',borderRadius:'10px',background:selected?.workflow_id===w.id?'rgba(99,102,241,0.08)':'rgba(0,0,0,0.2)',border:`1px solid ${selected?.workflow_id===w.id?'rgba(99,102,241,0.3)':'var(--glass-border)'}`,marginBottom:'0.5rem',cursor:'pointer',transition:'all 0.2s'}}>
                  <div style={{fontSize:'0.82rem',fontWeight:600,marginBottom:'0.2rem'}}>{wfIcon(w.prompt)} {w.prompt.slice(0,50)}…</div>
                  <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                    <span className={badgeCls(w.status)}><span className="badge-dot"/>{w.status}</span>
                    <span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{timeAgo(w.created_at)}</span>
                  </div>
                </div>
              ))
          }
        </div>

        <div className="card">
          {selected ? (
            <>
              <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:'0.95rem'}}>{selected.original_request}</div>
                  <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'0.2rem'}}>Generated: {timeAgo(selected.generated_at)}</div>
                </div>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <span style={{fontSize:'0.72rem',fontWeight:700,background:`${riskColor(selected.risk_assessment)}22`,color:riskColor(selected.risk_assessment),padding:'0.2rem 0.6rem',borderRadius:'4px'}}>Risk: {selected.risk_assessment}</span>
                  <span style={{fontSize:'0.72rem',fontWeight:700,background:'rgba(16,185,129,0.12)',color:'var(--color-success)',padding:'0.2rem 0.6rem',borderRadius:'4px'}}>{((selected.confidence_level||0)*100).toFixed(0)}% conf</span>
                  {selected.rag_grounding&&<span className="rag-badge">RAG</span>}
                </div>
              </div>

              <div className="card-title">🔍 Reasoning Steps</div>
              {(selected.reasoning_steps||[]).map((step,i)=>(
                <div key={i} style={{display:'flex',gap:'0.75rem',marginBottom:'0.75rem'}}>
                  <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'rgba(99,102,241,0.15)',border:'2px solid var(--color-accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.75rem',fontWeight:800,color:'var(--color-accent)',flexShrink:0}}>{step.step}</div>
                  <div style={{flex:1,padding:'0.75rem',borderRadius:'10px',background:'rgba(0,0,0,0.2)',border:'1px solid var(--glass-border)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.3rem'}}>
                      <span style={{fontWeight:700,fontSize:'0.85rem'}}>{AGENT_META[step.agent]?.icon||'🤖'} {step.agent} Agent</span>
                      <span style={{marginLeft:'auto',fontSize:'0.7rem',color:step.confidence>=0.85?'var(--color-success)':step.confidence>=0.65?'var(--color-warning)':'var(--color-error)',fontWeight:700}}>{((step.confidence||0)*100).toFixed(0)}% conf</span>
                    </div>
                    <div style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:'0.3rem'}}><strong>Finding:</strong> {step.finding}</div>
                    <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{step.reasoning}</div>
                  </div>
                </div>
              ))}

              <div className="synthesis-box" style={{marginTop:'0.75rem'}}>
                <div className="synthesis-header"><span>🧬</span><span className="synthesis-title">Final Recommendation</span></div>
                <div className="synthesis-text">{selected.final_recommendation}</div>
                {selected.alternatives_considered?.length>0&&<div style={{marginTop:'0.5rem',fontSize:'0.75rem',color:'var(--color-warning)'}}>⚠️ {selected.alternatives_considered[0]}</div>}
              </div>
            </>
          ) : (
            <EmptyState icon="💡" title="Select a workflow" desc="Click any workflow on the left to view its full reasoning trace and explainability report."/>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── SIDEBAR ───────────────────────────────────────────── */
function Sidebar({ activeTab, setActiveTab, workflows, health }) {
  const pending = workflows.flatMap(w=>w.checkpoints||[]).filter(c=>c.status==='PENDING').length;
  const busy = new Set(workflows.flatMap(w=>w.subtasks||[]).filter(s=>s.status==='RUNNING').map(s=>s.agent_domain));
  const sections = [...new Set(NAV.map(n=>n.section))];

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="sidebar-logo-text">OmniOps AI</span>
          <span className="sidebar-logo-version">v2.0</span>
        </div>

        {sections.map(sec=>(
          <div key={sec}>
            <div className="sidebar-section-label">{sec}</div>
            {NAV.filter(n=>n.section===sec).map(n=>(
              <div key={n.id} className={`nav-item ${activeTab===n.id?'active':''}`} onClick={()=>setActiveTab(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                <span>{n.label}</span>
                {n.id==='audit'&&pending>0&&<span className="nav-badge">{pending}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-section-label">Agent Status</div>
        {Object.entries(AGENT_META).map(([name,meta])=>(
          <div key={name} className="agent-status-row">
            <div className={`agent-dot ${busy.has(name)?'busy':'online'}`}/>
            <span style={{fontSize:'0.78rem'}}>{meta.icon} {name}</span>
            <span style={{marginLeft:'auto',fontSize:'0.65rem',color:busy.has(name)?'var(--color-warning)':'var(--color-success)'}}>{busy.has(name)?'busy':'ready'}</span>
          </div>
        ))}
        <div style={{marginTop:'0.75rem',paddingTop:'0.75rem',borderTop:'1px solid var(--glass-border)'}}>
          {[
            {label:'Gateway',  status:health.gateway},
            {label:'Core API', status:health.core},
          ].map(s=>(
            <div key={s.label} className="agent-status-row">
              <div className={`agent-dot ${s.status==='online'?'online':'offline'}`}/>
              <span style={{fontSize:'0.75rem'}}>{s.label}</span>
              <span style={{marginLeft:'auto',fontSize:'0.65rem',color:s.status==='online'?'var(--color-success)':'var(--color-error)'}}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ─── ROOT APP ──────────────────────────────────────────── */
export default function App() {
  const [activeTab, setActiveTab]   = useState('dashboard');
  const [workflows, setWorkflows]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedWf, setSelectedWf] = useState(null);
  const [auditLogs, setAuditLogs]   = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [health, setHealth]         = useState({gateway:'offline',core:'offline'});
  const { toasts, add }             = useToasts();

  const PAGE_TITLES = {
    dashboard:'Workflow Orchestration', agents:'Agent Fleet', memory:'Memory & RAG',
    observability:'Observability', audit:'Audit Logs', rlhf:'RLHF Training',
    predictive:'Predictive AI', knowledge:'Knowledge Graph', constitution:'AI Constitution',
    scheduler:'Workflow Scheduler', explainability:'Explainability Engine',
  };

  /* ── data sync ── */
  const sync = useCallback(async () => {
    try {
      const [gw, core] = await Promise.all([
        fetch(`${API_GW}/health`).then(r=>r.json()).catch(()=>null),
        fetch(`${CORE_URL}/system/health`).then(r=>r.json()).catch(()=>null),
      ]);
      setHealth({gateway:gw?.status==='healthy'?'online':'offline', core:core?.status==='healthy'?'online':'offline'});
      if (core?.status==='healthy') {
        const [wfs, logs] = await Promise.all([
          fetch(`${CORE_URL}/workflow/list`).then(r=>r.json()),
          fetch(`${CORE_URL}/audit`).then(r=>r.json()),
        ]);
        setWorkflows(wfs);
        setAuditLogs(logs);
      }
    } catch {}
  }, []);

  useEffect(()=>{ sync(); const iv=setInterval(sync,3000); return()=>clearInterval(iv); },[sync]);

  /* ── selected workflow polling ── */
  useEffect(()=>{
    if (!selectedId) { setSelectedWf(null); return; }
    const load = async () => {
      try { const d=await fetch(`${CORE_URL}/workflow/status/${selectedId}`).then(r=>r.json()); setSelectedWf(d); }
      catch {}
    };
    load();
    const iv=setInterval(load,2000);
    return()=>clearInterval(iv);
  },[selectedId]);

  /* ── submit workflow ── */
  const handleSubmit = async (prompt) => {
    setIsSubmitting(true);
    try {
      const r = await fetch(`${API_GW}/api/workflow`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,user_id:'operator_dev',metadata:{}})});
      const data = await r.json();
      if (data.workflow_id) {
        setSelectedId(data.workflow_id);
        add('success','Workflow Initiated',`ID: ${data.workflow_id.slice(0,12)}…`);
        await sync();
      } else {
        add('error','Failed',data.detail||'Unknown error');
      }
    } catch(e) { add('error','Gateway Error',e.message); }
    finally { setIsSubmitting(false); }
  };

  /* ── approve/reject ── */
  const handleApprove = async (cpId, approved) => {
    try {
      await fetch(`${CORE_URL}/workflow/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checkpoint_id:cpId,approved,actor:'operator_dev'})});
      if (selectedId) { const d=await fetch(`${CORE_URL}/workflow/status/${selectedId}`).then(r=>r.json()); setSelectedWf(d); }
      await sync();
      add(approved?'success':'warning', approved?'Action Approved':'Action Rejected', cpId.slice(0,12));
    } catch(e) { add('error','Approval Failed',e.message); }
  };

  const pendingCount = workflows.flatMap(w=>w.checkpoints||[]).filter(c=>c.status==='PENDING').length;
  const displayWf = selectedWf || (selectedId ? workflows.find(w=>w.id===selectedId) : workflows[0]) || null;

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} workflows={workflows} health={health}/>

      <div className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="page-title">{PAGE_TITLES[activeTab]}</div>
          </div>
          <div className="topbar-right">
            {pendingCount>0&&<div className="topbar-pill" style={{borderColor:'rgba(245,158,11,0.3)',color:'var(--color-warning)'}}>⚠️ {pendingCount} approval{pendingCount>1?'s':''} pending</div>}
            <div className="topbar-pill"><div className="live-dot"/>{health.core==='online'?'Core Online':'Offline'}</div>
            <button className="topbar-btn" onClick={()=>{sync();add('info','Refreshed','Data reloaded');}}>↻ Refresh</button>
          </div>
        </div>

        {/* Page body */}
        <div className="page-body">
          {activeTab==='dashboard'     && <DashboardPage workflows={workflows} selectedWorkflow={displayWf} onSelect={setSelectedId} onSubmit={handleSubmit} onApprove={handleApprove} isSubmitting={isSubmitting} pendingCount={pendingCount}/>}
          {activeTab==='agents'        && <AgentsPage workflows={workflows}/>}
          {activeTab==='memory'        && <MemoryPage workflows={workflows}/>}
          {activeTab==='observability' && <ObservabilityPage workflows={workflows}/>}
          {activeTab==='audit'         && <AuditPage logs={auditLogs}/>}
          {activeTab==='rlhf'          && <RLHFPage workflows={workflows} addToast={add}/>}
          {activeTab==='predictive'    && <PredictivePage addToast={add}/>}
          {activeTab==='knowledge'     && <KnowledgePage/>}
          {activeTab==='constitution'  && <ConstitutionPage addToast={add}/>}
          {activeTab==='scheduler'     && <SchedulerPage addToast={add}/>}
          {activeTab==='explainability'&& <ExplainabilityPage workflows={workflows}/>}
        </div>
      </div>

      <Toasts toasts={toasts}/>
    </div>
  );
}
