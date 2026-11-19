// 样例人生：90 天预置数据（冷启动第一屏，design-draft §8）。
// 临时数据（P3 待团队提供真实经历）：当前为虚构但可信的大学生 90 天，确定性生成。
import { shiftDate } from "./engine.js";

export const SAMPLE_META = {
  label: "样例人生 · 虚构演示",
  source: "P3 待定：真实经历待团队提供；当前为虚构学生样例（临时数据）",
};

// [相对今天偏移, 类型, ...]  b=行为(极性,强度,quote) e=情绪(强度,quote) r=休息(quote)
const SCRIPT = [
  [-89, "b", "positive", 2, "早上去操场跑了五公里"],
  [-88, "b", "positive", 1, "读完了一章专业书"],
  [-87, "b", "positive", 2, "把课设的数据库表设计写完了"],
  [-86, "e", 2, "有点担心下周的答辩"],
  [-82, "b", "positive", 2, "去健身房练了一小时"],
  [-81, "b", "positive", 3, "论文初稿终于写完了"],
  [-76, "b", "positive", 2, "恢复跑步，五公里"],
  [-75, "b", "positive", 1, "复习了英语单词"],
  [-74, "e", 2, "看到成绩有点开心"],
  [-72, "b", "negative", 3, "熬夜刷手机到两点"],
  [-70, "b", "positive", 1, "早起背了半小时单词"],
  [-69, "b", "positive", 2, "跑了五公里"],
  [-68, "r", "今天想休息一天"],
  [-66, "b", "positive", 1, "散步了一小时"],
  [-65, "b", "positive", 2, "课设前端页面写完了"],
  [-64, "e", 1, "有点累"],
  [-62, "b", "positive", 2, "跑步五公里"],
  [-60, "r", "请假休息一天"],
  [-57, "b", "positive", 1, "整理了一周笔记"],
  [-56, "b", "positive", 2, "跑了四公里"],
  [-55, "b", "negative", 2, "拖延了一整天没动论文"],
  [-54, "e", 3, "论文压力有点大，焦虑"],
  [-53, "b", "positive", 2, "硬着头皮写了论文第二节"],
  [-52, "b", "positive", 2, "和导师聊完清楚多了"],
  [-50, "b", "positive", 2, "跑步五公里"],
  [-49, "b", "positive", 1, "复习了两章专业课"],
  [-48, "e", 2, "考完试整个人松下来了"],
  [-47, "r", "考完了，这周想好好休息"],
  [-40, "b", "positive", 2, "休息够了，收拾了宿舍"],
  [-39, "b", "positive", 2, "恢复跑步五公里"],
  [-38, "b", "positive", 1, "读了半本小说"],
  [-37, "b", "negative", 3, "又熬夜刷手机了"],
  [-36, "b", "negative", 2, "翘了一节早课"],
  [-35, "e", 2, "有点自责"],
  [-34, "b", "negative", 3, "刷手机刷了一下午"],
  [-31, "b", "negative", 2, "拖延，论文没动"],
  [-29, "b", "positive", 2, "跑步五公里，状态回来了"],
  [-28, "b", "positive", 2, "论文第三节写完了"],
  [-27, "b", "positive", 2, "复习英语"],
  [-26, "e", 2, "心情不错"],
  [-25, "b", "positive", 2, "跑了五公里"],
  [-22, "b", "positive", 2, "课设联调通了"],
  [-21, "b", "positive", 3, "数据库课设答辩通过了"],
  [-20, "r", "今天休息一天"],
  [-19, "b", "positive", 1, "散步想了很多"],
  [-18, "b", "positive", 2, "跑步五公里"],
  [-16, "e", 1, "有点想家"],
  [-15, "b", "positive", 2, "给家里打了电话后去跑了步"],
  [-14, "b", "positive", 2, "复习专业课"],
  [-12, "b", "positive", 2, "跑步五公里"],
  [-11, "b", "positive", 2, "写完了实验报告"],
  [-10, "b", "negative", 2, "熬夜赶报告"],
  [-9, "e", 2, "赶完报告有点累但踏实"],
  [-8, "b", "positive", 2, "跑步五公里"],
  [-6, "r", "摆烂一天"],
  [-4, "b", "positive", 1, "看了部纪录片"],
  [-3, "b", "positive", 2, "跑步五公里"],
  [-2, "b", "positive", 2, "复习英语"],
  [-1, "b", "positive", 2, "把下周计划列清楚了"],
  [0, "b", "positive", 2, "今天早上跑了五公里"],
  [0, "e", 2, "新的一天，状态还行"],
];

export function buildSampleRecords(today) {
  const events = [];
  const rests = [];
  let seq = 0;
  for (const row of SCRIPT) {
    const [off, kind] = row;
    const date = shiftDate(today, off);
    seq += 1;
    const createdAt = `${date}T12:${String(seq % 60).padStart(2, "0")}:00.000Z`;
    if (kind === "b") {
      events.push({
        id: `smp_evt_${String(seq).padStart(3, "0")}`,
        kind: "event",
        eventType: "behavior",
        polarity: row[2],
        intensity: row[3],
        occurredAt: date,
        quote: row[4],
        tags: [],
        confidence: 0.9,
        status: "confirmed",
        createdAt,
        deletedAt: null,
      });
    } else if (kind === "e") {
      events.push({
        id: `smp_evt_${String(seq).padStart(3, "0")}`,
        kind: "event",
        eventType: "emotion",
        polarity: "neutral",
        intensity: row[2],
        occurredAt: date,
        quote: row[3],
        tags: [],
        confidence: 0.85,
        status: "confirmed",
        createdAt,
        deletedAt: null,
      });
    } else {
      rests.push({
        id: `smp_rest_${String(seq).padStart(3, "0")}`,
        kind: "rest",
        date,
        quote: row[2],
        confidence: 0.9,
        status: "confirmed",
        createdAt,
        deletedAt: null,
      });
    }
  }
  const tasks = [
    { id: "smp_task_1", kind: "task", title: "数据库课设", dueAt: shiftDate(today, -22), position: 3, status: "done", createdAt: `${shiftDate(today, -80)}T09:00:00.000Z`, doneAt: `${shiftDate(today, -21)}T16:00:00.000Z`, deletedAt: null },
    { id: "smp_task_2", kind: "task", title: "论文第三章", dueAt: shiftDate(today, 8), position: 3, status: "open", createdAt: `${shiftDate(today, -52)}T09:00:00.000Z`, doneAt: null, deletedAt: null },
    { id: "smp_task_3", kind: "task", title: "英语考试", dueAt: shiftDate(today, 20), position: 2, status: "open", createdAt: `${shiftDate(today, -30)}T09:00:00.000Z`, doneAt: null, deletedAt: null },
    { id: "smp_task_4", kind: "task", title: "实验报告补交", dueAt: shiftDate(today, -3), position: 1, status: "open", createdAt: `${shiftDate(today, -12)}T09:00:00.000Z`, doneAt: null, deletedAt: null },
  ];
  return { events, rests, tasks };
}