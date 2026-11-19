// 确定性本地 Mock 抽取（无真实模型时的降级/演示路径）。纯函数：同 (text, context) 同输出。
// 明确标注 mode:"mock"，绝不冒充真实模型。
// Agent 协议 v0.1：区分新增目标 / 完成已有目标 / 记录已发生的事；同名目标交应用澄清。
import { parseDate, fmtDate } from "./engine.js";
import { resolveDate, resolveDueDate } from "./date.js";
import {
  isVaguePastText,
  matchTaskCandidates,
  recordClarification,
  resolveClarificationReply,
  taskClarification,
} from "./agent-protocol.js";

export { resolveDate } from "./date.js";

const EMO = [
  [/焦虑|紧张|压力/, 2],
  [/开心|高兴|快乐|爽/, 2],
  [/难过|伤心|低落|emo/, 2],
  [/累|疲惫|乏/, 1],
  [/烦|烦躁|郁闷/, 2],
  [/孤独|想家/, 1],
];
const BEHAVIOR = /跑|公里|健身|锻炼|散步|读完|看书|读书|复习|背单词|熬夜|刷手机|拖延|翘课|早起|整理|小跑/;
const NEG = [/熬夜|刷手机|刷了.*手机/, /拖延|拖了/, /翘课|逃课/, /暴饮暴食|通宵游戏/];
const GOAL = /交|提交|完成|写完|做完|复习|准备|考|申请|目标|截止|汇报|答辩|报告|论文|课设/;
const FUTURE = /(?:下周|本周|这周|周|礼拜)[一二三四五六日天]|明天|后天|大后天|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|\d+\s*天(?:后|以后|之后)|\d+\s*(?:周|礼拜)(?:后|以后|之后)|月底|月末/;
const COMPLETION = /交了|交完|提交了|提交完成|完成了|做完了|搞定了|写完了|答辩通过|通过了|已交|已经交/;

function has(re, text) {
  return re.test(text);
}

function any(list, text) {
  return list.some((re) => has(re, text));
}

function clauseOf(text, pattern) {
  const match = String(text).match(new RegExp(`[^，。,；;]*?(?:${pattern})[^，。,；;]*`));
  return (match ? match[0] : text).trim();
}

function isCompletionIntent(text) {
  if (COMPLETION.test(text)) return true;
  return /完成|做完|写完/.test(text) && /(今天|昨天|刚刚|已经|了)/.test(text);
}

function isGoalIntent(text) {
  if (!GOAL.test(text)) return false;
  if (!/(我想|我要|计划|打算|准备|目标|截止|之前|想)/.test(text) && !FUTURE.test(text)) return false;
  return true;
}

function taskTitleOf(text) {
  let value = String(text).trim().replace(/[。！？!?～~]+$/g, "");
  value = value.replace(/^(?:我)?(?:想|要|计划|打算|准备|想在|想在|想要)/, "");
  value = value.replace(/(?:下周|本周|这周|周|礼拜)[一二三四五六日天]/g, "");
  value = value.replace(/明天|后天|大后天|今天|今日|之前|以前|截止|前/g, "");
  value = value.replace(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日|\d+\s*天(?:后|以后|之后)|\d+\s*(?:周|礼拜)(?:后|以后|之后)/g, "");
  value = value.replace(/^[，、,。\s]+|[，、,。\s]+$/g, "").replace(/\s+/g, "");
  return value.slice(0, 40) || String(text).slice(0, 40);
}

function behaviorClause(text) {
  return clauseOf(text, "跑|公里|健身|锻炼|散步|读完|看书|读书|复习|背单词|熬夜|刷手机|拖延|翘课|早起|小跑");
}

function behaviorIntensity(text) {
  let intensity = 2;
  if (/五公里|5公里|5km|马拉松/.test(text)) intensity = 3;
  if (/终于|完成|答辩通过/.test(text)) intensity = Math.min(5, intensity + 1);
  return intensity;
}

