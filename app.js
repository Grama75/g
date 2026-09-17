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