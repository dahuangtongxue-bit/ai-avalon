'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Crown, Shield, Swords, Eye, Sparkles, Play, Pause, RotateCw, ChevronRight } from 'lucide-react';

// 与狼人杀/海龟汤同后端契约:调用 /api/avalon
const API_PATH = '/api/avalon';

// 槽位号(PLAYER_N) → 显示名,写死前端(避免中文环境变量乱码),与后端 PLAYER_1~6 对应
const SLOT_NAMES = { 1: '智谱', 2: 'DeepSeek', 3: '千问', 4: 'Kimi', 5: '豆包', 6: 'MiniMax' };
const slotName = (i) => SLOT_NAMES[i] || ('模型' + i);

// 人设/配色(按显示名匹配)
const ROSTER_STYLE = {
  '智谱':     { color: '#62b87f', persona: '稳健派' },
  'DeepSeek': { color: '#5b8cff', persona: '逻辑流' },
  '千问':     { color: '#8a6cff', persona: '细节控' },
  'Kimi':     { color: '#37c2c2', persona: '脑洞流' },
  '豆包':     { color: '#ef9a4a', persona: '急先锋' },
  'MiniMax':  { color: '#e0607a', persona: '老六' },
};
const PALETTE = ['#5b8cff', '#62b87f', '#8a6cff', '#37c2c2', '#ef9a4a', '#e0607a'];
const PERSONAS = ['逻辑流', '稳健派', '细节控', '脑洞流', '急先锋', '老六'];
const styleFor = (name, i) => ROSTER_STYLE[name] || { color: PALETTE[i % 6], persona: PERSONAS[i % 6] };

// 国籍(将来接入海外模型做"中外对抗",赛季积分会自动按阵营汇总;现在全是国产则不显示该汇总)
const NATION = { '智谱': '国产', 'DeepSeek': '国产', '千问': '国产', 'Kimi': '国产', '豆包': '国产', 'MiniMax': '国产' };
const nationFor = (name) => { for (const k in NATION) if (name && name.includes(k)) return NATION[k]; if (/GPT|Claude|Gemini|Grok|Llama|o\d/i.test(name)) return '海外'; return '国产'; };

// 6 人局:4 正 / 2 反
const ROLE_DEF = {
  merlin:   { label: '梅林',       align: 'good', icon: 'eye' },
  percival: { label: '派西维尔',   align: 'good', icon: 'shield' },
  servant:  { label: '亚瑟的忠臣', align: 'good', icon: 'shield' },
  morgana:  { label: '莫甘娜',     align: 'evil', icon: 'swords' },
  assassin: { label: '刺客',       align: 'evil', icon: 'swords' },
};
const SETUP_6 = ['merlin', 'percival', 'servant', 'servant', 'morgana', 'assassin'];
// 每个任务:上场人数 / 需要几张失败票才算失败(6 人局均为 1)
const QUESTS = [
  { size: 2, fails: 1 }, { size: 3, fails: 1 }, { size: 4, fails: 1 }, { size: 3, fails: 1 }, { size: 4, fails: 1 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

// ---------- 调用后端(沿用狼人杀契约;阿瓦隆每步输出 JSON,allowLong 一律 true)----------
async function callModel(playerIndex, system, user, maxTokens, password) {
  const resp = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerIndex, system, user, maxTokens, password, allowLong: true }),
  });
  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('模型 ' + playerIndex + ' 返回异常(HTTP ' + resp.status + '):' + (raw.replace(/\s+/g, ' ').slice(0, 100) || '空')); }
  if (!resp.ok || data.error) throw new Error((data.error && data.error.message) || ('模型 ' + playerIndex + ' 调用失败'));
  return data.text || '';
}
function extractJSON(text) {
  if (!text) return null;
  const t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const tryParse = (s, e) => { if (s === -1 || e === -1 || e < s) return null; try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } };
  return tryParse(t.indexOf('{'), t.lastIndexOf('}')) || tryParse(t.lastIndexOf('{'), t.lastIndexOf('}'));
}
const matchName = (raw, names) => {
  if (!raw) return null;
  const r = String(raw).trim();
  return names.find((n) => n === r) || names.find((n) => r.includes(n) || n.includes(r)) || null;
};

