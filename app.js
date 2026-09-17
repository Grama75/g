var STORAGE='mindmap_v4';
var docs=[], folders=[], currentDocId=null;
var layout='indent', mode='edit';
var selectedId=null, focusId=null, nodeMap={};
var history=[], historyIndex=-1;
var tbList=[], underlines={}, nodePos={};
var tbNextId=1;
var quotes=[
  {text:'生如夏花之绚烂，死如秋叶之静美。',author:'泰戈尔'},
  {text:'凡是过往，皆为序章。',author:'莎士比亚'},
  {text:'路漫漫其修远兮，吾将上下而求索。',author:'屈原'},
  {text:'认识你自己。',author:'苏格拉底'},
  {text:'上善若水，水善利万物而不争。',author:'老子'},
  {text:'学而不思则罔，思而不学则殆。',author:'孔子'},
  {text:'我思故我在。',author:'笛卡尔'},
  {text:'黑夜无论怎样悠长，白昼总会到来。',author:'莎士比亚'},
  {text:'吾生也有涯，而知也无涯。',author:'庄子'}
];

function makeNode(text,pid){
  return {id:'n'+Math.random().toString(36).slice(2,10),text:text,parent:pid||null,children:[],collapsed:false,link:'',note:''};
}
function newDoc(){
  var d={id:'d'+Date.now(),name:'未命名导图',root:makeNode('中心主题'),folderId:null,updated:Date.now(),tb:[],ul:{},pos:{}};
  docs.unshift(d); currentDocId=d.id; save(); openEdit();
}
function load(){
  try{
    var raw=localStorage.getItem(STORAGE);
    if(raw){var d=JSON.parse(raw);docs=d.docs||[];folders=d.folders||[];}
  }catch(e){}
  if(!docs.length)newDoc();
}
function save(){
  try{localStorage.setItem(STORAGE,JSON.stringify({docs:docs,folders:folders}));}catch(e){}
}
function cur(){return docs.find(function(d){return d.id===currentDocId;});}
function buildMap(){
  nodeMap={};
  var d=cur(); if(!d)return;
  (function walk(n,depth,parent){
    n.depth=depth; n.parentNode=parent;
    nodeMap[n.id]=n;
    n.children.forEach(function(c){walk(c,depth+1,n);});
  })(d.root,0,null);
}
function getRoot(){
  var d=cur(); if(!d)return null;
  if(!focusId)return d.root;
  return nodeMap[focusId]||d.root;
}
function visible(root){
  var r=[]; root=root||getRoot();
  (function walk(n){r.push(n); if(!n.collapsed)n.children.forEach(walk);})(root);
  return r;
}

function snapshot(){
  var d=cur(); if(!d)return null;
  return JSON.stringify({root:d.root,tb:d.tb||[],ul:d.ul||{},pos:d.pos||{}});
}
function saveHistory(){
  var s=snapshot(); if(!s)return;
  if(historyIndex<history.length-1)history=history.slice(0,historyIndex+1);
  history.push(s);
  if(history.length>50)history.shift();
  historyIndex=history.length-1;
}
function undo(){
  if(historyIndex<=0)return;
  historyIndex--;
  var s=JSON.parse(history[historyIndex]);
  var d=cur(); d.root=s.root; d.tb=s.tb; d.ul=s.ul; d.pos=s.pos;
  tbList=d.tb; underlines=d.ul; nodePos=d.pos;
  selectedId=null; buildMap(); save(); render();
}
function redo(){
  if(historyIndex>=history.length-1)return;
  historyIndex++;
  var s=JSON.parse(history[historyIndex]);
  var d=cur(); d.root=s.root; d.tb=s.tb; d.ul=s.ul; d.pos=s.pos;
  tbList=d.tb; underlines=d.ul; nodePos=d.pos;
  selectedId=null; buildMap(); save(); render();
}

