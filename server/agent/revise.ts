import type { AgentReviseRequest, AgentReviseResponse } from '../types'

type TargetImageType = NonNullable<AgentReviseRequest['targetImageType']>

const MODEL_TYPE_SCENE_TEXT: Record<
  Exclude<
    TargetImageType,
    'product_white' | 'atmosphere'
  >,
  string
> = {
  model_bracelet_bangle:
    '模特图-手链手镯：真人手腕佩戴展示，突出手链/手镯在手部动作中的质感与比例，构图聚焦手部与腕部',
  model_earring:
    '模特图-耳钉耳环：真人耳部佩戴展示，突出耳饰与脸部轮廓关系，构图聚焦耳部近景',
  model_necklace_pendant:
    '模特图-项链吊坠：真人颈部佩戴展示，突出锁骨线条与吊坠垂坠关系，构图聚焦颈部上身',
  model_ring:
    '模特图-戒指：真人手指佩戴展示，突出戒圈比例与手部姿态，构图聚焦手指近景',
  model_set:
    '模特图-首饰套装：真人多件套佩戴展示，耳饰、项链、戒指/手链整体搭配，构图兼顾整体与重点细节',
}

/**
 * Lightweight jewelry-aware prompt reviser (no extra LLM key required).
 * Maps common Chinese / English tweak instructions onto the working prompt.
 */
export function revisePrompt(req: AgentReviseRequest): AgentReviseResponse {
  const base = req.basePrompt.trim()
  const instruction = req.instruction.trim()
  if (!base) {
    throw new Error('当前没有可修改的提示词，请先生成一张图')
  }
  if (!instruction) {
    throw new Error('请输入调整说明')
  }

  let prompt = base
  const notes: string[] = []

  const rules: Array<{
    test: RegExp
    apply: () => void
  }> = [
    {
      test: /玫瑰金|rose\s*gold/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceMetal(prompt, '18K 玫瑰金')
        notes.push('金属改为玫瑰金')
      },
    },
    {
      test: /白金|white\s*gold/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceMetal(prompt, '18K 白金')
        notes.push('金属改为白金')
      },
    },
    {
      test: /铂金|platinum/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceMetal(prompt, '铂金')
        notes.push('金属改为铂金')
      },
    },
    {
      test: /黄金|黄K|yellow\s*gold/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceMetal(prompt, '18K 黄金')
        notes.push('金属改为黄金')
      },
    },
    {
      test: /银|silver|925/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceMetal(prompt, '925 银')
        notes.push('金属改为银')
      },
    },
    {
      test: /钻石|diamond/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceStone(prompt, '圆形明亮式切割钻石')
        notes.push('宝石改为钻石')
      },
    },
    {
      test: /红宝石|ruby/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceStone(prompt, '红宝石')
        notes.push('宝石改为红宝石')
      },
    },
    {
      test: /蓝宝石|sapphire/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceStone(prompt, '蓝宝石')
        notes.push('宝石改为蓝宝石')
      },
    },
    {
      test: /祖母绿|emerald/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceStone(prompt, '祖母绿')
        notes.push('宝石改为祖母绿')
      },
    },
    {
      test: /珍珠|pearl/i,
      apply: () => {
        if (!hasExplicitChangeIntent(instruction)) return
        prompt = replaceStone(prompt, '海水珍珠')
        notes.push('宝石改为珍珠')
      },
    },
    {
      test: /丝绒|首饰盒|velvet|box/i,
      apply: () => {
        prompt = replaceScene(
          prompt,
          '丝绒首饰盒陈列，暖色氛围光，强调开盒仪式感',
        )
        notes.push('场景改为丝绒首饰盒')
      },
    },
    {
      test: /大理石|marble/i,
      apply: () => {
        prompt = replaceScene(
          prompt,
          '大理石台面静物陈列，柔和反射，轻奢风格',
        )
        notes.push('场景改为大理石台面')
      },
    },
    {
      test: /特写|macro|细节|镶嵌/i,
      apply: () => {
        prompt = replaceScene(
          prompt,
          '珠宝镶嵌微距特写，切面锐利，工艺细节清晰',
        )
        notes.push('场景改为镶嵌特写')
      },
    },
    {
      test: /更亮|提亮|明亮|brighter|亮一点/i,
      apply: () => {
        prompt = appendClause(
          prompt,
          '整体更明亮，提升高光与通透感',
        )
        notes.push('提高亮度')
      },
    },
    {
      test: /更暗|暗一点|低调|darker/i,
      apply: () => {
        prompt = appendClause(
          prompt,
          '整体更暗调，阴影更深，增强戏剧对比',
        )
        notes.push('降低亮度')
      },
    },
    {
      test: /更真实|写实|真实感|photoreal/i,
      apply: () => {
        prompt = appendClause(
          prompt,
          '增强写实质感，金属反射准确，商业级表现',
        )
        notes.push('增强真实感')
      },
    },
    {
      test: /去掉背景|去背景|透明背景|cutout/i,
      apply: () => {
        prompt = replaceScene(
          prompt,
          '纯白背景，无道具，主体居中，适合抠图与电商主图',
        )
        notes.push('改为干净白底')
      },
    },
  ]

  let matched = false
  for (const rule of rules) {
    if (rule.test.test(instruction)) {
      rule.apply()
      matched = true
    }
  }

  const imageType = detectPrimaryImageTypeIntent(instruction)
  if (imageType && isModelImageType(imageType)) {
    prompt = replaceScene(prompt, MODEL_TYPE_SCENE_TEXT[imageType])
    prompt = appendClauseIfMissing(prompt, '禁止生成白底静物图或纯产品陈列图')
    notes.push(`严格按${imageTypeLabel(imageType)}生成`)
    matched = true
  } else if (imageType === 'product_white') {
    prompt = replaceScene(
      prompt,
      '产品白底图：适合电商主图，主体独立展示，无模特无道具，背景干净纯白，柔光箱布光',
    )
    prompt = appendClauseIfMissing(prompt, '禁止加入人物模特与复杂场景')
    notes.push('严格按产品白底图生成')
    matched = true
  } else if (imageType === 'atmosphere') {
    prompt = replaceScene(
      prompt,
      '氛围图：品牌情境大片，强调戏剧光影、色彩层次与陈列氛围，画面高级且有故事感',
    )
    notes.push('严格按氛围图生成')
    matched = true
  }

  if (req.targetImageType) {
    prompt = applyLockedImageType(prompt, req.targetImageType)
    notes.push(`锁定目标类型：${imageTypeLabel(req.targetImageType)}`)
    matched = true
  }

  const refined = sanitizeInstruction(instruction)
  if (!matched) {
    prompt = appendClause(
      prompt,
      `按以下要求调整：${refined}`,
    )
    notes.push('已按你的说明追加调整')
  }

  // Even when rule-matched, keep user's original text as hard constraint
  if (refined) {
    prompt = appendClauseIfMissing(prompt, `必须满足：${refined}`)
  }

  if (!/保留原款轮廓|工艺细节/.test(prompt)) {
    prompt = appendClause(
      prompt,
      '保留原款轮廓、镶嵌结构与工艺细节',
    )
  }

  const summary =
    notes.length > 0
      ? `已更新：${notes.join('、')}`
      : '已根据你的说明修订提示词'

  return {
    ok: true,
    revisedPrompt: prompt,
    summary,
  }
}

