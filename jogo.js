// Tênis Duelo: tênis visto de cima, 2 jogadores no mesmo celular ou contra o robô.
// Medidas em metros (quadra oficial). A rede fica em y = 0.
// Jogador 0 joga embaixo (y > 0); jogador 1 joga em cima (y < 0).

// ---------- Medidas da quadra ----------
const BASE = 11.885;         // distância da rede até a linha de fundo
const SAQUE = 6.4;           // distância da rede até a linha de saque
const SIMPLES = 4.115;       // metade da largura da quadra de simples
const DUPLAS = 5.485;        // metade da largura da quadra de duplas
const MUNDO_X = 6.6;         // até onde o jogador pode andar para o lado
const FORA_X = 7.5, FORA_Y = 16; // bola passou daqui = ninguém pega mais

// ---------- Ajustes do jogo ----------
const GRAVIDADE = 12;
const ALCANCE = 1.55;        // distância para conseguir rebater
const JANELA = 0.34;         // tempo (s) que a raquetada fica "valendo"
const VEL_JOGADOR = 7.5;     // m/s
const SENSIBILIDADE = 1.6;   // quanto o jogador anda para cada cm de dedo

const NIVEIS = {
  facil:   { vel: 4.2, reacao: 0.32, erroMira: 1.3, chanceErro: 0.22, chanceAtaque: 0.08 },
  medio:   { vel: 5.6, reacao: 0.18, erroMira: 0.6, chanceErro: 0.09, chanceAtaque: 0.22 },
  dificil: { vel: 7.0, reacao: 0.08, erroMira: 0.2, chanceErro: 0.03, chanceAtaque: 0.4 }
};

const CORES = [
  { corpo: "#ff5a36", escuro: "#b73318", nome: "Jogador 1" },
  { corpo: "#2fb5ff", escuro: "#1675ad", nome: "Jogador 2" }
];

// ---------- Estado ----------
const canvas = document.getElementById("quadra");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, escala = 1, dpr = 1;

const opcoes = { modo: "robo", nivel: "medio", partida: 3 };
try {
  Object.assign(opcoes, JSON.parse(localStorage.getItem("tenis-opcoes")) || {});
} catch {}

let jogo = null;      // partida atual
let pausado = true;
let ultimoTempo = 0;

function novoJogador(i) {
  const lado = i === 0 ? 1 : -1;   // 1 = embaixo, -1 = em cima
  return {
    i, lado,
    x: 0, y: lado * (BASE + 0.8),
    alvoX: 0, alvoY: lado * (BASE + 0.8),
    vx: 0,
    golpe: -1,          // tempo desde o início da raquetada (-1 = parado)
    toques: 0,          // 1 = forehand, 2+ = ataque
    robo: false,
    // robô
    pensar: 0, erraEssa: false,
    horaBatida: -9, bateuSaque: false
  };
}

function novaPartida() {
  jogo = {
    jogadores: [novoJogador(0), novoJogador(1)],
    pontos: [0, 0],
    games: [0, 0],
    tiebreak: false,
    pontosTiebreak: 0,
    sacador: 0,
    primeiroSacadorTiebreak: 0,
    bola: null,
    estado: "saque",     // "saque" | "jogando" | "intervalo" | "fim"
    espera: 0,
    mensagem: "", mensagemTempo: 0,
    relogio: 0,
    rastro: []
  };
  jogo.jogadores[1].robo = opcoes.modo === "robo";
  prepararSaque();
}

// ---------- Tela ----------

function redimensionar() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  escala = Math.min(W / (MUNDO_X * 2 + 1.2), H / (FORA_Y * 2 - 1.5));
}
window.addEventListener("resize", redimensionar);
redimensionar();

const tx = (x) => W / 2 + x * escala;
const ty = (y) => H / 2 + y * escala;

// ---------- Saque e pontos ----------

function ladoDoSaque() {
  // Lado direito (iguais) quando a soma de pontos do game é par
  return (jogo.pontos[0] + jogo.pontos[1]) % 2 === 0 ? 1 : -1;
}

