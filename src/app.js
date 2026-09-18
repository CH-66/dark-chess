const TYPES = {
  king:   { red: '帅', black: '将' },
  rook:   { red: '车', black: '车' },
  knight: { red: '马', black: '马' },
  bishop: { red: '相', black: '象' },
  advisor: { red: '仕', black: '士' },
  cannon: { red: '炮', black: '炮' },
  pawn:   { red: '兵', black: '卒' },
};

const PIECE_COUNTS = [
  ['rook', 2], ['knight', 2], ['bishop', 2], ['advisor', 2], ['cannon', 2], ['pawn', 5]
];

const initialSlots = [];
for (let x = 0; x < 9; x++) initialSlots.push({ x, y: 9, type: x === 4 ? 'king' : (x === 1 || x === 7 ? 'knight' : (x === 2 || x === 6 ? 'bishop' : (x === 3 || x === 5 ? 'advisor' : 'rook'))) });
initialSlots.push({x:1,y:7,type:'cannon'},{x:7,y:7,type:'cannon'});
for (let x=0;x<9;x+=2) initialSlots.push({x,y:6,type:'pawn'});

const boardEl = document.getElementById('board');
const turnTextEl = document.getElementById('turnText');
const hintTextEl = document.getElementById('hintText');
const revealBtn = document.getElementById('revealBtn');
const selectedInfoEl = document.getElementById('selectedInfo');
const logEl = document.getElementById('log');
const restartBtn = document.getElementById('restartBtn');

let state = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pieceLabel(piece) {
  return TYPES[piece.actualType][piece.side.toLowerCase()];
}

function sideName(side) { return side === 'RED' ? '红方' : '黑方'; }
function opposite(side) { return side === 'RED' ? 'BLACK' : 'RED'; }
function inBounds(x,y) { return x>=0 && x<9 && y>=0 && y<10; }
function pieceAt(x,y) { return state.pieces.find(p => p.alive && p.x===x && p.y===y); }

function makeSidePieces(side) {
  const slots = side === 'RED'
    ? initialSlots.map(s => ({...s}))
    : initialSlots.map(s => ({x:s.x, y:9-s.y, type:s.type}));

  const hiddenTypes = [];
  for (const [type,count] of PIECE_COUNTS) {
    for (let i=0;i<count;i++) hiddenTypes.push(type);
  }
  const shuffledTypes = shuffle(hiddenTypes);

  let idx=0;
  const pieces=[];
  for (const slot of slots) {
    const actualType = slot.type === 'king' ? 'king' : shuffledTypes[idx++];
    pieces.push({
      id: `${side}-${slot.x}-${slot.y}`,
      side,
      x:slot.x,
      y:slot.y,
      originalType:slot.type,
      actualType,
      revealed: slot.type === 'king',
      alive:true,
    });
  }
  return pieces;
}

function newGame() {
  state = {
    pieces: [...makeSidePieces('RED'), ...makeSidePieces('BLACK')],
    turn: 'RED',
    selectedId: null,
    gameOver: false,
    winner: null,
  };
  logEl.innerHTML = '';
  addLog('新对局开始：红方先手。');
  render();
}

function pos(x,y) {
  return { left: `${(x / 8) * 100}%`, top: `${(y / 9) * 100}%` };
}

function drawBoardGrid() {
  for (let y=0;y<10;y++) {
    const line=document.createElement('div'); line.className='grid-line grid-h'; line.style.top=`${(y/9)*100}%`; boardEl.appendChild(line);
  }
  for (let x=0;x<9;x++) {
    const line=document.createElement('div'); line.className='grid-line grid-v'; line.style.left=`${(x/8)*100}%`;
    line.style.top='0';
    boardEl.appendChild(line);
  }
  const river=document.createElement('div'); river.className='river'; river.innerHTML='<span>楚 河</span><span>漢 界</span>'; boardEl.appendChild(river);
}