function replaceMetal(prompt: string, metal: string): string {
  const next = prompt.replace(/材质为[^，,]+/g, `材质为${metal}`)
  if (next !== prompt) return next
  return appendClause(prompt, `材质为${metal}`)
}

function replaceStone(prompt: string, stone: string): string {
  let next = prompt.replace(/主石为[^，,]+/g, `主石为${stone}`)
  if (next === prompt) {
    next = prompt.replace(/无主石，素金款式/g, `主石为${stone}`)
  }
  if (next !== prompt) return next
  return appendClause(prompt, `主石为${stone}`)
}

function replaceScene(prompt: string, scene: string): string {
  const patterns = [
    /产品白底图：[^，]*(?:，[^，]+){0,6}/,
    /模特图(?:-[^，,]+)?：[^，]*(?:，[^，]+){0,6}/,
    /氛围图：[^，]*(?:，[^，]+){0,6}/,
    /纯白无缝背景[^，]*(?:，[^，]+){0,4}/,
    /真人手部佩戴展示[^，]*(?:，[^，]+){0,4}/,
    /丝绒首饰盒陈列[^，]*(?:，[^，]+){0,4}/,
    /大理石台面静物陈列[^，]*(?:，[^，]+){0,4}/,
    /杂志感暗调戏剧光[^，]*(?:，[^，]+){0,4}/,
    /珠宝镶嵌微距特写[^，]*(?:，[^，]+){0,4}/,
  ]
  for (const p of patterns) {
    if (p.test(prompt)) {
      return prompt.replace(p, scene)
    }
  }
  return appendClause(prompt, scene)
}

function appendClause(prompt: string, clause: string): string {
  const cleaned = prompt.replace(/[，,\s]+$/g, '')
  return `${cleaned}，${clause}`
}

