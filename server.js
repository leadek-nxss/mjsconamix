const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors:{origin:"*"} });
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

const ADMIN_PASS = "DVS1404";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.json({limit:'10mb'}));
app.use(express.static('public'));

let data = { textMsgs: [], photoMsgs: [] };
try{ if(fs.existsSync('data.json')){ const j=JSON.parse(fs.readFileSync('data.json','utf8')); data.textMsgs=j.textMsgs||j.messages||[]; data.photoMsgs=j.photoMsgs||[]; } }catch(e){}
function save(){ try{ fs.writeFileSync('data.json', JSON.stringify(data)); }catch(e){} }

// APIS
app.get('/api/feed', (req,res)=> res.json(data) );
app.post('/api/admin/login', (req,res)=> res.json({ok:req.body.pass===ADMIN_PASS}) );
app.get('/api/admin/all', (req,res)=>{
  if(req.query.pass!==ADMIN_PASS) return res.status(401).json({error:'no auth'});
  res.json(data);
});
app.post('/api/admin/delete', async (req,res)=>{
  const {pass,type,id}=req.body; if(pass!==ADMIN_PASS) return res.status(401).json({error:'no'});
  if(type==='photo'){
    const m=data.photoMsgs.find(x=>x.id===id);
    if(m&&m.public_id) try{ await cloudinary.uploader.destroy(m.public_id); }catch(e){}
    data.photoMsgs=data.photoMsgs.filter(x=>x.id!==id);
  }else data.textMsgs=data.textMsgs.filter(x=>x.id!==id);
  save(); io.emit('force-reload'); res.json({ok:true});
});
app.post('/api/admin/delete-reply', (req,res)=>{
  const {pass,type,parentId,replyId}=req.body; if(pass!==ADMIN_PASS) return res.status(401).json({error:'no'});
  const list=type==='text'?data.textMsgs:data.photoMsgs; const p=list.find(m=>m.id===parentId);
  if(p) p.replies=(p.replies||[]).filter(r=>r.id!==replyId);
  save(); io.emit('force-reload'); res.json({ok:true});
});

// SOCKET
io.on('connection', socket=>{
  socket.emit('init-feed',{texts:data.textMsgs.slice(-100), photos:data.photoMsgs.slice(-100)});
  socket.on('send-text', text=>{
    text=(text||"").trim().substring(0,300); if(!text) return;
    const msg={id:Date.now().toString(), text, image:null, replies:[], time:Date.now()};
    data.textMsgs.push(msg); save(); io.emit('new-text', msg);
  });
  socket.on('send-photo', async ({text,image})=>{
    if(!image) return;
    try{
      let finalUrl=image, public_id=null;
      if(process.env.CLOUDINARY_CLOUD_NAME){
        const up=await cloudinary.uploader.upload(image,{folder:"mjsconamix", transformation:[{width:600,crop:"limit",quality:"auto:good",fetch_format:"auto"}]});
        finalUrl=up.secure_url; public_id=up.public_id;
      }
      const msg={id:Date.now().toString(), text:(text||"").trim().substring(0,200), image:finalUrl, public_id, replies:[], time:Date.now()};
      data.photoMsgs.push(msg); save(); io.emit('new-photo', msg);
    }catch(e){ console.log(e); socket.emit('upload-error','Error subiendo'); }
  });
  socket.on('reply', ({type,parentId,text})=>{
    text=(text||"").trim().substring(0,200); if(!text) return;
    const list=type==='text'?data.textMsgs:data.photoMsgs; const parent=list.find(m=>m.id===parentId); if(!parent) return;
    if(!parent.replies) parent.replies=[]; parent.replies.push({id:Date.now().toString(), text, time:Date.now()});
    save(); io.emit('update-replies',{type,parentId,replies:parent.replies});
  });
});

http.listen(process.env.PORT||3000, ()=>console.log('ON'));