function render() {
  boardEl.innerHTML='';
  drawBoardGrid();

  const selected = state.pieces.find(p => p.id===state.selectedId && p.alive);
  const targets = selected ? legalTargets(selected) : [];
  for (const t of targets) {
    const el=document.createElement('div');
    el.className='target-cell';
    if (pieceAt(t.x,t.y)) el.classList.add('capture');
    const p=pos(t.x,t.y); el.style.left=p.left; el.style.top=p.top;
    boardEl.appendChild(el);
  }

  for (const piece of state.pieces.filter(p => p.alive)) {
    const el=document.createElement('div');
    el.className=`piece ${piece.side.toLowerCase()} ${piece.revealed ? '' : 'hidden'}`;
    if (piece.id===state.selectedId) el.classList.add('selected');
    if (piece.side===state.turn && !state.gameOver) el.classList.add('selectable');
    const p=pos(piece.x,piece.y); el.style.left=p.left; el.style.top=p.top;
    el.textContent = piece.revealed ? pieceLabel(piece) : '暗';
    el.title = piece.revealed ? `${sideName(piece.side)} ${pieceLabel(piece)}` : '暗棋';
    el.addEventListener('click', () => onPieceClick(piece.id));
    boardEl.appendChild(el);
  }

  turnTextEl.textContent = state.gameOver ? `游戏结束：${sideName(state.winner)}获胜` : `轮到：${sideName(state.turn)}`;
  hintTextEl.textContent = state.gameOver ? '重新开局开始下一盘' : selected ? '请选择高亮目标，或原地翻开' : '选择一枚己方棋子';
  revealBtn.disabled = !selected || selected.revealed || state.gameOver;

  if (selected) {
    const role = selected.revealed ? '真实身份' : '当前状态';
    const value = selected.revealed ? pieceLabel(selected) : '暗棋';
    selectedInfoEl.innerHTML = `${sideName(selected.side)}<br>${role}：<strong>${value}</strong><br>首次行动类型：<strong>${TYPES[selected.originalType][selected.side.toLowerCase()]}</strong>`;
  } else {
    selectedInfoEl.textContent='尚未选择棋子';
  }

  if (state.gameOver && !document.querySelector('.win')) {
    const win=document.createElement('div'); win.className='win'; win.textContent=`${sideName(state.winner)}吃掉了对方帅/将。`;
    document.querySelector('.panel')?.prepend(win);
  }
}

function onPieceClick(id) {
  if (state.gameOver) return;
  const piece=state.pieces.find(p=>p.id===id && p.alive);
  if (!piece) return;

  if (piece.side===state.turn) {
    state.selectedId = state.selectedId===id ? null : id;
    render();
    return;
  }

  const selected=state.pieces.find(p=>p.id===state.selectedId && p.alive);
  if (!selected || selected.side!==state.turn) return;
  const target={x:piece.x,y:piece.y};
  if (legalTargets(selected).some(t=>t.x===target.x && t.y===target.y)) moveSelected(target);
}

revealBtn.addEventListener('click', () => {
  const selected=state.pieces.find(p=>p.id===state.selectedId && p.alive);
  if (!selected || selected.revealed || state.gameOver) return;
  selected.revealed=true;
  addLog(`${sideName(selected.side)}原地翻开：${pieceLabel(selected)}`);
  endTurn();
});

restartBtn.addEventListener('click', newGame);

function moveSelected(target) {
  const piece=state.pieces.find(p=>p.id===state.selectedId && p.alive);
  if (!piece) return;
  const captured=pieceAt(target.x,target.y);
  piece.x=target.x; piece.y=target.y;

  if (captured) {
    captured.alive=false;
    if (captured.actualType==='king') {
      state.gameOver=true;
      state.winner=piece.side;
      addLog(`${sideName(piece.side)}吃掉了对方帅/将，游戏结束。`);
      state.selectedId=null;
      render();
      return;
    }
  }

  if (!piece.revealed) {
    piece.revealed=true;
    addLog(`${sideName(piece.side)}移动并翻开：${pieceLabel(piece)}${captured ? '（吃子）' : ''}`);
  } else {
    addLog(`${sideName(piece.side)}移动${captured ? '并吃子' : ''}：${pieceLabel(piece)}`);
  }
  endTurn();
}