function prepararSaque() {
  const s = jogo.jogadores[jogo.sacador];
  const r = jogo.jogadores[1 - jogo.sacador];
  const lado = ladoDoSaque();
  s.x = s.alvoX = s.lado * lado * 1.6;
  s.y = s.alvoY = s.lado * (BASE + 0.4);
  r.x = r.alvoX = -s.x * 1.6;
  r.y = r.alvoY = r.lado * (BASE + 0.6);
  for (const j of jogo.jogadores) { j.golpe = -1; j.toques = 0; j.vx = 0; j.erraEssa = false; }
  jogo.bola = { x: s.x + 0.35 * s.lado, y: s.y, z: 1, vx: 0, vy: 0, vz: 0, quiques: 0, batedor: -1, presa: true, ataque: false };
  jogo.estado = "saque";
  jogo.espera = 0;
  jogo.rastro = [];
  if (s.robo) s.pensar = 0.9 + Math.random() * 0.7;
}

function nomeDe(i) {
  if (opcoes.modo === "robo") return i === 0 ? "Você" : "Robô";
  return CORES[i].nome;
}

function avisar(texto, tempo = 1.3) {
  jogo.mensagem = texto;
  jogo.mensagemTempo = tempo;
}

function ponto(vencedor) {
  if (jogo.estado !== "jogando" && jogo.estado !== "saque") return;
  const perdedor = 1 - vencedor;
  jogo.estado = "intervalo";
  jogo.espera = 1.4;
  som(220, 0.12, "triangle");

  if (jogo.tiebreak) {
    jogo.pontos[vencedor]++;
    jogo.pontosTiebreak++;
    if (jogo.pontos[vencedor] >= 7 && jogo.pontos[vencedor] - jogo.pontos[perdedor] >= 2) return game(vencedor);
    // No tiebreak o saque troca depois do 1º ponto e depois a cada 2
    if (jogo.pontosTiebreak % 2 === 1) jogo.sacador = 1 - jogo.sacador;
    avisar(`Ponto: ${nomeDe(vencedor)}`);
    return;
  }

  jogo.pontos[vencedor]++;
  const [a, b] = [jogo.pontos[vencedor], jogo.pontos[perdedor]];
  if (a >= 4 && a - b >= 2) return game(vencedor);
  if (a >= 3 && b >= 3) avisar(a === b ? "Iguais!" : `Vantagem: ${nomeDe(vencedor)}`);
  else avisar(`Ponto: ${nomeDe(vencedor)}`);
}

function game(vencedor) {
  const perdedor = 1 - vencedor;
  const eraTiebreak = jogo.tiebreak;
  jogo.games[vencedor]++;
  jogo.pontos = [0, 0];
  jogo.tiebreak = false;
  const n = opcoes.partida;
  const g = jogo.games;

  const venceu = n === 1
    ? g[vencedor] >= 1
    : eraTiebreak || (g[vencedor] >= n && g[vencedor] - g[perdedor] >= 2);
  if (venceu) return fimDePartida(vencedor);

  if (n > 1 && g[0] === n && g[1] === n) {
    jogo.tiebreak = true;
    jogo.pontosTiebreak = 0;
    avisar("Tiebreak!", 1.6);
  } else {
    avisar(`Game: ${nomeDe(vencedor)}`, 1.6);
  }
  jogo.sacador = 1 - jogo.sacador;
  jogo.espera = 1.8;
}

function fimDePartida(vencedor) {
  jogo.estado = "fim";
  som(660, 0.3, "square");
  setTimeout(() => {
    pausado = true;
    const titulo = opcoes.modo === "robo"
      ? (vencedor === 0 ? "🏆 Você venceu!" : "🤖 O robô venceu")
      : `🏆 ${CORES[vencedor].nome} venceu!`;
    document.getElementById("final-titulo").textContent = titulo;
    document.getElementById("final-placar").textContent =
      `Games: ${nomeDe(0)} ${jogo.games[0]} × ${jogo.games[1]} ${nomeDe(1)}`;
    mostrar("final");
  }, 900);
}

function textoPontos(i) {
  if (jogo.tiebreak) return String(jogo.pontos[i]);
  const [a, b] = [jogo.pontos[i], jogo.pontos[1 - i]];
  if (a >= 3 && b >= 3) return a === b ? "40" : a > b ? "VAN" : "40";
  return ["0", "15", "30", "40"][Math.min(a, 3)];
}

// ---------- Raquetadas ----------

