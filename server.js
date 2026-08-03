const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {cors:{origin:"*"}});
const fs = require('fs');

const PASS = "DVS1404";
app.use(express.json({limit:'10mb'}));
app.use(express.static('public'));

let data = {textMsgs:[], photoMsgs:[]};
try{ if(fs.existsSync('data.json')){ const j=JSON.parse(fs.readFileSync('data.json')); data.textMsgs=j.textMsgs||j.messages||[]; data.photoMsgs=j.photoMsgs||[]; } }catch(e){}
function save(){ try{fs.writeFileSync('data.json', JSON.stringify(data))}catch(e){} }

app.get('/api/feed', (req,res)=>res.json(data));
app.post('/api/admin/login', (req,res)=>res.json({ok:req.body.pass===PASS}));
app.get('/api/admin/all', (req,res)=>{
  if(req.query.pass!==PASS) return res.status(401).json({error:'no'});
  res.json(data);
});
app.post('/api/admin/delete', (req,res)=>{
  const {pass,type,id}=req.body; if(pass!==PASS) return res.status(401).json({error:'no'});
  if(type==='photo') data.photoMsgs=data.photoMsgs.filter(m=>m.id!==id);
  else data.textMsgs=data.textMsgs.filter(m=>m.id!==id);
  save(); io.emit('force-reload'); res.json({ok:true});
});
app.post('/api/admin/delete-reply', (req,res)=>{
  const {pass,type,parentId,replyId}=req.body; if(pass!==PASS) return res.status(401).json({error:'no'});
  const list=type==='text'?data.textMsgs:data.photoMsgs;
  const p=list.find(m=>m.id===parentId);
  if(p) p.replies=(p.replies||[]).filter(r=>r.id!==replyId);
  save(); io.emit('update-replies',{type,parentId,replies:p?p.replies:[]});
  res.json({ok:true});
});

io.on('connection', socket=>{
  socket.emit('init-feed',{texts:data.textMsgs.slice(-100), photos:data.photoMsgs.slice(-100)});
  socket.on('send-text', t=>{
    t=(t||'').trim().slice(0,300); if(!t) return;
    const m={id:Date.now().toString(), text:t, replies:[], time:Date.now()};
    data.textMsgs.push(m); save(); io.emit('new-text', m);
  });
  socket.on('send-photo', d=>{
    if(!d.image) return;
    const m={id:Date.now().toString(), text:(d.text||'').slice(0,200), image:d.image, replies:[], time:Date.now()};
    data.photoMsgs.push(m); save(); io.emit('new-photo', m);
  });
  socket.on('reply', ({type,parentId,text})=>{
    text=(text||'').trim().slice(0,200); if(!text) return;
    const list=type==='text'?data.textMsgs:data.photoMsgs;
    const parent=list.find(m=>m.id===parentId); if(!parent) return;
    if(!parent.replies) parent.replies=[];
    parent.replies.push({id:Date.now().toString(), text, time:Date.now()});
    save(); io.emit('update-replies',{type,parentId,replies:parent.replies});
  });
});

http.listen(process.env.PORT||3000, ()=>console.log('ON COMPLETO'));