function pendingReply(pendingEvents, pendingRests, text, today) {
  if (pendingRests.length) {
    const r = pendingRests[0];
    if (/不是|记错|否认|取消|不对|没有的事|不记了/.test(text)) {
      return { reply: "好，这个休息标记不记了。", items: [{ op: "deny_rest", id: r.id }] };
    }
    const isDateAnswer = /上周|昨天|前天|周[一二三四五六日天]|礼拜|天前|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|就是今天/.test(text) && !BEHAVIOR.test(text) && !isCompletionIntent(text);
    if (isDateAnswer) {
      const date = resolveDate(text, today);
      if (date) return { reply: "记下了，那天的停牌恢复生效。", items: [{ op: "confirm_rest", id: r.id, date }] };
      return { reply: "我再确认下：想标记哪一天休息？比如「上周三」或「11月12日」。", items: [] };
    }
    if (/^(是的|对|确认|嗯|没错|就是那天|对的|是的没错)[。！!～~\s]*$/.test(text.trim())) {
      return { reply: "记下了，休息标记生效。", items: [{ op: "confirm_rest", id: r.id, date: r.date }] };
    }
  }
  if (pendingEvents.length) {
    if (pendingEvents.length > 1 && (/^(是的|对|确认|嗯|没错|就是那天|对的|是的没错)[。！!～~\s]*$/.test(text.trim()) || resolveDate(text, today))) {
      return {
        reply: "现在有多条待确认记录，你说的是哪一条？",
        items: [recordClarification(text, pendingEvents, "event", { intent: "confirm_event" })],
      };
    }
    const p = pendingEvents[0];
    if (/不是|记错|否认|取消|不对|没有的事|不记了/.test(text)) {
      return { reply: "好，这条不记了。", items: [{ op: "deny_event", id: p.id }] };
    }
    const isDateAnswer = /上周|昨天|前天|周[一二三四五六日天]|礼拜|天前|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|就是今天/.test(text) && !BEHAVIOR.test(text) && !isCompletionIntent(text);
    if (isDateAnswer) {
      const date = resolveDate(text, today);
      if (date) return { reply: "记下了，补进那天的走势。", items: [{ op: "confirm_event", id: p.id, occurredAt: date }] };
      return { reply: "我再确认下：具体是哪一天？比如「上周三」或「11月12日」。", items: [] };
    }
    if (/^(是的|对|确认|嗯|没错|就是那天|对的|是的没错)[。！！!～~\s]*$/.test(text.trim())) {
      return { reply: "记下了，这条进走势了。", items: [{ op: "confirm_event", id: p.id, occurredAt: p.occurredAt }] };
    }
  }
  return null;
}

function clarificationReply(clarifications, text, today) {
  for (const clarification of clarifications || []) {
    const resolved = resolveClarificationReply(clarification, text, today);
    if (resolved.status === "resolved") {
      return { reply: resolved.item.op === "complete_task" ? "这次记到具体目标上了。" : "好，按这条处理。", items: [resolved.item] };
    }
    if (resolved.status === "cancelled") return { reply: "好，这条先不处理。", items: [] };
    if (resolved.status === "ambiguous") return { reply: "还是有点分不清，你指的是哪一个？", items: [] };
  }
  return null;
}

