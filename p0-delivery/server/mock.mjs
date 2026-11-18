// 确定性本地 Mock 抽取（无真实模型时的降级/演示路径）。纯函数：同 (text, context) 同输出。
// 明确标注 mode:"mock"，绝不冒充真实模型。
import { shiftDate, weekStartOf, parseDate, fmtDate } from "../web/engine.js";

const WD = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const CN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export function resolveDate(text, today) {
  const t = String(text).trim();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = t.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    let y = Number(today.slice(0, 4));
    let iso = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    if (parseDate(iso) > parseDate(today)) iso = `${y - 1}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    return iso;
  }
  if (/大前天/.test(t)) return shiftDate(today, -3);
  if (/前天/.test(t)) return shiftDate(today, -2);
  if (/昨天|昨日/.test(t)) return shiftDate(today, -1);
  if (/今天|今日/.test(t)) return today;
  m = t.match(/([0-9一二两三四五六七八九十]+)\s*天前/);
  if (m) {
    const n = CN[m[1]] != null ? CN[m[1]] : Number(m[1]);
    if (Number.isFinite(n)) return shiftDate(today, -n);
  }
  m = t.match(/上(?:周|礼拜)([一二三四五六日天])/);
  if (m) return shiftDate(weekStartOf(today), (WD[m[1]] - 1) - 7);
  if (/上(?:周|礼拜)/.test(t)) return shiftDate(weekStartOf(today), -7);
  m = t.match(/(?:本(?:周|礼拜)|周|礼拜)([一二三四五六日天])/);
  if (m) {
    let iso = shiftDate(weekStartOf(today), WD[m[1]] - 1);
    if (parseDate(iso) > parseDate(today)) iso = shiftDate(iso, -7);
    return iso;
  }
  return null;
}

const EMO = [
  [/焦虑|紧张|压力/, 2],
  [/开心|高兴|快乐|爽/, 2],
  [/难过|伤心|低落|emo/, 2],
  [/累|疲惫|乏/, 1],
  [/烦|烦躁|郁闷/, 2],
  [/孤独|想家/, 1],
];
const POS = [/跑|公里|健身|锻炼|散步/, /读完|看书|读书|复习|背单词/, /写完|论文|代码|课设|报告|作业/, /早起|学会|整理|帮/];
const NEG = [/熬夜|刷手机|刷了.*手机/, /拖延|拖了/, /翘课|逃课/, /暴饮暴食|通宵游戏/];

function has(re, t) { return re.test(t); }
function any(list, t) { return list.some((re) => has(re, t)); }

export function extract(text, context = {}) {
  const today = context.today || fmtDate(Date.now());
  const pending = context.pendingEvents || [];
  const pendingRests = context.pendingRests || [];
  const openTasks = context.openTasks || [];
  const t = String(text);

  // 0) 对待确认休息的回应（确认/否认/补日期）
  if (pendingRests.length) {
    const r = pendingRests[0];
    if (/不是|记错|否认|取消|不对|没有的事/.test(t)) {
      return { reply: "好，这个休息标记不记了。", items: [{ op: "deny_rest", id: r.id }] };
    }
    const isDateAnswer = /上周|昨天|前天|周[一二三四五六日天]|礼拜|天前|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|就是今天/.test(t) && !/跑|完成|写|读|健身|散步/.test(t);
    if (isDateAnswer) {
      const d = resolveDate(t, today);
      if (d) return { reply: "记下了，那天的停牌恢复生效。", items: [{ op: "confirm_rest", id: r.id, date: d }] };
      return { reply: "我再确认下：想标记哪一天休息？比如「上周三」或「11月12日」。", items: [] };
    }
    if (/^(是的|对|确认|嗯|没错|就是那天|对的|是的没错)[。！!～~\s]*$/.test(t.trim())) {
      return { reply: "记下了，休息标记生效。", items: [{ op: "confirm_rest", id: r.id, date: r.date }] };
    }
  }

  // 1) 对待确认事件的回应（确认/否认/补日期）
  if (pending.length) {
    const p = pending[0];
    if (/不是|记错|否认|取消|不对|没有的事/.test(t)) {
      return { reply: "好，这条不记了。", items: [{ op: "deny_event", id: p.id }] };
    }
    const isDateAnswer = /上周|昨天|前天|周[一二三四五六日天]|礼拜|天前|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|就是今天/.test(t) && !/跑|完成|写|读|健身|散步/.test(t);
    if (isDateAnswer) {
      const d = resolveDate(t, today);
      if (d) return { reply: "记下了，补进那天的走势。", items: [{ op: "confirm_event", id: p.id, occurredAt: d }] };
      return { reply: "我再确认下：具体是哪一天？比如「上周三」或「11月12日」。", items: [] };
    }
    if (/^(是的|对|确认|嗯|没错|就是那天|对的|是的没错)[。！!～~\s]*$/.test(t.trim())) {
      return { reply: "记下了，这条进走势了。", items: [{ op: "confirm_event", id: p.id, occurredAt: p.occurredAt }] };
    }
  }

  const items = [];
  const replyParts = [];

  // 2) 休息
  if (/休息|摆烂|请假|放假/.test(t)) {
    items.push({ op: "add_rest", rest: { date: today, quote: t, confidence: 0.9 } });
    replyParts.push("记下了，你今天想留点时间休息。");
  }

  // 3) 完成任务 / 完成行为
  const doneMatch = /完成|做完|搞定|答辩通过|写完/.test(t);
  if (doneMatch) {
    const hit = openTasks.find((task) => {
      const key = task.title.replace(/[^一-龥A-Za-z0-9]/g, "");
      return key && (t.includes(task.title) || (key.length >= 2 && t.includes(key.slice(0, 2))));
    });
    if (hit) {
      items.push({ op: "complete_task", id: hit.id, doneAt: today });
      replyParts.push(`「${hit.title}」完成了，记下了。`);
    }
  }

  // 4) 新任务
  if (/要在|计划|打算|截止|之前完成|下周交|目标是/.test(t) && !doneMatch) {
    const due = resolveDate(t, today) || shiftDate(today, 7);
    items.push({ op: "add_task", task: { title: t.slice(0, 40), dueAt: due, position: 2, confidence: 0.7 } });
    replyParts.push("记下了这个目标，到期前我会陪你盯着。");
  }

  // 5) 情绪 + 行为（多意图 D32）
  const emoHit = EMO.find(([re]) => has(re, t));
  if (emoHit) {
    const q = (t.match(/[^，。,；;]*?(焦虑|紧张|压力|开心|高兴|快乐|难过|伤心|低落|累|疲惫|烦|烦躁|孤独|想家)[^，。,；;]*/) || [t])[0];
    items.push({ op: "add_event", event: { eventType: "emotion", polarity: "neutral", intensity: emoHit[1], occurredAt: today, quote: q.trim() || t, tags: [], confidence: 0.85 } });
  }

  const vaguePast = /前阵子|之前|有一次|上次|前些日子/.test(t) && !resolveDate(t, today);
  const posHit = any(POS, t);
  const negHit = any(NEG, t);
  if (posHit || negHit) {
    let intensity = 2;
    if (/五公里|5公里|5km|马拉松/.test(t)) intensity = 3;
    if (/终于|完成|答辩通过/.test(t)) intensity = Math.min(5, intensity + 1);
    const polarity = negHit && !posHit ? "negative" : "positive";
    const bq = (t.match(/[^，。,；;]*?(跑|公里|健身|锻炼|散步|读完|看书|读书|复习|写完|论文|代码|课设|报告|作业|早起|熬夜|刷手机|拖延|翘课)[^，。,；;]*/) || [t])[0];
    items.push({
      op: "add_event",
      event: { eventType: "behavior", polarity, intensity, occurredAt: today, quote: bq.trim() || t, tags: [], confidence: vaguePast ? 0.35 : 0.95 },
    });
    if (vaguePast) replyParts.push("这是哪天跑的？告诉我具体日期，我再把它记进那天的走势。");
    else replyParts.push(polarity === "positive" ? "记下了，这条进今天的走势了。" : "记下了，这算一次波动，不代表你不行。");
  } else if (emoHit && !items.some((i) => i.op === "add_rest")) {
    replyParts.push("我听到了，先陪你待一会儿。");
  }

  if (!items.length) {
    return { reply: "这句我先陪你聊着。可以说说今天做了什么、感觉怎么样，或者接下来要完成什么。", items: [] };
  }
  const reply = replyParts.length ? replyParts.join("") : "记下了。";
  return { reply, items };
}