// ---------- 身份知识 ----------
function buildKnowledge(players) {
  const nameOf = (p) => p.name;
  const evil = players.filter((p) => p.align === 'evil');
  const merlin = players.find((p) => p.role === 'merlin');
  const morgana = players.find((p) => p.role === 'morgana');
  players.forEach((p) => {
    if (p.role === 'merlin') {
      p.knowledge = `你能看到反方(莫德雷德的爪牙)是:${evil.map(nameOf).join('、')}(但不知道谁是刺客)。切记:绝不能让人看出你是梅林——否则游戏最后刺客会刺杀你,正方功亏一篑。`;
    } else if (p.role === 'percival') {
      const pair = shuffle([merlin, morgana].filter(Boolean).map(nameOf));
      p.knowledge = `你看到 ${pair.join(' 和 ')} 之中,一个是【梅林】、一个是【莫甘娜】(伪装成梅林迷惑你),但你分不清谁是谁。保护真梅林、识破莫甘娜。`;
    } else if (p.align === 'evil') {
      const mates = evil.filter((x) => x !== p).map(nameOf);
      p.knowledge = `你的反方同伙是:${mates.join('、') || '(无)'}。你们的目标是让任务失败 3 次,或撑到最后由刺客刺中梅林翻盘。平时要伪装成正方。`;
    } else {
      p.knowledge = '你不知道任何人的真实身份,只能靠发言和投票推理出谁可信,完成 3 次任务。';
    }
  });
}
const goalLine = (p) => p.align === 'good'
  ? '让 5 个任务里有 3 个成功(并保护梅林不被刺杀)。'
  : '让 3 个任务失败,或撑到正方完成 3 次后由刺客刺中梅林翻盘。';