function tocar(j) {
  if (pausado || !jogo || jogo.estado === "intervalo" || jogo.estado === "fim") return;
  const b = jogo.bola;
  // Segundo toque logo depois de bater = a bola vira ataque
  if (b && b.batedor === j.i && !b.ataque && b.quiques === 0 && jogo.relogio - j.horaBatida < 0.28) {
    j.toques = 2;
    rebater(j, j.bateuSaque);
    return;
  }
  if (j.golpe >= 0 && j.golpe < JANELA) {
    j.toques++;            // segundo toque rápido = ataque
  } else {
    j.golpe = 0;
    j.toques = 1;
    som(900, 0.03, "sine", 0.05);
  }
}

// Escolhe para onde a bola vai e lança ela
function rebater(j, saque) {
  const b = jogo.bola;
  const ataque = j.toques >= 2;
  const rival = -j.lado;
  let alvoX, alvoY, vel;

  if (saque) {
    const lado = j.lado * ladoDoSaque();
    // Saque cruzado, para dentro da área de saque do outro lado
    alvoX = -Math.sign(j.x || lado) * (0.9 + Math.random() * 2.6);
    alvoY = rival * (ataque ? 4.6 + Math.random() * 1.5 : 3.2 + Math.random() * 2.6);
    vel = ataque ? 25 : 17;
  } else {
    // Onde a bola bateu na raquete + o movimento do jogador definem a direção
    const desvio = Math.max(-1, Math.min(1, (b.x - j.x) / ALCANCE));
    const erro = j.robo ? NIVEIS[opcoes.nivel].erroMira : 0.9;
    const limite = ataque ? 3.8 : 3.4;
    alvoX = desvio * 2.2 * j.lado + j.vx * 0.32 + (Math.random() * 2 - 1) * erro;
    if (j.robo) alvoX = roboMira(j) + (Math.random() * 2 - 1) * erro;
    alvoX = Math.max(-limite, Math.min(limite, alvoX));
    alvoY = rival * (ataque ? 8.2 + Math.random() * 3 : 5.5 + Math.random() * 5);
    vel = (ataque ? 24 : 15.5) + Math.random() * 2;
  }

  const dx = alvoX - b.x, dy = alvoY - b.y;
  const dist = Math.hypot(dx, dy);
  const t = dist / vel;
  b.vx = (dx / dist) * vel;
  b.vy = (dy / dist) * vel;
  b.z = Math.max(b.z, 0.9);
  b.vz = (GRAVIDADE * t * t / 2 - b.z) / t;
  b.quiques = 0;
  b.batedor = j.i;
  b.presa = false;
  b.ataque = ataque;
  j.golpe = JANELA;        // a raquetada terminou
  j.horaBatida = jogo.relogio;
  j.bateuSaque = saque;
  jogo.estado = "jogando";
  jogo.rastro = [];
  som(ataque ? 520 : 380, 0.07, "square", 0.12);
  if (ataque) avisar(saque ? "Saque forte!" : "Ataque!", 0.6);
}

// O robô mira longe do adversário
function roboMira(j) {
  const rival = jogo.jogadores[1 - j.i];
  return rival.x > 0 ? -2.4 - Math.random() * 1.2 : 2.4 + Math.random() * 1.2;
}

// ---------- Robô ----------

function pensarRobo(j, dt) {
  const n = NIVEIS[opcoes.nivel];
  const b = jogo.bola;

  if (jogo.estado === "saque") {
    if (jogo.sacador === j.i && j.golpe < 0) {
      j.pensar -= dt;
      if (j.pensar <= 0) {
        tocar(j);
        if (Math.random() < n.chanceAtaque) j.toques = 2;
      }
    }
    return;
  }
  if (jogo.estado !== "jogando") return;

  j.pensar -= dt;
  const vindo = b.batedor !== j.i && Math.sign(b.vy) === j.lado;
  if (j.pensar <= 0) {
    j.pensar = n.reacao;
    if (vindo) {
      // Onde a bola vai cruzar a linha do robô (a bola anda em linha reta vista de cima)
      const fundo = j.lado * (BASE - 0.5);
      const linha = Math.abs(b.y - j.y) < 1 ? j.y : fundo;
      const tempo = (linha - b.y) / b.vy;
      let x = b.x + b.vx * Math.max(0, tempo);
      x += (Math.random() * 2 - 1) * n.erroMira * 0.5;
      j.alvoX = Math.max(-MUNDO_X, Math.min(MUNDO_X, x));
      j.alvoY = fundo + j.lado * 0.6;
    } else {
      j.alvoX *= 0.6;
      j.alvoY = j.lado * (BASE + 0.4);
    }
  }

  // Raquetada quando a bola estiver chegando perto
  if (vindo && j.golpe < 0 && !j.erraEssa) {
    const dist = Math.hypot(b.x - j.x, b.y - j.y);
    const velBola = Math.hypot(b.vx, b.vy);
    if (dist < ALCANCE + velBola * 0.07 && b.z < 2.6) {
      if (Math.random() < n.chanceErro) {
        j.erraEssa = true;   // o robô "dorme" nessa bola
      } else {
        tocar(j);
        if (Math.random() < n.chanceAtaque) j.toques = 2;
      }
    }
  }
}