export function extract(text, context = {}) {
  const today = context.today || fmtDate(Date.now());
  const pendingEvents = context.pendingEvents || [];
  const pendingRests = context.pendingRests || [];
  const openTasks = context.openTasks || [];
  const t = String(text);

  const pending = pendingReply(pendingEvents, pendingRests, t, today);
  if (pending) return pending;

  const clarification = clarificationReply(context.clarifications, t, today);
  if (clarification) return clarification;

  const items = [];
  const replyParts = [];
  const restIntent = /休息|摆烂|请假|放假/.test(t);
  const completionIntent = isCompletionIntent(t);
  const goalIntent = !completionIntent && !restIntent && isGoalIntent(t);
  const hasBehavior = BEHAVIOR.test(t);

  // 休息：记录已发生的事（D31）；模糊过去仍低置信，确认前无停牌增益
  if (restIntent) {
    const vaguePast = isVaguePastText(t, today);
    const date = resolveDate(t, today) || today;
    items.push({ op: "add_rest", rest: { date, quote: t, confidence: vaguePast ? 0.35 : 0.9 } });
    replyParts.push(vaguePast ? "这是哪天休息的？告诉我日期，我再补进那天。" : "记下了，你今天想留点时间休息。");
  }

  // 完成已有目标：必须命中唯一稳定 ID；同名/相近目标交给应用澄清
  if (completionIntent) {
    const match = matchTaskCandidates(t, openTasks);
    if (match.ambiguous) {
      const source = clauseOf(t, "交了|交完|提交了|完成了|做完了|搞定了|写完了|通过了");
      items.push(taskClarification(source, match.candidates, { intent: "complete_task" }));
      replyParts.push("你说的是哪个目标？");
    } else if (match.candidates.length === 1) {
      const task = match.candidates[0];
      const doneAt = resolveDate(t, today) || today;
      items.push({ op: "complete_task", id: task.id, doneAt });
      replyParts.push(`「${task.title}」完成了，记下了。`);
    } else {
      replyParts.push("没找到仍在进行的目标；如果之前已经完成，这次不会重复计分。去目标中心确认一下名字？");
    }
  }

  // 新增目标：只创建未来承诺；没有到期日只追问，不落目标
  if (goalIntent) {
    const dueAt = resolveDueDate(t, today);
    if (!dueAt) {
      replyParts.push("这个目标想哪天完成？告诉我日期，我再创建。");
    } else if (parseDate(dueAt) < parseDate(today)) {
      replyParts.push("这个日期已经过去了，想定在哪天完成？");
    } else {
      const title = taskTitleOf(t);
      if (title) {
        items.push({ op: "add_task", task: { title, dueAt, position: 2, confidence: 0.9 } });
        replyParts.push("记下了这个目标，到期前我会陪你盯着。");
      }
    }
  }

  // 情绪与已发生的行为（D18/D32）；完成/新增目标句不把目标名词误当行为
  const emoHit = EMO.find(([re]) => has(re, t));
  const vaguePast = hasBehavior && isVaguePastText(t, today);
  const allowBehavior = hasBehavior && (restIntent || !completionIntent && !goalIntent || /跑了|跑步|公里|健身|锻炼|散步|读完|看书|读书|背单词|熬夜|刷手机|拖延|翘课|早起|小跑/.test(t));
  if (emoHit) {
    const quote = clauseOf(t, "焦虑|紧张|压力|开心|高兴|快乐|难过|伤心|低落|累|疲惫|烦|烦躁|孤独|想家") || t;
    items.push({ op: "add_event", event: { eventType: "emotion", polarity: "neutral", intensity: emoHit[1], occurredAt: today, quote, tags: [], confidence: 0.85 } });
  }
  if (allowBehavior) {
    const negHit = any(NEG, t);
    const polarity = negHit && !/跑|公里|健身|锻炼|散步|读完|看书|读书|复习|背单词|早起|整理|小跑/.test(t) ? "negative" : "positive";
    items.push({
      op: "add_event",
      event: {
        eventType: "behavior",
        polarity,
        intensity: behaviorIntensity(t),
        occurredAt: today,
        quote: behaviorClause(t) || t,
        tags: [],
        confidence: vaguePast ? 0.35 : 0.95,
      },
    });
    if (vaguePast) replyParts.push("这是哪天做的？告诉我具体日期，我再把它记进那天的走势。");
    else replyParts.push(polarity === "positive" ? "记下了，这条进今天的走势了。" : "记下了，这算一次波动，不代表你不行。");
  } else if (emoHit && !items.length) {
    replyParts.push("我听到了，先陪你待一会儿。");
  }

  if (replyParts.length > 1 && replyParts[0] === "你说的是哪个目标？") replyParts.push(replyParts.shift());
  if (!items.length) {
    if (replyParts.length) return { reply: replyParts.join(""), items: [] };
    return { reply: "这句我先陪你聊着。可以说说今天做了什么、感觉怎么样，或者接下来要完成什么。", items: [] };
  }
  return { reply: replyParts.join("") || "记下了。", items };
}
