import type { AgentRun, BoardEvent, BoardSnapshot, Now, ProjectId, StageRef } from '../domain/board';
import { PROJECTS } from '../domain/board';

/** Illustrative activity only: this is never evidence of actual game progress. */
export function createDemoSnapshot(now: Now = Date.now()): BoardSnapshot {
  const current = now instanceof Date ? now.getTime() : now;
  const at = (minutesAgo: number) => new Date(current - minutesAgo * 60_000).toISOString();
  const matchStage = { id: 'M0', name: '环境与平台风险' };
  const catStage = { id: 'M1', name: '核心玩法原型' };
  const incrementalStage = { id: 'M1', name: '两块地机制原型' };
  const stageByProject: Record<ProjectId, StageRef> = {
    '3match': matchStage,
    'cat-and-dog': catStage,
    'incremental-xxx': incrementalStage,
  };
  const stepByProject: Record<ProjectId, StageRef> = {
    '3match': { id: 'M0.1', name: '竖屏交互与构建验证' },
    'cat-and-dog': { id: 'M1a', name: '完整单局胜败与重试' },
    'incremental-xxx': { id: 'M1.1', name: '第一块地经营闭环' },
  };
  const runs: AgentRun[] = [
    {
      id: 'demo-match-producer', instanceId: 'c24d1100-1111-4111-8111-00000000f931', projectId: '3match', role: 'game-producer', label: '制作人',
      task: '确认本阶段目标与开发边界', stage: matchStage, step: stepByProject['3match'],
      status: 'running', lastReportedAt: at(2), summary: '明确竖屏交互验收条件，等待平台验证结果。',
    },
    {
      id: 'demo-match-developer', instanceId: '4be8c200-1111-4111-8111-00000000d8a2', projectId: '3match', role: 'game-tech-lead', label: '技术负责人', lead: true,
      task: '验证抖音构建与工具导入', stage: matchStage, step: stepByProject['3match'],
      status: 'blocked', lastReportedAt: at(4), summary: '缺少测试 AppID，平台导入验证暂时受阻。',
      parentRunId: 'demo-match-producer',
    },
    {
      id: 'demo-cat-producer', instanceId: 'dc410d00-1111-4111-8111-00000000b7e0', projectId: 'cat-and-dog', role: 'game-producer', label: '制作人',
      task: '组织单局闭环并行开发', stage: catStage, step: stepByProject['cat-and-dog'],
      status: 'running', lastReportedAt: at(3), summary: '确认单局闭环范围与验收条件，交技术负责人组织实现。',
    },
    {
      id: 'demo-cat-developer-a', instanceId: '6f2a9c00-1111-4111-8111-00000000a610', projectId: 'cat-and-dog', role: 'game-tech-lead', label: '技术负责人', lead: true,
      task: '集成胜败判定与重试状态复位', stage: catStage, step: stepByProject['cat-and-dog'],
      status: 'running', lastReportedAt: at(1), summary: '已约定战斗状态接口，正在集成并联调重复开局。',
      parentRunId: 'demo-cat-producer',
    },
    {
      id: 'demo-cat-developer-b', instanceId: 'a8f2c100-1111-4111-8111-000000004c91', projectId: 'cat-and-dog', role: 'game-developer', label: '开发 B',
      task: '制作结算面板与重试交互', stage: catStage, step: stepByProject['cat-and-dog'],
      status: 'submitted', lastReportedAt: at(5), summary: '结算面板交互模块已提交，等待技术负责人集成。',
      parentRunId: 'demo-cat-developer-a',
    },
    {
      id: 'demo-incremental-verifier', instanceId: 'f92a1000-1111-4111-8111-00000000f8b2', projectId: 'incremental-xxx', role: 'game-verifier', label: '验收',
      task: '核对收益预览与结算公式一致性', stage: incrementalStage, step: stepByProject['incremental-xxx'],
      status: 'passed', lastReportedAt: at(32), summary: '此演示任务的公式检查通过；不代表整个里程碑验收完成。',
      evidence: ['演示证据：同一组参数下，预览与结算结果一致。'],
    },
    {
      id: 'demo-incremental-developer', instanceId: 'b36e9a00-1111-4111-8111-000000004d11', projectId: 'incremental-xxx', role: 'game-developer', label: '开发 A',
      task: '实现免费经理自动经营', stage: incrementalStage, step: stepByProject['incremental-xxx'],
      status: 'running', lastReportedAt: at(26), summary: '上次报告正在接入经理自动经营，后续状态待确认。',
    },
  ];
  // Explicit art examples stay in the opt-in demo source, never in cloud metadata.
  const artExamples = [
    { id: 'demo-match-art-lead', projectId: '3match' as const, role: 'game-art-lead' as const, label: '美术统筹', task: '收敛棋盘与魔女的视觉方向', parentRunId: 'demo-match-producer' },
    { id: 'demo-cat-asset', projectId: 'cat-and-dog' as const, role: 'game-asset-artist' as const, label: '原画与资产', task: '绘制猫狗角色与街景样件', parentRunId: 'demo-cat-producer' },
    { id: 'demo-cat-ui', projectId: 'cat-and-dog' as const, role: 'game-ui-artist' as const, label: 'UI设计', task: '优化单局 HUD 的按钮层级', parentRunId: 'demo-cat-producer' },
    { id: 'demo-incremental-vfx', projectId: 'incremental-xxx' as const, role: 'game-vfx-artist' as const, label: '动效与特效', task: '制作收获金币与收益跳字反馈' },
  ];
  for (const [index, example] of artExamples.entries()) runs.push({
    ...example, instanceId: `demo-art-instance-${index}`, stage: stageByProject[example.projectId],
    step: stepByProject[example.projectId], status: 'running', lastReportedAt: at(index + 1),
    summary: `演示：${example.task}，尚待样件评审。`,
  });
  const events: BoardEvent[] = [
    { id: 'demo-event-10', projectId: 'cat-and-dog', runId: 'demo-cat-developer-a', role: 'game-tech-lead', kind: 'checkpoint', at: at(1), summary: '开始集成胜败判定与重试状态复位模块。' },
    { id: 'demo-event-09', projectId: '3match', runId: 'demo-match-producer', role: 'game-producer', kind: 'stage_confirmed', at: at(2), summary: '确认当前为 M0：竖屏交互与构建验证。' },
    { id: 'demo-event-08', projectId: 'cat-and-dog', runId: 'demo-cat-producer', role: 'game-producer', kind: 'checkpoint', at: at(3), summary: '确认单局闭环产品切片，由技术负责人组织开发与集成。' },
    { id: 'demo-event-07', projectId: '3match', runId: 'demo-match-developer', role: 'game-tech-lead', kind: 'blocked', at: at(4), summary: '平台导入验证缺少测试 AppID，需要补充配置。' },
    { id: 'demo-event-06', projectId: 'cat-and-dog', runId: 'demo-cat-developer-b', role: 'game-developer', kind: 'submitted', at: at(5), summary: '提交结算面板交互模块，等待技术负责人集成。' },
    { id: 'demo-event-05', projectId: 'cat-and-dog', runId: 'demo-cat-developer-a', role: 'game-tech-lead', kind: 'task_started', at: at(11), summary: '确定模块接口与文件归属，准备集成胜败判定及重试。' },
    { id: 'demo-event-04', projectId: 'cat-and-dog', runId: 'demo-cat-producer', role: 'game-producer', kind: 'started', at: at(14), summary: '读取阶段记录，继续 M1a 单局闭环。' },
    { id: 'demo-event-03', projectId: '3match', runId: 'demo-match-developer', role: 'game-tech-lead', kind: 'task_started', at: at(18), summary: '开始准备平台构建与导入验证。' },
    { id: 'demo-event-02', projectId: 'incremental-xxx', runId: 'demo-incremental-developer', role: 'game-developer', kind: 'checkpoint', at: at(26), summary: '开始接入经理自动经营，尚无新的后续报告。' },
    { id: 'demo-event-01', projectId: 'incremental-xxx', runId: 'demo-incremental-verifier', role: 'game-verifier', kind: 'verification', at: at(32), summary: '演示：收益预览与结算公式检查通过。', evidence: ['演示证据：同一组参数下结果一致。'] },
  ];
  for (const [index, example] of artExamples.entries()) events.push({
    id: `demo-art-event-${index}`, projectId: example.projectId, runId: example.id, role: example.role,
    kind: 'checkpoint', at: at(index + 1), summary: `演示：${example.task}，提交本轮样件进展。`,
  });
  return {
    projects: PROJECTS.map((project) => ({
      ...project,
      stage: { ...stageByProject[project.id] },
      step: { ...stepByProject[project.id] },
      summary: {
        '3match': '先跑通竖屏交互，验证抖音平台构建。',
        'cat-and-dog': '聚焦完整单局胜败、结算与重试闭环。',
        'incremental-xxx': '用两块地验证经营机制与自动化体验。',
      }[project.id],
      lastReportedAt: at(project.id === 'incremental-xxx' ? 26 : 2),
    })),
    runs,
    events,
  };
}