// ---------- Atualização ----------

function atualizar(dt) {
  jogo.relogio += dt;
  if (jogo.mensagemTempo > 0) jogo.mensagemTempo -= dt;

  if (jogo.estado === "intervalo") {
    jogo.espera -= dt;
    if (jogo.espera <= 0) prepararSaque();
  }

  for (const j of jogo.jogadores) {
    if (j.robo) pensarRobo(j, dt);
    moverJogador(j, dt);
    if (j.golpe >= 0) {
      j.golpe += dt;
      if (j.golpe > JANELA + 0.15) { j.golpe = -1; j.toques = 0; }
    }
  }

  const b = jogo.bola;
  const s = jogo.jogadores[jogo.sacador];

  if (jogo.estado === "saque") {
    // Bola na mão do sacador, subindo e descendo
    b.x = s.x + 0.35 * s.lado;
    b.y = s.y - 0.2 * s.lado;
    b.z = 1.2 + Math.abs(Math.sin(performance.now() / 380)) * 1.3;
    if (s.golpe >= 0.1) rebater(s, true);
    return;
  }

  if (jogo.estado !== "jogando" && jogo.estado !== "intervalo") return;
  if (b.presa) return;

  // Movimento da bola
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.vz -= GRAVIDADE * dt;
  b.z += b.vz * dt;

  if (b.ataque) {
    jogo.rastro.push({ x: b.x, y: b.y, z: b.z });
    if (jogo.rastro.length > 10) jogo.rastro.shift();
  }

  if (b.z <= 0) {
    b.z = 0;
    b.vz = -b.vz * 0.62;
    b.vx *= 0.8;
    b.vy *= 0.8;
    b.quiques++;
    som(160, 0.04, "sine", 0.08);
    if (b.quiques >= 2 && jogo.estado === "jogando") ponto(b.batedor);
  }

  if (jogo.estado === "jogando" && (Math.abs(b.x) > FORA_X || Math.abs(b.y) > FORA_Y)) {
    ponto(b.batedor);
  }

  // Alguém rebate?
  if (jogo.estado === "jogando") {
    for (const j of jogo.jogadores) {
      if (b.batedor === j.i) continue;
      if (Math.sign(b.y) !== j.lado) continue;
      if (j.golpe < 0 || j.golpe > JANELA) continue;
      if (b.z > 2.6) continue;
      if (Math.hypot(b.x - j.x, b.y - j.y) <= ALCANCE) rebater(j, false);
    }
  }
}

function moverJogador(j, dt) {
  const vel = j.robo ? NIVEIS[opcoes.nivel].vel : VEL_JOGADOR;
  // Cada um fica na sua metade
  const minY = j.lado > 0 ? 1.2 : -FORA_Y + 1.5;
  const maxY = j.lado > 0 ? FORA_Y - 1.5 : -1.2;
  j.alvoX = Math.max(-MUNDO_X, Math.min(MUNDO_X, j.alvoX));
  j.alvoY = Math.max(minY, Math.min(maxY, j.alvoY));
  if (jogo.estado === "saque" && jogo.sacador === j.i) {
    j.alvoY = j.y; // sacador fica atrás da linha
  }
  const dx = j.alvoX - j.x, dy = j.alvoY - j.y;
  const d = Math.hypot(dx, dy);
  const passo = Math.min(d, vel * dt);
  const antesX = j.x;
  if (d > 0.001) {
    j.x += (dx / d) * passo;
    j.y += (dy / d) * passo;
  }
  j.vx = (j.x - antesX) / Math.max(dt, 0.001);
}