function appendClauseIfMissing(prompt: string, clause: string): string {
  if (prompt.includes(clause)) return prompt
  return appendClause(prompt, clause)
}

function sanitizeInstruction(instruction: string): string {
  return instruction
    .replace(/请|帮我|我想|希望|改成|调整为|调整|变成/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasExplicitChangeIntent(instruction: string): boolean {
  return /改成|改为|换成|换为|调整为|改一下|改下|变成|请用|请改|替换/i.test(
    instruction,
  )
}

function detectPrimaryImageTypeIntent(
  instruction: string,
): TargetImageType | null {
  const normalized = instruction.toLowerCase()
  const candidates: Array<{
    type: TargetImageType
    index: number
  }> = [
    {
      type: 'product_white',
      index: Math.max(
        normalized.lastIndexOf('白底'),
        normalized.lastIndexOf('产品白底'),
        normalized.lastIndexOf('纯白'),
        normalized.lastIndexOf('packshot'),
        normalized.lastIndexOf('white background'),
      ),
    },
    {
      type: 'model_bracelet_bangle',
      index: Math.max(
        normalized.lastIndexOf('手链'),
        normalized.lastIndexOf('手镯'),
        normalized.lastIndexOf('手环'),
        normalized.lastIndexOf('bracelet'),
        normalized.lastIndexOf('bangle'),
      ),
    },
    {
      type: 'model_earring',
      index: Math.max(
        normalized.lastIndexOf('耳钉'),
        normalized.lastIndexOf('耳环'),
        normalized.lastIndexOf('耳坠'),
        normalized.lastIndexOf('earring'),
        normalized.lastIndexOf('stud'),
      ),
    },
    {
      type: 'model_necklace_pendant',
      index: Math.max(
        normalized.lastIndexOf('项链'),
        normalized.lastIndexOf('吊坠'),
        normalized.lastIndexOf('锁骨链'),
        normalized.lastIndexOf('necklace'),
        normalized.lastIndexOf('pendant'),
      ),
    },
    {
      type: 'model_ring',
      index: Math.max(
        normalized.lastIndexOf('戒指'),
        normalized.lastIndexOf('对戒'),
        normalized.lastIndexOf('ring'),
      ),
    },
    {
      type: 'model_set',
      index: Math.max(
        normalized.lastIndexOf('套装'),
        normalized.lastIndexOf('成套'),
        normalized.lastIndexOf('set'),
        normalized.lastIndexOf('jewelry set'),
      ),
    },
    {
      type: 'model_necklace_pendant',
      index: Math.max(
        normalized.lastIndexOf('模特'),
        normalized.lastIndexOf('佩戴'),
        normalized.lastIndexOf('model wear'),
        normalized.lastIndexOf('worn on'),
      ),
    },
    {
      type: 'atmosphere',
      index: Math.max(
        normalized.lastIndexOf('氛围'),
        normalized.lastIndexOf('大片'),
        normalized.lastIndexOf('情境'),
        normalized.lastIndexOf('campaign'),
        normalized.lastIndexOf('editorial'),
      ),
    },
  ].filter((item) => item.index >= 0)

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.index - a.index)
  return candidates[0].type
}

function applyLockedImageType(
  prompt: string,
  type: TargetImageType,
): string {
  if (isModelImageType(type)) {
    let next = replaceScene(prompt, MODEL_TYPE_SCENE_TEXT[type])
    next = appendClauseIfMissing(next, '禁止生成白底静物图或纯产品陈列图')
    return next
  }

  if (type === 'product_white') {
    let next = replaceScene(
      prompt,
      '产品白底图：适合电商主图，主体独立展示，无模特无道具，背景干净纯白，柔光箱布光',
    )
    next = appendClauseIfMissing(next, '禁止加入人物模特与复杂场景')
    return next
  }

  return replaceScene(
    prompt,
    '氛围图：品牌情境大片，强调戏剧光影、色彩层次与陈列氛围，画面高级且有故事感',
  )
}

function imageTypeLabel(type: TargetImageType): string {
  if (type === 'product_white') return '产品白底图'
  if (type === 'model_bracelet_bangle') return '模特图-手链手镯'
  if (type === 'model_earring') return '模特图-耳钉耳环'
  if (type === 'model_necklace_pendant') return '模特图-项链吊坠'
  if (type === 'model_ring') return '模特图-戒指'
  if (type === 'model_set') return '模特图-首饰套装'
  return '氛围图'
}

function isModelImageType(type: TargetImageType): boolean {
  return (
    type === 'model_bracelet_bangle' ||
    type === 'model_earring' ||
    type === 'model_necklace_pendant' ||
    type === 'model_ring' ||
    type === 'model_set'
  )
}
