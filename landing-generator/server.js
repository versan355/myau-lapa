const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const configPath = path.join(ROOT, 'config.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {
  host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 4317),
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  dataDir: './data', publicDir: './published', ai: { baseUrl: process.env.AI_BASE_URL || 'https://polza.ai/api/v1', apiKeyEnv: 'POLZA_API_KEY', model: process.env.AI_MODEL || 'deepseek/deepseek-chat' }
};
const dataDir = path.resolve(ROOT, config.dataDir); const publicDir = path.resolve(ROOT, config.publicDir);
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(publicDir, { recursive: true });
const dbFile = path.join(dataDir, 'store.json');
const initial = { settings: {}, projects: [], sessions: {}, queue: [] };
function load(){ try{return {...initial,...JSON.parse(fs.readFileSync(dbFile,'utf8'))}}catch{return structuredClone(initial)} }
let store = load();
function save(){fs.writeFileSync(dbFile, JSON.stringify(store,null,2),'utf8')}
function hash(v){return crypto.scryptSync(v, 'landing-generator-salt', 64).toString('hex')}
function same(a,b){return a && b && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}
function token(){return crypto.randomBytes(32).toString('hex')}
function send(res, status, body, type='application/json'){res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type.includes('json')?JSON.stringify(body):body)}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}))}
function user(req){const t=cookies(req).lg_session; return t && store.sessions[t] ? store.sessions[t] : null}
async function body(req){let s='';for await(const c of req)s+=c;if(!s)return {};try{return JSON.parse(s)}catch{return {}}}
function slug(s){return String(s||'project').toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,48)||'project'}
function uniqueSlug(base, id){let s=slug(base), n=1;while(store.projects.some(p=>p.id!==id&&p.slug===s))s=`${slug(base)}-${n++}`;return s}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function landingHtml(p){const title=escapeHtml(p.name||'Новый лендинг'); const brief=escapeHtml(p.brief||'Описание проекта появится здесь.'); return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{--ink:#17202a;--accent:#ff5a6e;--soft:#fff5e7;--blue:#4b6bff}*{box-sizing:border-box}body{margin:0;font:16px system-ui,sans-serif;color:var(--ink);background:var(--soft)}.wrap{max-width:1080px;margin:auto;padding:24px}.nav{display:flex;justify-content:space-between;align-items:center}.logo{font-weight:900;font-size:22px}.pill{padding:8px 13px;border:2px solid var(--ink);border-radius:999px;background:#fff}.hero{padding:100px 24px 120px;max-width:1080px;margin:auto}.eyebrow{color:var(--accent);font-weight:900;text-transform:uppercase;letter-spacing:.1em}.hero h1{font-size:clamp(48px,8vw,96px);line-height:.95;max-width:850px;margin:18px 0}.hero p{font-size:20px;line-height:1.5;max-width:650px}.btn{display:inline-block;background:var(--blue);color:#fff;padding:14px 20px;border-radius:12px;font-weight:800;margin-top:16px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{padding:24px;background:#fff;border:2px solid var(--ink);border-radius:20px}.section{padding:70px 24px;max-width:1080px;margin:auto}@media(max-width:700px){.grid{grid-template-columns:1fr}.hero{padding-top:60px}}</style></head><body><header class="wrap nav"><div class="logo">✦ ${title}</div><div class="pill">Демо-концепция</div></header><main><section class="hero"><div class="eyebrow">Лендинг создан генератором</div><h1>${title}</h1><p>${brief}</p><a class="btn" href="#contact">Обсудить проект →</a></section><section class="section"><div class="grid"><article class="card"><h2>Понятно</h2><p>Сильный оффер и ясная структура с первого экрана.</p></article><article class="card"><h2>Быстро</h2><p>Адаптивная страница для телефона и компьютера.</p></article><article class="card"><h2>Готово</h2><p>Файлы можно редактировать и публиковать по постоянной ссылке.</p></article></div></section><section class="section" id="contact"><h2>Готовы обсудить?</h2><p>Оставьте заявку — здесь можно подключить настоящую форму.</p></section></main></body></html>`}
function projectPublic(p){const dir=path.join(publicDir,p.slug);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),landingHtml(p));return `/published/${p.slug}/`}
async function aiReply(p, message){const key=process.env[config.ai?.apiKeyEnv||'POLZA_API_KEY'];if(config.ai?.baseUrl&&key){try{const r=await fetch(`${config.ai.baseUrl.replace(/\/$/,'')}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.ai.model,messages:[{role:'system',content:'You are a concise landing-page planning assistant. Reply in Russian with practical edits.'},{role:'user',content:`Project: ${p.name}\nCurrent brief: ${p.brief}\nRequest: ${message}`}],temperature:.5})});if(r.ok){const j=await r.json();return j.choices?.[0]?.message?.content||''}}catch{}}
  return `Принято. Я обновил концепцию «${p.name}». Запрос: ${message}. Предпросмотр обновлён — при подключённом AI-провайдере здесь будет полноценная генерация файлов и изображений.`}
function requireAuth(req,res){if(!user(req)){send(res,401,{error:'auth_required'});return false}return true}
async function api(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,{setup:!store.settings.passwordHash,authenticated:!!user(req)});
  if(req.method==='POST'&&url.pathname==='/api/setup'){if(store.settings.passwordHash)return send(res,409,{error:'already_setup'});const b=await body(req);if(!b.password||String(b.password).length<8)return send(res,400,{error:'Пароль должен быть не короче 8 символов'});store.settings.passwordHash=hash(b.password);save();return send(res,200,{ok:true})}
  if(req.method==='POST'&&url.pathname==='/api/login'){const b=await body(req);if(!store.settings.passwordHash)return send(res,400,{error:'setup_required'});if(!same(hash(b.password),store.settings.passwordHash))return send(res,403,{error:'Неверный пароль'});const t=token();store.sessions[t]=Date.now();save();res.setHeader('Set-Cookie',`lg_session=${t}; HttpOnly; SameSite=Strict; Path=/`);return send(res,200,{ok:true})}
  if(!requireAuth(req,res))return;
  if(req.method==='GET'&&url.pathname==='/api/projects')return send(res,200,store.projects.map(p=>({...p,html:projectPublic(p)})));
  if(req.method==='POST'&&url.pathname==='/api/projects'){const b=await body(req);const p={id:crypto.randomUUID(),name:String(b.name||'Новый проект').slice(0,80),slug:uniqueSlug(b.name),brief:'',messages:[],events:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};store.projects.unshift(p);save();return send(res,201,p)}
  const pm=url.pathname.match(/^\/api\/projects\/([^/]+)$/); const p=pm&&store.projects.find(x=>x.id===pm[1]);
  if(pm&&req.method==='GET'){if(!p)return send(res,404,{error:'not_found'});return send(res,200,p)}
  if(pm&&req.method==='PATCH'){if(!p)return send(res,404,{error:'not_found'});const b=await body(req);if(b.name){p.name=String(b.name).slice(0,80);p.slug=uniqueSlug(p.name,p.id)}if(typeof b.brief==='string')p.brief=b.brief;p.updatedAt=new Date().toISOString();save();return send(res,200,p)}
  if(pm&&req.method==='DELETE'){if(!p)return send(res,404,{error:'not_found'});p.deletedAt=new Date().toISOString();save();return send(res,200,{ok:true})}
  const chat=url.pathname.match(/^\/api\/projects\/([^/]+)\/chat$/); const cp=chat&&store.projects.find(x=>x.id===chat[1]);
  if(chat&&req.method==='POST'){if(!cp)return send(res,404,{error:'not_found'});const b=await body(req);if(!b.message)return send(res,400,{error:'Введите сообщение'});if(!cp.name||cp.name==='Новый проект'){cp.name=String(b.message).slice(0,42);cp.slug=uniqueSlug(cp.name,cp.id)}cp.brief=String(b.message);const reply=await aiReply(cp,String(b.message));cp.messages.push({role:'user',text:String(b.message),at:new Date().toISOString()},{role:'assistant',text:reply,at:new Date().toISOString()});cp.events.push({type:'generation_complete',text:'Черновик обновлён',at:new Date().toISOString()});save();projectPublic(cp);return send(res,200,{project:cp,reply})}
  const pub=url.pathname.match(/^\/api\/projects\/([^/]+)\/publish$/);const pp=pub&&store.projects.find(x=>x.id===pub[1]);if(pub&&req.method==='POST'){if(!pp)return send(res,404,{error:'not_found'});const b=await body(req);if(b.slug){pp.slug=uniqueSlug(b.slug,pp.id)}pp.publishedAt=new Date().toISOString();projectPublic(pp);save();return send(res,200,{url:`/published/${pp.slug}/`,project:pp})}
  send(res,404,{error:'not_found'});
}
const ui=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{if(url.pathname.startsWith('/api/'))return await api(req,res,url);if(url.pathname.startsWith('/published/')){const file=path.join(publicDir,url.pathname.slice('/published/'.length));if(!file.startsWith(publicDir)||!fs.existsSync(file))return send(res,404,'Not found','text/plain');return send(res,200,fs.readFileSync(file),file.endsWith('.html')?'text/html':'application/octet-stream')}return send(res,200,ui,'text/html')}catch(e){console.error(e);send(res,500,{error:'server_error'})}});
server.listen(config.port,config.host,()=>console.log(`Landing Generator: http://${config.host}:${config.port}`));