// ---------- Desenho ----------

function desenhar() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#2a8a55";
  ctx.fillRect(0, 0, W, H);

  // Faixas de grama
  ctx.fillStyle = "#2f9660";
  for (let y = -FORA_Y; y < FORA_Y; y += 2) ctx.fillRect(0, ty(y), W, escala);

  // Piso da quadra
  ctx.fillStyle = "#3b6fc4";
  ctx.fillRect(tx(-DUPLAS - 1), ty(-BASE - 2), (DUPLAS + 1) * 2 * escala, (BASE + 2) * 2 * escala);
  ctx.fillStyle = "#2f5fae";
  ctx.fillRect(tx(-DUPLAS), ty(-BASE), DUPLAS * 2 * escala, BASE * 2 * escala);

  // Linhas
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = Math.max(1.5, escala * 0.07);
  ctx.strokeRect(tx(-DUPLAS), ty(-BASE), DUPLAS * 2 * escala, BASE * 2 * escala);
  linha(-SIMPLES, -BASE, -SIMPLES, BASE);
  linha(SIMPLES, -BASE, SIMPLES, BASE);
  linha(-SIMPLES, -SAQUE, SIMPLES, -SAQUE);
  linha(-SIMPLES, SAQUE, SIMPLES, SAQUE);
  linha(0, -SAQUE, 0, SAQUE);
  linha(0, -BASE, 0, -BASE + 0.3);
  linha(0, BASE, 0, BASE - 0.3);

  // Jogador de cima é desenhado antes da rede, o de baixo depois
  const [baixo, cima] = jogo.jogadores;
  desenharJogador(cima);
  desenharRede();
  desenharBola();
  desenharJogador(baixo);
  desenharPlacar();
  desenharDicas();

  if (jogo.mensagemTempo > 0) {
    const alpha = Math.min(1, jogo.mensagemTempo * 3);
    texto(jogo.mensagem, W / 2, H / 2 - escala * 2.2, 22, alpha, opcoes.modo === "dois");
  }
}

function linha(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(tx(x1), ty(y1));
  ctx.lineTo(tx(x2), ty(y2));
  ctx.stroke();
}