function layoutIndent(root){
  var y=0,IND=22,GAP=6,maxRight=0,maxW=Math.max(window.innerWidth-60,200);
  (function walk(n,x){
    var textW=n.text.length*13*0.7+20;
    n.w=Math.min(Math.max(textW,50),Math.max(maxW-x,60));
    var lines=Math.ceil(textW/(n.w-16));
    n.h=Math.max(30,lines*19+12);
    n.x=x+n.w/2; n.y=y+n.h/2;
    if(n.x+n.w/2>maxRight)maxRight=n.x+n.w/2;
    y+=n.h+GAP;
    if(!n.collapsed)n.children.forEach(function(c){walk(c,x+IND);});
  })(root,0);
  var totalH=y;
  (function shift(n){n.x-=maxRight/2;n.y-=totalH/2;n.children.forEach(shift);})(root);
}
function layoutRadial(root){
  (function assign(n,s,e){
    var k=n.children.length; if(!k)return;
    var per=(e-s)/k;
    for(var i=0;i<k;i++){var c=n.children[i];c.angle=s+i*per+per/2;assign(c,s+i*per,s+i*per+per);}
  })(root,0,360);
  (function place(n,px,py){
    if(n.depth===0){n.x=0;n.y=0;}
    else{
      var p=n.parentNode;
      if(p){var dd=p.depth===0?180:p.depth===1?160:140;var r=(n.angle-90)*Math.PI/180;n.x=px+Math.cos(r)*dd;n.y=py+Math.sin(r)*dd;}
    }
    if(!n.collapsed)n.children.forEach(function(c){place(c,n.x,n.y);});
  })(root,0,0);
}
function cycleLayout(){
  var order=['indent','radial','bracket'];
  var i=order.indexOf(layout); layout=order[(i+1)%order.length];
  document.getElementById('layoutBtn').textContent={indent:'缩进',radial:'放射',bracket:'括号'}[layout];
  focusId=null; render();
}
function cycleMode(){
  var order=['edit','note','review'];
  var i=order.indexOf(mode); mode=order[(i+1)%order.length];
  document.getElementById('modeBtn').textContent={edit:'编辑',note:'笔记',review:'复习'}[mode];
  selectedId=null; render();
}
function escapeHTML(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function bracketText(root){
  var lines=[];
  (function walk(n,prefix,isLast,depth){
    if(depth===0)lines.push(n.text);
    else lines.push(prefix+(isLast?'└─ ':'├─ ')+n.text);
    var cp=prefix+(depth===0?'':(isLast?'   ':'│  '));
    n.children.forEach(function(c,i){walk(c,cp,i===n.children.length-1,depth+1);});
  })(root,'',true,0);
  return lines.join('\n');
}

function render(){
  buildMap();
  var d=cur(); if(!d)return;
  tbList=d.tb=d.tb||[]; underlines=d.ul=d.ul||{}; nodePos=d.pos=d.pos||{};
  var root=getRoot(); if(!root)return;
  var nodesEl=document.getElementById('nodes');
  var bracketEl=document.getElementById('bracket');
  var bcEl=document.getElementById('breadcrumb');

  if(layout==='bracket'){
    nodesEl.style.display='none'; bracketEl.classList.add('show');
    document.getElementById('bracketText').textContent=bracketText(root);
    bcEl.classList.remove('show');
    renderToolbar();
    return;
  }
  nodesEl.style.display=''; bracketEl.classList.remove('show');

  if(layout==='indent')layoutIndent(root); else layoutRadial(root);

  var vis=visible(root);
  var cv=document.getElementById('canvas');
  var cx=cv.clientWidth/2, cy=cv.clientHeight/2;
  var html='';
  vis.forEach(function(n){
    var px=n.x, py=n.y;
    if(mode!=='edit'&&nodePos[n.id]){px=nodePos[n.id].x;py=nodePos[n.id].y;}
    var x=cx+px, y=cy+py;
    var cls='node';
    if(n.depth===0)cls+=' root'; else if(n.depth===1)cls+=' lv1';
    if(n.id===selectedId)cls+=' sel';
    if(underlines[n.id])cls+=' underlined-'+underlines[n.id];
    var w=n.w||Math.min(Math.max(n.text.length*8+24,50),180);
    html+='<div class="'+cls+'" style="left:'+x+'px;top:'+y+'px;max-width:'+w+'px" data-id="'+n.id+'">'+escapeHTML(n.text)+'</div>';
  });
  tbList.forEach(function(tb){
    var x=cx+tb.x, y=cy+tb.y;
    html+='<div class="tb" style="left:'+x+'px;top:'+y+'px;width:'+(tb.w||120)+'px" data-tb="'+tb.id+'">'+escapeHTML(tb.text)+'<span class="tbClose" data-tbdel="'+tb.id+'">×</span></div>';
  });
  nodesEl.innerHTML=html;

  var items=nodesEl.querySelectorAll('.node');
  for(var i=0;i<items.length;i++){
    items[i].addEventListener('click',function(e){
      e.stopPropagation();
      var id=this.getAttribute('data-id');
      if(mode==='review'){
        var n=nodeMap[id];
        if(n.link)window.open(n.link,'_blank');
        if(n.note){
          var pp=document.getElementById('notePopup');
          pp.textContent=n.note;
          pp.style.display='block';
          pp.style.left=Math.min(e.clientX,window.innerWidth-280)+'px';
          pp.style.top=(e.clientY+10)+'px';
          setTimeout(function(){pp.style.display='none';},3000);
        }
      }else{
        selectedId=id; render();
      }
    });
  }
  nodesEl.querySelectorAll('[data-tbdel]').forEach(function(el){
    el.onclick=function(e){
      e.stopPropagation();
      var id=this.getAttribute('data-tbdel');
      saveHistory();
      d.tb=tbList=tbList.filter(function(t){return String(t.id)!==id;});
      save(); render();
    };
  });

  if(layout==='indent'&&focusId){
    var path=[]; var cu=nodeMap[focusId];
    while(cu){path.unshift(cu);cu=cu.parentNode;}
    path.unshift(d.root);
    var uniq=[]; path.forEach(function(n){if(!uniq.length||uniq[uniq.length-1]!==n)uniq.push(n);});
    var h='';
    uniq.forEach(function(n,i){
      if(i)h+=' › ';
      var isCur=(i===uniq.length-1);
      h+='<span class="'+(isCur?'cur':'')+'" data-id="'+(n===d.root?'':n.id)+'">'+escapeHTML(n.text)+'</span>';
    });
    bcEl.innerHTML=h; bcEl.classList.add('show');
    bcEl.querySelectorAll('span:not(.cur)').forEach(function(sp){
      sp.onclick=function(){var id=this.getAttribute('data-id');focusId=id||null;selectedId=null;render();};
    });
  }else{bcEl.classList.remove('show');}

  renderToolbar();
}

function renderToolbar(){
  var tb=document.getElementById('toolbar');
  var has=!!selectedId;
  if(mode==='edit'){
    tb.innerHTML=
      '<button onclick="addChild()" '+(has?'':'disabled')+'>+ 子节点</button>'+
      '<button onclick="showEdit()" '+(has?'':'disabled')+'>编辑</button>'+
      '<button onclick="toggleCollapse()" '+(has?'':'disabled')+'>折叠</button>'+
      '<button onclick="delNode()" '+(has?'':'disabled')+'>删除</button>'+
      '<button onclick="toggleFocus()" '+(has?'':'disabled')+'>聚焦</button>'+
      '<button onclick="undo()">撤回</button>'+
      '<button onclick="redo()">重做</button>';
  }else if(mode==='note'){
    tb.innerHTML=
      '<button onclick="addTextbox()">+ 便签</button>'+
      '<button onclick="underlineSel()" '+(has?'':'disabled')+'>划线</button>'+
      '<button onclick="clearNoteLayout()">重置位置</button>'+
      '<button onclick="undo()">撤回</button>'+
      '<button onclick="redo()">重做</button>';
  }else{
    tb.innerHTML='<button onclick="undo()">撤回</button><button onclick="redo()">重做</button>';
  }
}

function addChild(){
  if(!selectedId)return;
  var p=nodeMap[selectedId];
  saveHistory();
  var n=makeNode('新节点',p.id);
  p.children.push(n); p.collapsed=false;
  selectedId=n.id;
  if(cur())cur().updated=Date.now();
  save(); render();
}
function showEdit(){
  if(!selectedId)return;
  var n=nodeMap[selectedId];
  var box=document.getElementById('modalBox');
  box.innerHTML='<h3>编辑节点</h3>'+
    '<input id="eText" value="'+escapeHTML(n.text)+'">'+
    '<input id="eLink" placeholder="链接（可选）" value="'+escapeHTML(n.link||'')+'">'+
    '<textarea id="eNote" placeholder="备注（可选）">'+escapeHTML(n.note||'')+'</textarea>'+
    '<div class="row"><button onclick="closeModal()">取消</button><button class="primary" onclick="saveEdit()">保存</button></div>';
  document.getElementById('modal').classList.add('show');
}
function saveEdit(){
  if(!selectedId)return;
  var n=nodeMap[selectedId];
  var t=document.getElementById('eText').value.trim();
  if(t){
    saveHistory();
    n.text=t;
    n.link=document.getElementById('eLink').value.trim();
    n.note=document.getElementById('eNote').value.trim();
    if(cur())cur().updated=Date.now();
    save();
  }
  closeModal(); render();
}
function closeModal(){document.getElementById('modal').classList.remove('show');}
function toggleCollapse(){
  if(!selectedId)return;
  var n=nodeMap[selectedId];
  if(!n.children.length)return alert('没有子节点');
  saveHistory();
  n.collapsed=!n.collapsed;
  save(); render();
}
function delNode(){
  if(!selectedId)return;
  var n=nodeMap[selectedId];
  if(!n.parentNode)return alert('不能删除根节点');
  if(!confirm('删除该节点及其所有子节点？'))return;
  saveHistory();
  var p=n.parentNode;
  p.children=p.children.filter(function(c){return c.id!==n.id;});
  selectedId=null;
  if(cur())cur().updated=Date.now();
  save(); render();
}
function toggleFocus(){
  if(!selectedId){focusId=null;}
  else if(focusId===selectedId){focusId=null;}
  else{focusId=selectedId;}
  selectedId=null; render();
}
function addTextbox(){
  saveHistory();
  var d=cur();
  d.tb=tbList;
  tbList.push({id:tbNextId++,x:20,y:-100,w:130,text:'双击编辑'});
  save(); render();
}
function underlineSel(){
  if(!selectedId)return;
  var d=cur();
  saveHistory();
  var curc=underlines[selectedId];
  var next={undefined:'red','red':'black','black':'blue','blue':null}[curc];
  if(next)underlines[selectedId]=next; else delete underlines[selectedId];
  d.ul=underlines;
  save(); render();
}
function clearNoteLayout(){
  if(!confirm('重置所有节点位置？'))return;
  saveHistory();
  var d=cur(); d.pos={}; nodePos={};
  save(); render();
}

function showExport(){
  var box=document.getElementById('modalBox');
  box.innerHTML='<h3>导出为</h3>'+
    '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">'+
    '<button onclick="exportMD();closeModal()" style="padding:12px;text-align:left">📄 Markdown 大纲</button>'+
    '<button onclick="exportPNG();closeModal()" style="padding:12px;text-align:left">🖼 PNG 图片</button>'+
    '</div>'+
    '<div class="row"><button onclick="closeModal()">取消</button></div>';
  document.getElementById('modal').classList.add('show');
}
function exportMD(){
  var d=cur(); if(!d)return;
  var lines=[];
  (function walk(n,dep){
    var p=''; for(var i=0;i<dep;i++)p+='  ';
    lines.push(p+'- '+n.text);
    n.children.forEach(function(c){walk(c,dep+1);});
  })(d.root,0);
  var blob=new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(d.name||'导图')+'.md';a.click();
}
function exportPNG(){
  var d=cur(); if(!d)return;
  var root=d.root;
  if(layout==='bracket'){
    var text=bracketText(root);
    var lines=text.split('\n');
    var dpr0=3,fs0=14,lh0=fs0*1.6,pad0=30;
    var maxLen=0; lines.forEach(function(l){if(l.length>maxLen)maxLen=l.length;});
    var W0=maxLen*fs0*0.7+pad0*2, H0=lines.length*lh0+pad0*2;
    var c0=document.createElement('canvas');
    c0.width=W0*dpr0; c0.height=H0*dpr0;
    var x0=c0.getContext('2d'); x0.scale(dpr0,dpr0);
    x0.fillStyle='#fff'; x0.fillRect(0,0,W0,H0);
    x0.fillStyle='#2c3e50'; x0.font=fs0+'px monospace'; x0.textBaseline='top';
    lines.forEach(function(l,i){x0.fillText(l,pad0,pad0+i*lh0);});
    c0.toBlob(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(d.name||'导图')+'.png';a.click();},'image/png');
    return;
  }
  if(layout==='indent')layoutIndent(root); else layoutRadial(root);
  var vis=visible(root);
  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  vis.forEach(function(n){
    var w=n.w||100, h=n.h||36;
    if(n.x-w/2<minX)minX=n.x-w/2;
    if(n.x+w/2>maxX)maxX=n.x+w/2;
    if(n.y-h/2<minY)minY=n.y-h/2;
    if(n.y+h/2>maxY)maxY=n.y+h/2;
  });
  var pad=40, W=maxX-minX+pad*2, H=maxY-minY+pad*2;
  var dpr=3, maxSide=16000;
  if(W*dpr>maxSide)dpr=maxSide/W;
  if(H*dpr>maxSide)dpr=Math.min(dpr,maxSide/H);
  var canvas=document.createElement('canvas');
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  var ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  var ox=pad-minX, oy=pad-minY;
  if(layout==='radial'){
    vis.forEach(function(n){
      if(!n.parentNode||n.parentNode.collapsed)return;
      if(vis.indexOf(n.parentNode)<0)return;
      var x1=n.parentNode.x+ox, y1=n.parentNode.y+oy;
      var x2=n.x+ox, y2=n.y+oy;
      var mx=(x1+x2)/2, my=(y1+y2)/2;
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.bezierCurveTo(x1+(mx-x1)*0.5,y1,x2+(mx-x2)*0.5,y2,x2,y2);
      ctx.strokeStyle='#b0b8c4'; ctx.lineWidth=1.5; ctx.stroke();
    });
  }
  vis.forEach(function(n){
    var w=n.w||100, h=n.h||36;
    var x=n.x+ox, y=n.y+oy;
    var r=8, x0=x-w/2, y0=y-h/2;
    ctx.beginPath();
    ctx.moveTo(x0+r,y0); ctx.lineTo(x0+w-r,y0);
    ctx.quadraticCurveTo(x0+w,y0,x0+w,y0+r);
    ctx.lineTo(x0+w,y0+h-r);
    ctx.quadraticCurveTo(x0+w,y0+h,x0+w-r,y0+h);
    ctx.lineTo(x0+r,y0+h);
    ctx.quadraticCurveTo(x0,y0+h,x0,y0+h-r);
    ctx.lineTo(x0,y0+r);
    ctx.quadraticCurveTo(x0,y0,x0+r,y0);
    ctx.closePath();
    if(n.depth===0){ctx.fillStyle='#5b8ff9';ctx.strokeStyle='#3b6fe0';}
    else if(n.depth===1){ctx.fillStyle='#eef3fb';ctx.strokeStyle='#c8d6ee';}
    else{ctx.fillStyle='#fff';ctx.strokeStyle='#d8dce2';}
    ctx.fill(); ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle=(n.depth===0)?'#fff':'#2c3e50';
    ctx.font=((n.depth===0)?'700':'500')+' 13px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    var maxW=w-16, tl=[], cl='';
    for(var i=0;i<n.text.length;i++){
      var test=cl+n.text[i];
      if(ctx.measureText(test).width>maxW){tl.push(cl);cl=n.text[i];}else cl=test;
    }
    if(cl)tl.push(cl);
    var lh=17, sy=y-(tl.length-1)*lh/2;
    tl.forEach(function(line,i){ctx.fillText(line,x,sy+i*lh);});
  });
  canvas.toBlob(function(blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(d.name||'导图')+'.png';a.click();},'image/png');
}