// ---------- 公共局势文本 ----------
function publicState(g, players) {
  const board = QUESTS.map((q, i) => {
    const r = g.results[i];
    return `任务${i + 1}(${q.size}人)${r === 'success' ? '✅成功' : r === 'fail' ? '❌失败' : i === g.questIdx ? '←当前' : '·待进行'}`;
  }).join(' / ');
  const lines = [
    `比分:正方 ${g.success} : ${g.fail} 反方(任一方先到 3 即获胜)`,
    `进度:${board}`,
    `本轮队长:${players[g.leaderIdx].name};当前任务需 ${QUESTS[g.questIdx].size} 人上场`,
    g.rejectCount > 0 ? `本轮队伍已被连续否决 ${g.rejectCount} 次(累计 5 次反方直接获胜)` : '',
    g.log.length ? `近况:\n${g.log.slice(-8).join('\n')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
const RULES_BRIEF = '《阿瓦隆》规则:正方(亚瑟忠臣)要让任务成功 3 次;反方(莫德雷德爪牙)潜伏其中,想让任务失败 3 次、或撑到最后由刺客刺中梅林翻盘。每轮队长提名若干人上场,全员公开投票同意/反对该队伍;通过则上场者秘密出"成功"或"失败"——正方只能出成功,反方可出失败,出现 1 张失败票该任务即失败。';

function roleHeader(p) {
  return `你的身份:【${ROLE_DEF[p.role].label}】(${p.align === 'good' ? '正方' : '反方'})。${p.knowledge}\n你的目标:${goalLine(p)}`;
}

// ---------- Prompt ----------
function proposePrompt(player, g, players) {
  const names = players.map((p) => p.name);
  const system = `${RULES_BRIEF}\n\n${roleHeader(player)}\n\n现在你是队长,要提名 ${QUESTS[g.questIdx].size} 人(可含你自己)去执行第 ${g.questIdx + 1} 个任务。名单只能从这些人里选:${names.join('、')}。\n只输出 JSON,不要任何额外文字:\n{ "thought":"你的盘算,一句话≤30字", "team":["名字"${QUESTS[g.questIdx].size > 1 ? ',"名字"' : ''}], "speech":"一句话向大家解释这个提名/拉票,≤40字" }`;
  return { system, user: `当前局势:\n${publicState(g, players)}` };
}
function votePrompt(player, g, players, team) {
  const system = `${RULES_BRIEF}\n\n${roleHeader(player)}\n\n现在对队长「${players[g.leaderIdx].name}」提名的队伍投票。想清楚:这支队伍里会不会藏着反方?让它上场对你这方有利吗?\n只输出 JSON:\n{ "thought":"你的判断,≤30字", "vote":"同意" 或 "反对", "reason":"一句话公开理由,≤30字" }`;
  return { system, user: `局势:\n${publicState(g, players)}\n\n本轮提名队伍:${team.join('、')}` };
}
function questPrompt(player, g, players, team) {
  const system = `${RULES_BRIEF}\n\n${roleHeader(player)}\n\n你作为反方,正在执行第 ${g.questIdx + 1} 个任务。你可以出"成功"(继续伪装)或"失败"(破坏任务)。破坏能把比分推向反方,但这支小队里出了失败票,大家就知道队里有反方——权衡暴露风险与时机。\n只输出 JSON:\n{ "thought":"你的盘算,≤30字", "action":"成功" 或 "失败" }`;
  return { system, user: `局势:\n${publicState(g, players)}\n\n本轮上场:${team.join('、')}` };
}
function assassinPrompt(player, g, players, log) {
  const candidates = players.filter((p) => p.align === 'good').map((p) => p.name);
  const system = `你是【刺客】(反方)。正方已经完成了 3 次任务——但你还有最后一击:若能指认出谁是【梅林】,反方直接逆转获胜!回顾整局,谁总在关键节点像是看透了全局、暗中把正方往对的方向带?\n候选只能从正方阵营里选(不含你的同伙):${candidates.join('、')}。\n只输出 JSON:\n{ "thought":"你的推理,≤40字", "target":"你要刺杀的名字", "speech":"一句话宣告,≤30字" }`;
  return { system, user: `整局回顾:\n${publicState(g, players)}\n\n完整经过:\n${log.join('\n')}` };
}
function commentaryPrompt(g, players, outcomeText, log) {
  const roles = players.map((p) => `${p.name}=${ROLE_DEF[p.role].label}(${p.align === 'good' ? '正' : '反'})`).join('、');
  const system = '你是《阿瓦隆》对局的解说。用一段话(≤120字)犀利点评这一局:谁打得好、谁过早暴露、关键转折在哪、最后刺杀那一下精不精彩。只输出这段解说文本,不要任何额外内容。';
  return { system, user: `本局经过:\n${log.join('\n')}\n\n结果:${outcomeText}\n各人真实身份:${roles}` };
}

// ---------- 归一化 ----------
function normTeam(j, names, size, leaderName) {
  let team = [];
  if (j && Array.isArray(j.team)) {
    for (const raw of j.team) { const m = matchName(raw, names); if (m && !team.includes(m)) team.push(m); }
  }
  // 不足则补(队长优先,再补其他)
  if (team.length < size) {
    if (!team.includes(leaderName)) team.unshift(leaderName);
    for (const n of names) { if (team.length >= size) break; if (!team.includes(n)) team.push(n); }
  }
  team = team.slice(0, size);
  return { thought: ((j && j.thought) || '').toString().slice(0, 40), team, speech: ((j && j.speech) || '').toString().slice(0, 50) };
}
function normVote(j) {
  let v = '同意';
  const raw = ((j && j.vote) || '').toString();
  if (/反对|否决|拒绝|no|reject|×|✗/i.test(raw)) v = '反对';
  else if (/同意|赞成|通过|支持|yes|approve|√|✓/i.test(raw)) v = '同意';
  return { thought: ((j && j.thought) || '').toString().slice(0, 40), vote: v, reason: ((j && j.reason) || '').toString().slice(0, 36) };
}
function normQuest(j) {
  const raw = ((j && j.action) || '').toString();
  const action = /失败|破坏|fail|sabotage/i.test(raw) ? '失败' : '成功';
  return { thought: ((j && j.thought) || '').toString().slice(0, 40), action };
}
function normAssassin(j, candidates) {
  const target = matchName(j && j.target, candidates) || candidates[0];
  return { thought: ((j && j.thought) || '').toString().slice(0, 50), target, speech: ((j && j.speech) || '').toString().slice(0, 36) };
}

// ---------- 赛季积分(localStorage)----------
const SEASON_KEY = 'avalon_season_v1';
function loadSeason() { try { return JSON.parse(localStorage.getItem(SEASON_KEY) || '{}'); } catch { return {}; } }
function saveSeason(s) { try { localStorage.setItem(SEASON_KEY, JSON.stringify(s)); } catch {} }
function applySeason(prev, players, winSide) {
  const s = { ...prev };
  players.forEach((p) => {
    const cur = s[p.name] || { games: 0, wins: 0, goodGames: 0, goodWins: 0, evilGames: 0, evilWins: 0 };
    const won = p.align === winSide;
    cur.games++; if (won) cur.wins++;
    if (p.align === 'good') { cur.goodGames++; if (won) cur.goodWins++; }
    else { cur.evilGames++; if (won) cur.evilWins++; }
    s[p.name] = cur;
  });
  return s;
}

// ============================================================
export default function Avalon() {
  const [models, setModels] = useState([]);
  const [password, setPassword] = useState('');
  const [pwRequired, setPwRequired] = useState(false);
  const [stage, setStage] = useState('setup');         // setup | playing | ended
  const [speed, setSpeed] = useState(2600);
  const [manual, setManual] = useState(false);
  const [paused, setPaused] = useState(false);

  const [players, setPlayers] = useState([]);           // 本局玩家(含身份,reveal 时才展示)
  const [feed, setFeed] = useState([]);
  const [results, setResults] = useState([null, null, null, null, null]);
  const [score, setScore] = useState({ success: 0, fail: 0 });
  const [questIdx, setQuestIdx] = useState(0);
  const [leaderIdx, setLeaderIdx] = useState(0);
  const [activeIdx, setActiveIdx] = useState(null);
  const [status, setStatus] = useState('');
  const [winner, setWinner] = useState(null);           // {side,'why'}
  const [commentary, setCommentary] = useState('');
  const [season, setSeason] = useState({});
  const [setupErr, setSetupErr] = useState('');

  const abortRef = useRef(false);
  const pausedRef = useRef(false);
  const pauseResolvers = useRef([]);
  const stepResolveRef = useRef(null);
  const speedRef = useRef(2600);
  const logEndRef = useRef(null);
  const manualRef = useRef(false);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [feed, status]);
  useEffect(() => { setSeason(loadSeason()); }, []);
  useEffect(() => {
    fetch(API_PATH).then((r) => r.json()).then((d) => {
      if (!d.players) return;
      const ms = d.players.filter((p) => p.configured).map((p, i) => {
        const st = styleFor(slotName(p.index), i);
        return { index: p.index, name: slotName(p.index), color: st.color, persona: st.persona };
      });
      setModels(ms);
    }).catch(() => {});
    // 是否需要密码:GET 不返回该字段,这里用一次轻探测——直接显示可选输入即可
  }, []);

  const push = (item) => setFeed((f) => [...f, item]);
  const waitIfPaused = () => (pausedRef.current ? new Promise((r) => pauseResolvers.current.push(r)) : Promise.resolve());
  const waitForStep = () => new Promise((r) => { stepResolveRef.current = r; });
  const pacing = async () => { if (!manualRef.current) await sleep(speedRef.current); };
  const gate = async () => { if (abortRef.current) return false; await waitIfPaused(); if (manualRef.current) await waitForStep(); return !abortRef.current; };

  // ---------- 开局 ----------
  function startGame() {
    setSetupErr('');
    if (models.length < 6) { setSetupErr(`阿瓦隆固定 6 人一局,当前可用模型 ${models.length} 个,请在 Netlify 配齐 PLAYER_1~6。`); return; }
    const six = models.slice(0, 6);
    const roles = shuffle(SETUP_6);
    const ps = six.map((m, i) => ({ ...m, role: roles[i], align: ROLE_DEF[roles[i]].align }));
    buildKnowledge(ps);

    abortRef.current = false; pausedRef.current = false; manualRef.current = manual; setPaused(false);
    setPlayers(ps);
    setFeed([]); setResults([null, null, null, null, null]); setScore({ success: 0, fail: 0 });
    setQuestIdx(0); setLeaderIdx(0); setActiveIdx(null); setWinner(null); setCommentary(''); setStatus('');
    setStage('playing');
    runGame(ps);
  }

  // ---------- 主循环 ----------
  async function runGame(ps) {
    const names = ps.map((p) => p.name);
    const g = { results: [null, null, null, null, null], success: 0, fail: 0, questIdx: 0, leaderIdx: 0, rejectCount: 0, log: [] };
    const sync = () => { setResults([...g.results]); setScore({ success: g.success, fail: g.fail }); setQuestIdx(g.questIdx); setLeaderIdx(g.leaderIdx); };

    while (g.success < 3 && g.fail < 3 && !abortRef.current) {
      const quest = QUESTS[g.questIdx];
      g.rejectCount = 0;
      let approved = false, team = null;

      // —— 提名 + 投票,直到通过或连续 5 次否决 ——
      while (!approved && !abortRef.current) {
        if (!(await gate())) return;
        const leader = ps[g.leaderIdx];
        push({ kind: 'round', text: `任务 ${g.questIdx + 1} · 提名 — 队长:${leader.name}` });
        sync();

        // 队长提名
        setActiveIdx(leader.index); setStatus(`${leader.name} 正在提名…`);
        let prop;
        try {
          const p = proposePrompt(leader, g, ps);
          prop = normTeam(extractJSON(await callModel(leader.index, p.system, p.user, 320, password)), names, quest.size, leader.name);
        } catch (e) { prop = { thought: '', team: [leader.name, ...names.filter((n) => n !== leader.name)].slice(0, quest.size), speech: '(提名出错,默认组队)' }; }
        setActiveIdx(null);
        push({ kind: 'proposal', model: leader, thought: prop.thought, team: prop.team, speech: prop.speech });
        await pacing();

        // 全员同时投票(阿瓦隆本就是同时亮票 → 并行)
        if (!(await gate())) return;
        setStatus('全场投票中…');
        const team2 = prop.team;
        let votes;
        try {
          votes = await Promise.all(ps.map(async (voter) => {
            try {
              const p = votePrompt(voter, g, ps, team2);
              return { voter, ...normVote(extractJSON(await callModel(voter.index, p.system, p.user, 220, password))) };
            } catch { return { voter, thought: '', vote: '同意', reason: '(弃权,默认同意)' }; }
          }));
        } catch { votes = ps.map((voter) => ({ voter, vote: '同意', reason: '' })); }
        setStatus('');

        const yes = votes.filter((v) => v.vote === '同意').length;
        const pass = yes > ps.length / 2;
        push({
          kind: 'votes',
          rows: votes.map((v) => ({ name: v.voter.name, color: v.voter.color, vote: v.vote, reason: v.reason })),
          tally: `同意 ${yes} · 反对 ${ps.length - yes} → ${pass ? '队伍通过 ✅' : '被否决 ❌'}`,
          pass,
        });
        g.log.push(`[任务${g.questIdx + 1}] ${leader.name} 提名 ${team2.join('、')};投票 同意${yes}反对${ps.length - yes} → ${pass ? '通过' : '否决'}`);
        await pacing();

        if (pass) { approved = true; team = team2; }
        else {
          g.rejectCount++;
          g.leaderIdx = (g.leaderIdx + 1) % ps.length;
          sync();
          if (g.rejectCount >= 5) {
            push({ kind: 'reject', text: `连续 5 次组队失败 —— 反方直接获胜!` });
            return endGame(ps, g, 'evil', '连续 5 次提名被否决,正方瘫痪,反方获胜', names);
          }
          push({ kind: 'reject', text: `队伍被否决,换「${ps[g.leaderIdx].name}」当队长(连续第 ${g.rejectCount} 次)` });
          await pacing();
        }
      }
      if (abortRef.current) return;

      // —— 执行任务:正方强制成功(不调用),反方并行抉择 ——
      if (!(await gate())) return;
      setStatus('任务执行中…(上场者秘密出牌)');
      const onTeam = ps.filter((p) => team.includes(p.name));
      const evilOnTeam = onTeam.filter((p) => p.align === 'evil');
      let failCards = 0;
      try {
        const choices = await Promise.all(evilOnTeam.map(async (p) => {
          try {
            const pr = questPrompt(p, g, ps, team);
            return normQuest(extractJSON(await callModel(p.index, pr.system, pr.user, 200, password))).action;
          } catch { return '成功'; }
        }));
        failCards = choices.filter((c) => c === '失败').length;
      } catch { failCards = 0; }
      setStatus('');

      const success = failCards < quest.fails;
      g.results[g.questIdx] = success ? 'success' : 'fail';
      if (success) g.success++; else g.fail++;
      sync();
      push({ kind: 'result', result: success ? 'success' : 'fail', questNo: g.questIdx + 1, failCards, size: quest.size });
      g.log.push(`[任务${g.questIdx + 1}] 执行结果:${success ? '成功' : '失败'}(${failCards} 张失败票)。比分 正${g.success}:${g.fail}反`);
      await pacing();

      if (g.fail >= 3) return endGame(ps, g, 'evil', '反方破坏了 3 个任务,直接获胜', names);
      if (g.success >= 3) break; // 进入刺杀阶段

      g.questIdx++;
      g.leaderIdx = (g.leaderIdx + 1) % ps.length;
      sync();
    }
    if (abortRef.current) return;

    // —— 正方完成 3 次 → 刺客刺杀梅林 ——
    if (g.success >= 3) {
      if (!(await gate())) return;
      const assassin = ps.find((p) => p.role === 'assassin');
      const merlin = ps.find((p) => p.role === 'merlin');
      push({ kind: 'round', text: '正方完成 3 个任务 —— 刺客启动最后一击' });
      setActiveIdx(assassin.index); setStatus(`${assassin.name}(刺客)正在指认梅林…`);
      let guess;
      try {
        const p = assassinPrompt(assassin, g, ps, g.log);
        guess = normAssassin(extractJSON(await callModel(assassin.index, p.system, p.user, 280, password)), ps.filter((x) => x.align === 'good').map((x) => x.name));
      } catch { guess = { thought: '', target: ps.find((x) => x.align === 'good').name, speech: '(指认出错)' }; }
      setActiveIdx(null);
      push({ kind: 'assassin', model: assassin, thought: guess.thought, target: guess.target, speech: guess.speech });
      g.log.push(`[刺杀] ${assassin.name} 指认 ${guess.target} 为梅林`);
      await pacing();

      const hit = guess.target === merlin.name;
      return endGame(ps, g, hit ? 'evil' : 'good',
        hit ? `刺客精准刺中梅林(${merlin.name}),反方惊天逆转!` : `刺客认错了人(梅林其实是 ${merlin.name}),正方守住胜利!`, names);
    }
  }

  async function endGame(ps, g, side, why, names) {
    setActiveIdx(null); setStatus('');
    setWinner({ side, why });
    // 赛季积分
    setSeason((prev) => { const s = applySeason(prev, ps, side); saveSeason(s); return s; });
    setStage('ended');
    // 解说(失败就跳过)
    try {
      const commentator = ps.find((p) => p.name.includes('DeepSeek')) || ps[0];
      const outcomeText = `${side === 'good' ? '正方' : '反方'}获胜 —— ${why}`;
      const p = commentaryPrompt(g, ps, outcomeText, g.log);
      const txt = (await callModel(commentator.index, p.system, p.user, 320, password)).trim();
      if (txt) setCommentary(txt);
    } catch {}
  }

  // ---------- 控制 ----------
  function togglePause() {
    const np = !pausedRef.current; pausedRef.current = np; setPaused(np);
    if (!np) { const rs = pauseResolvers.current; pauseResolvers.current = []; rs.forEach((r) => r()); }
  }
  function doStep() { if (stepResolveRef.current) { const r = stepResolveRef.current; stepResolveRef.current = null; r(); } }
  function resetGame() {
    abortRef.current = true; pausedRef.current = false;
    const rs = pauseResolvers.current; pauseResolvers.current = []; rs.forEach((r) => r());
    if (stepResolveRef.current) { const r = stepResolveRef.current; stepResolveRef.current = null; r(); }
    setStage('setup'); setFeed([]); setWinner(null); setActiveIdx(null); setPaused(false); setStatus(''); setCommentary('');
  }
  function clearSeason() { saveSeason({}); setSeason({}); }

  // ============ 渲染 ============
  const Dot = ({ color }) => <span className="dot" style={{ color, background: color }} />;
  const RoleIcon = ({ role }) => {
    const ic = ROLE_DEF[role]?.icon;
    if (ic === 'eye') return <Eye size={12} />;
    if (ic === 'swords') return <Swords size={12} />;
    return <Shield size={12} />;
  };

  function renderItem(it, i) {
    if (it.kind === 'round') return <div key={i} className="sys">— {it.text} —</div>;
    if (it.kind === 'reject') return <div key={i} className="sys reject">↻ {it.text}</div>;
    if (it.kind === 'error') return <div key={i} className="sys"><span className="err">⚠ {it.model.name}:{it.text}</span></div>;

    if (it.kind === 'proposal') {
      return (
        <div key={i} className="block proposal">
          <div className="who"><Crown size={14} color="var(--gold-soft)" /><span className="name" style={{ color: it.model.color }}>{it.model.name}</span><span className="persona">· 队长提名</span></div>
          {it.thought ? <div className="thought">💭 {it.thought}</div> : null}
          {it.speech ? <div className="speech">“{it.speech}”</div> : null}
          <div className="team">{it.team.map((n) => <span key={n} className="chip">{n}</span>)}</div>
        </div>
      );
    }
    if (it.kind === 'votes') {
      return (
        <div key={i} className="block">
          <div className="who"><span className="name">投票</span></div>
          <div className="votes">
            {it.rows.map((r, k) => (
              <div key={k} className="vote-row">
                <span className={`vote-badge ${r.vote === '同意' ? 'yes' : 'no'}`}>{r.vote}</span>
                <span className="vn" style={{ color: r.color }}>{r.name}</span>
                <span className="vr">{r.reason}</span>
              </div>
            ))}
          </div>
          <div className="tally">{it.tally}</div>
        </div>
      );
    }
    if (it.kind === 'result') {
      return (
        <div key={i} className={`block result ${it.result}`}>
          <div className="label">任务 {it.questNo} · {it.size} 人</div>
          <div className="big">{it.result === 'success' ? '任务成功' : '任务失败'}</div>
          <div className="sub">{it.result === 'fail' ? `出现 ${it.failCards} 张破坏票` : '无人破坏,顺利完成'}</div>
        </div>
      );
    }
    if (it.kind === 'assassin') {
      return (
        <div key={i} className="block proposal" style={{ borderColor: 'rgba(224,85,107,0.5)' }}>
          <div className="who"><Swords size={14} color="var(--evil-soft)" /><span className="name" style={{ color: it.model.color }}>{it.model.name}</span><span className="persona">· 刺客出手</span></div>
          {it.thought ? <div className="thought">💭 {it.thought}</div> : null}
          {it.speech ? <div className="speech">“{it.speech}”</div> : null}
          <div className="team"><span className="chip" style={{ borderColor: 'var(--evil)' }}>刺杀目标:{it.target}</span></div>
        </div>
      );
    }
    return null;
  }

  // 赛季:是否中外混编
  const nations = [...new Set(models.map((m) => nationFor(m.name)))];
  const mixedNation = nations.length > 1;
  const seasonRows = Object.entries(season).map(([name, s]) => ({ name, ...s })).sort((a, b) => (b.wins - a.wins) || (b.games - a.games));

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          <h1><span className="b">阿</span>瓦<span className="r">隆</span> · AI 谋略局</h1>
          <div className="sub"><b>六大国产 AI</b>&nbsp;&nbsp;任务 · 潜伏 · 刺杀</div>
        </div>
        <div className="tag"><Sparkles size={14} /> 多模型自动对局 · 短视频内容引擎</div>
      </header>

      {stage === 'setup' && (
        <section className="panel setup">
          <h2><Shield size={18} /> 开局设置</h2>
          <div className="blurb">
            6 个 AI 随机分配身份:正方 4(梅林、派西维尔、2 名忠臣)vs 反方 2(莫甘娜、刺客)。<br />
            正方要完成 3 个任务并护住梅林;反方潜伏破坏,或撑到最后由刺客刺中梅林翻盘。<br />
            当前可用模型:{models.length ? models.map((m) => m.name).join('、') : '加载中…'}
          </div>
          <div className="field">
            <label>访问密码(若后端设了 ACCESS_PASSWORD 才需要,否则留空)</label>
            <input className="num-input" type="password" value={password} placeholder="未设密码可留空" autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label className="toggle"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> 手动步进模式(每步点一次,方便逐帧录制)</label>
          </div>
          <button className="btn primary" onClick={startGame}><Play size={16} /> 开始对局</button>
          {setupErr ? <p className="err" style={{ marginTop: 12 }}>{setupErr}</p> : null}
        </section>
      )}

      {stage !== 'setup' && (
        <section className="stage">
          <div className="main-col">
            <div className="controls">
              {stage === 'playing' && <button className="btn ghost" onClick={togglePause}>{paused ? <><Play size={15} /> 继续</> : <><Pause size={15} /> 暂停</>}</button>}
              {stage === 'playing' && manual && <button className="btn ghost" onClick={doStep}><ChevronRight size={15} /> 下一步</button>}
              <button className="btn ghost" onClick={resetGame}><RotateCw size={15} /> {stage === 'ended' ? '再来一局' : '重置'}</button>
              <div className="spacer" />
              {stage === 'playing' && (
                <div className="speed-pick">
                  {[['慢', 5200], ['中', 2600], ['快', 1100]].map(([l, ms]) => (
                    <button key={ms} className={speed === ms ? 'on' : ''} onClick={() => setSpeed(ms)}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            {status ? <div className="sys">⏳ {status}</div> : null}

            <div className="feed">
              {feed.map(renderItem)}
              {stage === 'ended' && winner && (
                <div className="panel reveal">
                  <div className="crown">本 局 结 果</div>
                  <div className={`winner ${winner.side}`}>{winner.side === 'good' ? '正方 · 亚瑟的忠臣 胜' : '反方 · 莫德雷德的爪牙 胜'}</div>
                  <div className="why">{winner.why}</div>
                  <div className="roles">
                    {players.map((p) => (
                      <div key={p.index} className="rrow">
                        <Dot color={p.color} />
                        <span className="rn">{p.name}</span>
                        <span className={`rr ${p.align}`}><RoleIcon role={p.role} /> {ROLE_DEF[p.role].label}</span>
                      </div>
                    ))}
                  </div>
                  {commentary ? <div className="commentary">🎙 {commentary}</div> : null}
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>

          <aside className="side-col">
            <div className="panel quest-board">
              <div className="head">
                <span className="t">任 务 进 度</span>
                <span className="score"><span className="g">正 {score.success}</span><span className="sep">:</span><span className="e">{score.fail} 反</span></span>
              </div>
              <div className="quests">
                {QUESTS.map((q, i) => (
                  <div key={i} className={`quest ${results[i] ? results[i] : ''} ${i === questIdx && stage === 'playing' && !results[i] ? 'cur' : ''}`}>
                    <div className="qn">任务{i + 1}</div>
                    <div className="qsize">{q.size}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel roster">
              <div className="t">参 战 模 型</div>
              {players.map((p) => (
                <div key={p.index} className={`player${activeIdx === p.index ? ' active' : ''}`}>
                  <Dot color={p.color} />
                  <span className="name">{p.name}</span>
                  <span className="persona">· {p.persona}</span>
                  {stage === 'playing' && activeIdx === p.index ? <span className="thinking-tag">思考中</span> : null}
                  {stage === 'playing' && leaderIdx === players.indexOf(p) && activeIdx !== p.index ? <span className="leader"><Crown size={12} /> 队长</span> : null}
                  {stage === 'ended' ? <span className={`role-pill ${p.align}`}>{ROLE_DEF[p.role].label}</span> : null}
                </div>
              ))}
              {players.length === 0 && models.map((m) => (
                <div key={m.index} className="player"><Dot color={m.color} /><span className="name">{m.name}</span><span className="persona">· {m.persona}</span></div>
              ))}
            </div>

            {seasonRows.length > 0 && (
              <div className="panel season">
                <div className="head"><span className="t">赛 季 积 分</span><button className="clear" onClick={clearSeason}>清空</button></div>
                <div className="note">{mixedNation ? '中外对抗已开启,下方为各模型战绩' : '战绩累计在本浏览器;接入海外模型后自动按中外阵营汇总'}</div>
                {seasonRows.map((r, i) => (
                  <div key={r.name} className="season-row">
                    <Dot color={styleFor(r.name, i).color} />
                    <span className="sn">{i + 1}. {r.name}</span>
                    <span className="sstat">{r.games} 局 · 正{r.goodWins}/{r.goodGames} 反{r.evilWins}/{r.evilGames}</span>
                    <span className="swin">{r.wins} 胜</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}