function endTurn() {
  state.selectedId=null;
  if (!state.gameOver) state.turn=opposite(state.turn);
  render();
}

function legalTargets(piece) {
  if (state.gameOver || !piece.alive) return [];
  const type = piece.revealed ? piece.actualType : piece.originalType;
  const out=[];

  if (piece.side !== state.turn) return out;

  const pushIfEmptyOrEnemy=(x,y)=>{
    if (!inBounds(x,y)) return false;
    const target=pieceAt(x,y);
    if (!target) { out.push({x,y}); return true; }
    if (target.side!==piece.side) out.push({x,y});
    return false;
  };

  const slide=(dirs)=>{
    for (const [dx,dy] of dirs) {
      let x=piece.x+dx, y=piece.y+dy;
      while(inBounds(x,y)) {
        const target=pieceAt(x,y);
        if (!target) out.push({x,y});
        else { if(target.side!==piece.side) out.push({x,y}); break; }
        x+=dx; y+=dy;
      }
    }
  };

  if (type==='king') {
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      const x=piece.x+dx,y=piece.y+dy;
      if (!inBounds(x,y)) continue;
      const inside = piece.side==='RED' ? (x>=3&&x<=5&&y>=7&&y<=9) : (x>=3&&x<=5&&y>=0&&y<=2);
      if (inside) pushIfEmptyOrEnemy(x,y);
    }
  } else if (type==='rook') {
    slide([[1,0],[-1,0],[0,1],[0,-1]]);
  } else if (type==='knight') {
    const moves=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    for (const [dx,dy] of moves) {
      const leg = Math.abs(dx)===2 ? [piece.x+dx/2,piece.y] : [piece.x,piece.y+dy/2];
      if (pieceAt(leg[0],leg[1])) continue;
      pushIfEmptyOrEnemy(piece.x+dx,piece.y+dy);
    }
  } else if (type==='bishop') {
    const moves=[[2,2],[2,-2],[-2,2],[-2,-2]];
    for(const [dx,dy] of moves){
      const x=piece.x+dx,y=piece.y+dy;
      if(!inBounds(x,y)) continue;
      if (piece.side==='RED' && y<5) continue;
      if (piece.side==='BLACK' && y>4) continue;
      if(pieceAt(piece.x+dx/2,piece.y+dy/2)) continue;
      pushIfEmptyOrEnemy(x,y);
    }
  } else if (type==='advisor') {
    const moves=[[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [dx,dy] of moves){
      const x=piece.x+dx,y=piece.y+dy;
      const inside=piece.side==='RED' ? (x>=3&&x<=5&&y>=7&&y<=9) : (x>=3&&x<=5&&y>=0&&y<=2);
      if(inside) pushIfEmptyOrEnemy(x,y);
    }
  } else if (type==='cannon') {
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      let x=piece.x+dx,y=piece.y+dy, jumped=false;
      while(inBounds(x,y)){
        const target=pieceAt(x,y);
        if(!jumped){
          if(!target) out.push({x,y});
          else jumped=true;
        } else {
          if(target){ if(target.side!==piece.side) out.push({x,y}); break; }
        }
        x+=dx;y+=dy;
      }
    }
  } else if (type==='pawn') {
    const dir=piece.side==='RED' ? -1 : 1;
    pushIfEmptyOrEnemy(piece.x,piece.y+dir);
    const crossed=piece.side==='RED' ? piece.y<=4 : piece.y>=5;
    if(crossed){
      pushIfEmptyOrEnemy(piece.x-1,piece.y);
      pushIfEmptyOrEnemy(piece.x+1,piece.y);
    }
  }

  return out;
}

function addLog(text) {
  const el=document.createElement('div'); el.className='log-entry'; el.textContent=text; logEl.prepend(el);
}

newGame();