function showImport(){
  var box=document.getElementById('modalBox');
  box.innerHTML='<h3>📥 导入纯文本</h3>'+
    '<div class="hint">支持缩进、Markdown（#）、编号（1. 一、）。第一行作为根节点。</div>'+
    '<textarea id="impText" placeholder="示例：&#10;第四章 计划&#10;  一、计划概述&#10;    概念&#10;  二、目标管理&#10;    制定目标"></textarea>'+
    '<div class="row"><button onclick="closeModal()">取消</button><button class="primary" onclick="doImport()">生成</button></div>';
  document.getElementById('modal').classList.add('show');
}
function parseText(text){
  var lines=text.split('\n'), parsed=[];
  for(var i=0;i<lines.length;i++){
    var raw=lines[i], trimmed=raw.trim();
    if(!trimmed)continue;
    var level=0, content=trimmed;
    var hm=trimmed.match(/^(#{1,6})\s+(.*)$/);
    if(hm){level=hm[1].length-1;content=hm[2].trim();}
    else{
      var im=raw.match(/^([\s]*)/);
      var istr=im[1].replace(/\t/g,'  ').replace(/　/g,'  ');
      level=Math.floor(istr.length/2);
      var nm=content.match(/^(\d+(?:\.\d+)*)[.)、]\s*(.*)$/);
      if(nm){level+=nm[1].split('.').length-1;content=nm[2].trim();}
      else{
        var cm=content.match(/^([一二三四五六七八九十]+)[、.．]\s*(.*)$/);
        if(cm){level+=1;content=cm[2].trim();}
        else{
          var bm=content.match(/^[（(](\d+)[）)]\s*(.*)$/);
          if(bm){level+=2;content=bm[2].trim();}
          else{
            var cbm=content.match(/^[（(]([一二三四五六七八九十]+)[）)]\s*(.*)$/);
            if(cbm){level+=2;content=cbm[2].trim();}
            else{
              var lm=content.match(/^[-*+]\s+(.*)$/);
              if(lm)content=lm[1].trim();
              else{
                var rm=content.match(/^(I{1,3}|IV|V|VI{0,3}|IX|X)[.)、]\s*(.*)$/i);
                if(rm){level+=1;content=rm[2].trim();}
                else{
                  var cm2=content.match(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*(.*)$/);
                  if(cm2){level+=2;content=cm2[1].trim();}
                  else if(/^[-=]{3,}$/.test(content))continue;
                }
              }
            }
          }
        }
      }
    }
    if(content)parsed.push({text:content,level:level});
  }
  if(!parsed.length)return null;
  var root=makeNode(parsed[0].text);
  var stack=[{node:root,level:parsed[0].level}];
  for(var j=1;j<parsed.length;j++){
    var p=parsed[j], node=makeNode(p.text);
    while(stack.length>1&&stack[stack.length-1].level>=p.level)stack.pop();
    var parent=stack[stack.length-1].node;
    parent.children.push(node); node.parent=parent.id;
    stack.push({node:node,level:p.level});
  }
  return root;
}
function doImport(){
  var text=document.getElementById('impText').value;
  if(!text.trim())return alert('请粘贴文本');
  var root=parseText(text);
  if(!root)return alert('无法解析');
  var name=text.split('\n')[0].trim().replace(/^#+\s*/,'').slice(0,30)||'导入的导图';
  var d={id:'d'+Date.now(),name:name,root:root,folderId:null,updated:Date.now(),tb:[],ul:{},pos:{}};
  docs.unshift(d); currentDocId=d.id;
  save(); closeModal(); openEdit();
}
function showFolders(){
  showPage('folderPage');
  var list=document.getElementById('folderList');
  if(!folders.length){
    list.innerHTML='<div style="text-align:center;padding:30px;color:#8b7d6b;font-size:13px">还没有文件夹，点右上角 + 新建</div>';
    return;
  }
  var html='';
  folders.forEach(function(f){
    var cnt=docs.filter(function(d){return d.folderId===f.id;}).length;
    html+='<div class="fitem" data-fid="'+f.id+'">'+
      '<span style="font-size:20px">📁</span>'+
      '<span style="flex:1;font-size:14px;color:#4a3f35;font-weight:500">'+escapeHTML(f.name)+'</span>'+
      '<span style="font-size:12px;color:#8b7d6b">'+cnt+' 个文档</span>'+
      '<span style="color:#e74c3c;padding:4px 8px" data-fdel="'+f.id+'">×</span>'+
    '</div>';
  });
  list.innerHTML=html;
  list.querySelectorAll('[data-fid]').forEach(function(el){
    el.onclick=function(e){
      if(e.target.getAttribute('data-fdel'))return;
      var fid=this.getAttribute('data-fid');
      var f=folders.find(function(x){return x.id===fid;});
      var input=prompt('文件夹名称（留空不改）',f.name);
      if(input&&input.trim()){f.name=input.trim();save();showFolders();}
    };
  });
  list.querySelectorAll('[data-fdel]').forEach(function(el){
    el.onclick=function(e){
      e.stopPropagation();
      var fid=this.getAttribute('data-fdel');
      if(!confirm('删除该文件夹？（文档不会被删除）'))return;
      docs.forEach(function(d){if(d.folderId===fid)d.folderId=null;});
      folders=folders.filter(function(f){return f.id!==fid;});
      save(); showFolders();
    };
  });
}
function newFolder(){
  var n=prompt('文件夹名称');
  if(n&&n.trim()){folders.push({id:'f'+Date.now(),name:n.trim()});save();showFolders();}
}

function showPage(id){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.getElementById(id).classList.add('active');
}
function renderRepo(){
  var list=document.getElementById('repoList');
  var kw=(document.getElementById('searchInput').value||'').trim().toLowerCase();
  var filtered=docs.slice();
  if(kw){
    filtered=filtered.filter(function(d){
      if(d.name.toLowerCase().indexOf(kw)>=0)return true;
      var found=false;
      (function walk(n){if(n.text.toLowerCase().indexOf(kw)>=0)found=true;n.children.forEach(walk);})(d.root);
      return found;
    });
  }
  filtered.sort(function(a,b){return (b.updated||0)-(a.updated||0);});
  var html='';
  filtered.forEach(function(d){
    var cnt=0; (function t(n){cnt++;n.children.forEach(t);})(d.root);
    var bc=cnt<=5?'#bbb':cnt<=15?'#5b8ff9':cnt<=30?'#27ae60':cnt<=50?'#e67e22':'#e74c3c';
    var f=folders.find(function(x){return x.id===d.folderId;});
    var ftag=f?'<div class="folderTag">📁'+escapeHTML(f.name)+'</div>':'';
    html+='<div class="card" style="border-color:'+bc+'" data-id="'+d.id+'">'+ftag+'<div class="thumb">🧠</div>'+
      '<div class="meta"><span class="name">'+escapeHTML(d.name)+'</span><span class="del" data-del="'+d.id+'">×</span></div></div>';
  });
  list.innerHTML=html||'<div style="grid-column:1/-1;text-align:center;padding:30px;color:#8b7d6b">没有匹配的导图</div>';
  list.querySelectorAll('.card').forEach(function(card){
    card.onclick=function(e){
      if(e.target.classList.contains('del'))return;
      currentDocId=this.getAttribute('data-id'); openEdit();
    };
    card.oncontextmenu=function(e){
      e.preventDefault();
      var id=this.getAttribute('data-id');
      var d=docs.find(function(x){return x.id===id;});
      if(!folders.length){alert('请先创建文件夹（仓库右上角 📁）');return;}
      var names=folders.map(function(f,i){return (i+1)+'.'+f.name;}).join('\n');
      var c=prompt('归类到文件夹（0=取消归类）:\n'+names);
      var n=parseInt(c);
      if(n===0)d.folderId=null;
      else if(n>0&&n<=folders.length)d.folderId=folders[n-1].id;
      save(); renderRepo();
    };
  });
  list.querySelectorAll('[data-del]').forEach(function(el){
    el.onclick=function(e){
      e.stopPropagation();
      var id=this.getAttribute('data-del');
      if(!confirm('删除该导图？'))return;
      docs=docs.filter(function(x){return x.id!==id;});
      if(currentDocId===id)currentDocId=null;
      save(); renderRepo();
    };
  });
}
function showHome(){
  var q=quotes[Math.floor(Math.random()*quotes.length)];
  document.querySelector('#quote .qtext').textContent=q.text;
  document.querySelector('#quote .qauthor').textContent='—— '+q.author;
  showPage('home');
}
function openRepo(){renderRepo();showPage('repo');}
function openEdit(){
  var d=cur(); if(!d)return;
  document.getElementById('title').textContent=d.name;
  focusId=null; selectedId=null;
  history=[snapshot()]; historyIndex=0;
  showPage('edit');
  setTimeout(render,30);
}
function backRepo(){if(cur())cur().updated=Date.now(); save(); openRepo();}
document.getElementById('createBtn').onclick=function(){newDoc();};

var dragging=null;
document.getElementById('canvas').addEventListener('touchstart',function(e){
  var tb=e.target.closest('.tb');
  if(tb&&mode==='note'){
    var id=tb.getAttribute('data-tb');
    var t=tbList.find(function(x){return String(x.id)===id;});
    if(!t)return;
    var tt=e.touches[0];
    dragging={t:t,ox:tt.clientX,oy:tt.clientY,tx:t.x,ty:t.y,el:tb};
    e.preventDefault();
  }
},{passive:false});
document.getElementById('canvas').addEventListener('touchmove',function(e){
  if(!dragging)return;
  e.preventDefault();
  var tt=e.touches[0];
  dragging.t.x=dragging.tx+(tt.clientX-dragging.ox);
  dragging.t.y=dragging.ty+(tt.clientY-dragging.oy);
  var cv=document.getElementById('canvas');
  var cx=cv.clientWidth/2, cy=cv.clientHeight/2;
  dragging.el.style.left=(cx+dragging.t.x)+'px';
  dragging.el.style.top=(cy+dragging.t.y)+'px';
},{passive:false});
document.getElementById('canvas').addEventListener('touchend',function(){
  if(dragging){save();dragging=null;}
});
document.getElementById('canvas').addEventListener('dblclick',function(e){
  var tb=e.target.closest('.tb');
  if(!tb||mode!=='note')return;
  var id=tb.getAttribute('data-tb');
  var t=tbList.find(function(x){return String(x.id)===id;});
  if(!t)return;
  var v=prompt('便签内容',t.text);
  if(v!==null){saveHistory();t.text=v;save();render();}
});

load();
showHome();