function desenharRede() {
  const y = ty(0);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(tx(-DUPLAS - 0.9), y + 2, (DUPLAS + 0.9) * 2 * escala, escala * 0.35);
  ctx.strokeStyle = "#20262c";
  ctx.lineWidth = escala * 0.22;
  linha(-DUPLAS - 0.9, 0, DUPLAS + 0.9, 0);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = escala * 0.09;
  linha(-DUPLAS - 0.9, 0, DUPLAS + 0.9, 0);
  ctx.fillStyle = "#20262c";
  for (const x of [-DUPLAS - 0.9, DUPLAS + 0.9]) {
    ctx.beginPath();
    ctx.arc(tx(x), y, escala * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

function desenharJogador(j) {
  const x = tx(j.x), y = ty(j.y);
  const r = escala * 0.55;
  const cor = CORES[j.i];

  // sombra
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.6, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // raquete: gira durante a raquetada
  const progresso = j.golpe >= 0 ? Math.min(1, j.golpe / 0.22) : 0;
  const base = j.lado > 0 ? -Math.PI / 2 : Math.PI / 2;     // virado para a rede
  const ang = base + (0.9 - progresso * 1.8) * j.lado;
  const mao = { x: x + Math.cos(base + j.lado * 1.2) * r, y: y + Math.sin(base + j.lado * 1.2) * r };
  const ponta = { x: mao.x + Math.cos(ang) * r * 1.5, y: mao.y + Math.sin(ang) * r * 1.5 };
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(mao.x, mao.y);
  ctx.lineTo(ponta.x, ponta.y);
  ctx.stroke();
  ctx.fillStyle = j.toques >= 2 && j.golpe >= 0 ? "#ffe14a" : "#f4f4f4";
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.ellipse(ponta.x + Math.cos(ang) * r * 0.45, ponta.y + Math.sin(ang) * r * 0.45, r * 0.55, r * 0.38, ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // corpo e cabeça
  ctx.fillStyle = cor.escuro;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.05, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cor.corpo;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.1, r * 0.95, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c79a";
  ctx.beginPath();
  ctx.arc(x, y - r * 0.15, r * 0.48, 0, Math.PI * 2);
  ctx.fill();
  // boné
  ctx.fillStyle = cor.escuro;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.15, r * 0.48, j.lado > 0 ? Math.PI : 0, j.lado > 0 ? Math.PI * 2 : Math.PI);
  ctx.fill();

  // alcance (ajuda a saber quando bater)
  if (!j.robo) {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, ALCANCE * escala, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function desenharBola() {
  const b = jogo.bola;
  if (!b) return;
  const r = escala * 0.2 * (1 + b.z * 0.08);

  for (const [k, p] of jogo.rastro.entries()) {
    ctx.fillStyle = `rgba(255,230,80,${(k / jogo.rastro.length) * 0.5})`;
    ctx.beginPath();
    ctx.arc(tx(p.x), ty(p.y) - p.z * escala * 0.55, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(tx(b.x), ty(b.y), r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e3f53b";
  ctx.strokeStyle = "#9fb11d";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(tx(b.x), ty(b.y) - b.z * escala * 0.55, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function texto(t, x, y, tamanho, alpha = 1, girarCopia = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `800 ${tamanho}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(t, x, y);
  ctx.fillText(t, x, y);
  if (girarCopia) {
    // No modo 2 jogadores, o jogador de cima lê a mensagem de cabeça para baixo
    ctx.translate(x, H - y);
    ctx.rotate(Math.PI);
    ctx.strokeText(t, 0, 0);
    ctx.fillText(t, 0, 0);
  }
  ctx.restore();
}

// Placar de cada jogador perto da própria linha de fundo
function desenharPlacar() {
  for (const j of jogo.jogadores) {
    const girar = opcoes.modo === "dois" && j.i === 1;
    const y = j.i === 0 ? H - 34 : 34;
    ctx.save();
    ctx.translate(16, y);
    if (girar) { ctx.translate(W - 32, 0); ctx.rotate(Math.PI); }
    const caixaW = 150, caixaH = 46;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    redondo(0, -caixaH / 2, caixaW, caixaH, 12);
    ctx.fill();
    ctx.fillStyle = CORES[j.i].corpo;
    ctx.beginPath();
    ctx.arc(16, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText(nomeDe(j.i), 30, -9);
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`Games ${jogo.games[j.i]}${jogo.sacador === j.i ? "  🎾" : ""}`, 30, 10);
    ctx.textAlign = "right";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.fillStyle = "#e3f53b";
    ctx.fillText(textoPontos(j.i), caixaW - 12, 1);
    ctx.restore();
  }
  if (jogo.tiebreak) texto("TIEBREAK", W / 2, ty(0) - escala * 0.9, 12, 0.85);
}

function redondo(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenharDicas() {
  if (jogo.estado !== "saque") return;
  const s = jogo.jogadores[jogo.sacador];
  if (s.robo) return;
  const y = s.i === 0 ? H * 0.78 : H * 0.22;
  ctx.save();
  if (s.i === 1 && opcoes.modo === "dois") {
    ctx.translate(W / 2, y);
    ctx.rotate(Math.PI);
    ctx.translate(-W / 2, -y);
  }
  texto("Toque para sacar · 2 toques = saque forte", W / 2, y, 14, 0.9);
  ctx.restore();
}

// ---------- Controles por toque ----------
// Cada dedo pertence à metade da tela onde encostou.
// Encostar = raquetada (2 toques rápidos = ataque). Arrastar = andar.

const dedos = new Map();

function donoDoToque(y) {
  if (opcoes.modo === "robo") return jogo.jogadores[0];
  return y > H / 2 ? jogo.jogadores[0] : jogo.jogadores[1];
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!jogo || pausado) return;
  for (const t of e.changedTouches) {
    const jogador = donoDoToque(t.clientY);
    dedos.set(t.identifier, { jogador, x: t.clientX, y: t.clientY });
    // A raquetada sai no instante do toque (sem esperar soltar o dedo)
    if (!jogador.robo) tocar(jogador);
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const d = dedos.get(t.identifier);
    if (!d) continue;
    const dx = t.clientX - d.x, dy = t.clientY - d.y;
    d.x = t.clientX;
    d.y = t.clientY;
    const j = d.jogador;
    if (j.robo) continue;
    // O jogador de cima vê a tela de cabeça para baixo
    const sentido = opcoes.modo === "dois" && j.i === 1 ? -1 : 1;
    j.alvoX += (dx / escala) * SENSIBILIDADE * sentido;
    j.alvoY += (dy / escala) * SENSIBILIDADE * sentido;
  }
}, { passive: false });

function fimDoToque(e) {
  e.preventDefault();
  for (const t of e.changedTouches) dedos.delete(t.identifier);
}
canvas.addEventListener("touchend", fimDoToque, { passive: false });
canvas.addEventListener("touchcancel", fimDoToque, { passive: false });

// Teclado (para testar no computador): Jogador 1 = A/D/W/S + Espaço · Jogador 2 = setas + Enter
const teclas = new Set();
window.addEventListener("keydown", (e) => {
  if (!jogo || pausado) return;
  if (e.repeat) return;
  teclas.add(e.code);
  if (e.code === "Space") { e.preventDefault(); tocar(jogo.jogadores[0]); }
  if (e.code === "Enter" && opcoes.modo === "dois") tocar(jogo.jogadores[1]);
});
window.addEventListener("keyup", (e) => teclas.delete(e.code));

function tecladoMove(dt) {
  const mover = (j, esq, dir, cima, baixo) => {
    const p = VEL_JOGADOR * dt * 1.2;
    if (teclas.has(esq)) j.alvoX = j.x - p * 3;
    else if (teclas.has(dir)) j.alvoX = j.x + p * 3;
    if (teclas.has(cima)) j.alvoY = j.y - p * 3;
    else if (teclas.has(baixo)) j.alvoY = j.y + p * 3;
  };
  mover(jogo.jogadores[0], "KeyA", "KeyD", "KeyW", "KeyS");
  if (opcoes.modo === "dois") mover(jogo.jogadores[1], "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown");
}

// ---------- Som ----------

let audio = null;
function som(freq, duracao, tipo = "sine", volume = 0.1) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = tipo;
    o.frequency.value = freq;
    g.gain.setValueAtTime(volume, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duracao);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + duracao);
  } catch {}
}

// ---------- Laço principal ----------

function quadro(agora) {
  const dt = Math.min(0.033, (agora - ultimoTempo) / 1000 || 0);
  ultimoTempo = agora;
  if (jogo) {
    if (!pausado) {
      tecladoMove(dt);
      atualizar(dt);
    }
    desenhar();
  }
  requestAnimationFrame(quadro);
}

// ---------- Menus ----------

const telas = ["menu", "pausa", "final"];
function mostrar(qual) {
  for (const t of telas) document.getElementById(t).hidden = t !== qual;
  document.getElementById("pausar").hidden = qual !== null;
}

function grupo(id, chave) {
  const el = document.getElementById(id);
  const marcar = () => {
    for (const b of el.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(String(opcoes[chave]) === b.dataset.valor));
    }
    document.getElementById("bloco-nivel").hidden = opcoes.modo !== "robo";
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    opcoes[chave] = chave === "partida" ? Number(b.dataset.valor) : b.dataset.valor;
    try { localStorage.setItem("tenis-opcoes", JSON.stringify(opcoes)); } catch {}
    marcar();
  });
  marcar();
}
grupo("op-modo", "modo");
grupo("op-nivel", "nivel");
grupo("op-partida", "partida");

function comecar() {
  som(440, 0.01, "sine", 0.001); // libera o som no iPhone
  novaPartida();
  pausado = false;
  mostrar(null);
}

document.getElementById("jogar").addEventListener("click", comecar);
document.getElementById("revanche").addEventListener("click", comecar);
document.getElementById("pausar").addEventListener("click", () => { pausado = true; mostrar("pausa"); });
document.getElementById("continuar").addEventListener("click", () => { pausado = false; mostrar(null); });
document.getElementById("sair").addEventListener("click", () => mostrar("menu"));
document.getElementById("voltar").addEventListener("click", () => mostrar("menu"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && jogo && !pausado && jogo.estado !== "fim") { pausado = true; mostrar("pausa"); }
});

// Quadra de fundo atrás do menu
novaPartida();
requestAnimationFrame(quadro);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
