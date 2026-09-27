import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const stage = document.querySelector('.hero-sticky');
const canvas = document.querySelector('.hero-canvas');
const scroller = document.querySelector('.hero-scroll');
const panels = Array.from(document.querySelectorAll('.hero-panel'));
const hint = document.querySelector('.hero-hint');
const fxBlur = document.querySelector('.hero-fx-blur');

/* ---------------------------------------------------------------
   关键帧：整页只有镜头在动（fit/focus/side/fov/turn/背景色），
   人物从头到尾都是同一个正面待机姿势 —— 不换姿势、不变身。
   fit   = 画面里容纳模型高度的比例（越小越近）
   focus = 画面中心落在模型高度的百分比（0 脚底 / 1 头顶）
   side  = 机位横向偏移
   turn  = 模型自身绕 Y 轴旋转（「转到背面」那一幕靠它）
   pose  = 站立模型的骨骼角度（度），相对静止姿势的偏移
   --------------------------------------------------------------- */
/* 唯一的姿势：整段滚动一根骨头都不碰，从头到尾保持这个站姿。
   数值是相对模型自带静止姿势的角度偏移（度），摆的是「双臂自然垂在身侧、
   手掌放松下垂」——手落到裙子外侧、手背朝外、掌心朝身体，四指放松微垂、
   指缝张开，拇指贴着食指。
   注意日文命名：「腕」是大臂、「ひじ」是小臂，真正的手腕叫「手首」。
   手臂那四行是「先把整条胳膊摆到身侧（大臂一段、小臂一段），再绕小臂
   自己的轴把手掌转正」，所以手首那两行回到 0：手腕不再被硬掰，
   掌心朝向全靠小臂这一段解决（小臂整段藏在袖子里，怎么转都看不见）。
   以后要微调，改这里的数字就行（每根骨骼 [x, y, z]）。 */
const IDLE = {
  /* 手臂：大臂 + 小臂，把双手从「张开悬空」收成贴身自然下垂 */
  '左腕': [37.08, -36.06, -15.19], '左ひじ': [116.12, -3, 72.83],
  '右腕': [37.09, 36.06, 15.19], '右ひじ': [116.12, 3, -72.83],

  /* 手腕：绕小臂自己转 42°，把手背从「侧对镜头」扳到「斜对镜头」——
     手掌还是朝身体那侧（实测掌心法线朝身体的分量 0.81），
     但正面能看见手指了。手臂整段在袖子里，转多少都看不出来。 */
  '左手首': [42, 0, 0], '右手首': [42, 0, 0],

  /* 左手四指：自然放松垂手——四指基本并拢、只留 6~8° 的自然缝，
     指尖微微往掌心弯（z 正 = 往掌心弯）。不再扇开，所以不像爪子。 */
  '左人指１': [0, 6, 9], '左人指２': [0, 0, 12], '左人指３': [0, 0, 9],
  '左中指１': [0, 0, 10], '左中指２': [0, 0, 14], '左中指３': [0, 0, 10],
  '左薬指１': [0, -6, 10], '左薬指２': [0, 0, 14], '左薬指３': [0, 0, 10],
  '左小指１': [0, -8, 10], '左小指２': [0, 0, 14], '左小指３': [0, 0, 10],
  /* 左手拇指：贴住食指外侧、指尖朝下垂，像参考立绘那样只留一道窄缝。
     y 太大（≥45）会整根缩进手掌轮廓看不见；z 不够又会让它横着戳出去。
     30/35/55 是两者之间：看得见一根、但不再像第六根手指。 */
  '左親指１': [30, 35, 55], '左親指２': [15, 17, 27],

  /* 右手是左手的镜像（y、z 取反），数值一样的道理 */
  '右人指１': [0, -6, -9], '右人指２': [0, 0, -12], '右人指３': [0, 0, -9],
  '右中指１': [0, 0, -10], '右中指２': [0, 0, -14], '右中指３': [0, 0, -10],
  '右薬指１': [0, 6, -10], '右薬指２': [0, 0, -14], '右薬指３': [0, 0, -10],
  '右小指１': [0, 8, -10], '右小指２': [0, 0, -14], '右小指３': [0, 0, -10],
  '右親指１': [30, -35, -55], '右親指２': [15, -17, -27],
};

/* 背景是一片浅海。下面每一幕给的是这套蓝的「上端色 / 下端色」两个色号，
   幕与幕之间做插值过渡：转过身背对那一幕压得最深，首尾两幕（正面）最亮，
   分镜之间的明暗呼吸就靠这个差值。要更亮/更暗只改这几个色号，
    水面上的流光不在色号里，它在下面的 shader（FLOW_GLOW / FLOW_AMOUNT）。

   和水妖这一层的关系：这几幕的色号是「她泡在水里的那一层」，
   css 里的 .hero-flow 是「退场之后整站露出来的那一层」，故意比这里再亮一档 ——
   她淡出的时候是「从偏深的蓝化进更亮的浅海」，这一眼能看出淡出；
   两边如果调成一模一样的蓝，淡出就看不见了（之前那版就是这个问题）。
   所以改色号的时候要注意保持这个「hero 比 flow 深半档」的关系。

   fit/focus 全部是「归一化」的：u 是骨骼在模型包围盒里的高度（0 脚底 / 1 最高点），
   取景和模型缩放、包围盒大小无关，所以这套数字换模型也照样能用。 */
const KEYS = [
  /* 0 「About Me」开场：整屏只放中间那组艺术字 + 打字机，不放资料卡。
     取景就是下一幕那套（fit 0.574 / focus 0.782）往后退一档 ——
     fit 从 0.574 放到 0.640，多看到约 11% 的身高；focus 原地不动，
     所以她不会上下乱跑，只是头顶那片天和脚下的裙子各多露一点。
     滚到下一幕再轻轻推近回原样，等于开场一个很缓的推镜。 */
  { at: 0.00, cam: { fit: 0.640, focus: 0.782, side: 0.00, fov: 34 }, turn: 0,
      bg: 0x4fb4da, bg2: 0x2d88b3 },

  /* 1 半身正面：第一张资料卡。镜头按「头顶留 1/8 空白、下沿切到大腿二分之一」
     解出来的 fit/focus（用骨骼量的大腿中点当标尺，误差 0.3px 以内）。不加黑色滤镜。 */
  { at: 0.20, cam: { fit: 0.574, focus: 0.782, side: 0.00, fov: 34 }, turn: 0,
      bg: 0x4fb4da, bg2: 0x2d88b3 },

  /* 2 右下仰视脸部特写：取景跟以前那版脸部特写同一套（fit/focus 没动），
     只是把机位压到注视点的斜下方 —— elev 是负的，镜头自然就往上仰；
     yaw 负值把机位绕到她的右前方，所以是「右下往上看」。
     lookZ 把注视点挪到脸前面（不挪的话仰拍会框到脖子）。配虚化 + 黑色滤镜。
     yaw/elev 是按「仰角压得太狠了」往回收过一档的（-0.30/-0.17 → -0.33/-0.13）。 */
  { at: 0.40, cam: { fit: 0.170, focus: 0.884, side: 0.00, fov: 34, yaw: -0.33, elev: -0.13, lookZ: 0.090, lookX: 0.02 },
      turn: 0, bg: 0x49abd4, bg2: 0x2880ab, fx: 1, shade: 1 },

  /* 3 半身背面：取景跟半身正面同一套数字（一样只露到大腿二分之一），
     背景在这一幕压得最暗，黑色滤镜继续开着。 */
  { at: 0.60, cam: { fit: 0.574, focus: 0.782, side: 0.00, fov: 34 }, turn: Math.PI,
      bg: 0x419cc6, bg2: 0x22759f, shade: 1 },

  /* 4 左上角俯拍脸部特写：yaw 取正值，把机位绕到她的左前方（取负值就跑到右前方，
     那样就跟上一幕的「右下仰视」挤在同一侧了）—— 跟「右下仰视」正好错开一个对角，
     滚动时镜头走的是右下 → 左上这条对角线。
     elev 把机位抬到注视点上方 0.26 个身高，框住头 + 肩（按「压得太狠了」回收过一档）。
     lookZ 0.10 把注视点往前挪到头的位置（不挪的话脸会被推到画面右下角），
     lookX 0.04 再把注视点往她的左手侧带一点，人就被挤到画面左上角、
     给右下角的面板腾出地方。虚化 + 黑色滤镜都开着。 */
  { at: 0.80, cam: { fit: 0.240, focus: 0.870, side: 0.00, fov: 34, yaw: 0.21, elev: 0.26, lookZ: 0.100, lookX: 0.04 },
      turn: Math.PI * 2, bg: 0x4aadd2, bg2: 0x297fab, fx: 1, shade: 1 },

  /* 5 正面脸部特写收尾：转回正面、正对她，取景按「脸在画面正中、整个头完整
     入画」量的 —— 左右眼骨头的中点在横向正中（偏差 0px），眼睛那一行在纵向
     47.8%（略高于中线），头顶 11.2%、下巴到脖子那一线 74.1%，头占画面高度
     58.2%，下巴以下留出肩颈给画面收尾。
     这些数字来自「把模型藏起来截图相减」量的真实像素边界 + 骨头投影行号，
     换模型、改姿势或改景别都得重量一遍，工具：work/model-tools/act5fit.js。
     虚化和黑色滤镜都在这里收掉，画面干净地交给下面的博客。 */
  { at: 1.00, cam: { fit: 0.3200, focus: 0.8930, side: 0.00, fov: 34 }, turn: Math.PI * 2,
      bg: 0x4fb4da, bg2: 0x2d88b3 },
];

/* 流光的两个旋钮：GLOW 是光的颜色（偏青的冷白，像阳光穿到水里的那种白，
   浅海版把它调得更白更淡了一档 —— 水浅的时候亮部是发白的，不是发青的），
   AMOUNT 是总强度 —— 调到 0 就退回一片干净的蓝渐变，什么都不剩。
   觉得太素就往上加（1.4 左右已经很显眼），觉得吵就减到 0.6。
   底色调亮之后，光的对比本来会被拉平，所以 AMOUNT 跟着提了一点。 */
const FLOW_GLOW = 0x9ceaff;
const FLOW_AMOUNT = 1.2;
/* 黑夜模式的三个旋钮（右下角那个月亮钮切换）：
   DARK_BG   —— 整片海压深到原来的多少（三个色号一起乘，色相不变）
   DARK_FLOW —— 水面流光在黑天留几成（夜里那点光其实更好看，所以留得不少）
   要注意保持「hero 这层比 css 里的 .hero-flow 深」这个关系（白天也是这么定的），
   不然滚到最后淡出那一瞬就看不出来了。黑天的 .hero-flow 在 hero.css 的
   html.hb-dark .hero-flow 那一条里，这两个数得一起调。 */
const DARK_BG = 0.30;
const DARK_FLOW = 0.70;
/* 六幕，每幕正好占 0.20。第一张资料卡的圆心跟第 1 幕的机位对齐（0.20），
   开场那幕（0.02）是纯艺术字、没有卡片。 */
const PANEL_CENTERS = [0.02, 0.20, 0.40, 0.60, 0.80, 0.97];
/* 资料卡的不透明度：正落在那一幕前后 PANEL_SOLID 这一段里全都「完全显示」，
   出了平台再往外到 PANEL_SPAN 之间平滑淡出。两幕现在间隔 0.20，所以
   SOLID / SPAN 都按老版本的比例缩了一档（0.075/0.135 → 0.07/0.115），
   免得卡片赖在原地不走；PANEL_SPAN 比一半（0.10）略大，于是前一张还没淡完
   后一张就开始淡入、两张卡刚好交叉过渡，中间任何时候都至少有一张卡挂着。
   以前只有一条从中心一路斜到零的坡，等于只有正正好好滚到那一幕才 100%，
    稍微滚过头就开始变淡 —— 所以才会「只有某些角度才看得全」。 */
const PANEL_SOLID = 0.07;
const PANEL_SPAN = 0.115;

/* 虚化（--fx）不走关键帧线性插值——那样会拖出很长的尾巴，
   从上一幕一路糊到下一幕。改成以「带 fx 的那一幕」为中心的钟形窗口：
   正落在那一幕最强，前后各 FX_WINDOW 归零。 */
const FX_WINDOW = 0.12;
function fxAt(px) {
  let v = 0;
  KEYS.forEach((k) => {
    if (!k.fx) return;
    const d = Math.abs(px - k.at) / FX_WINDOW;
    if (d < 1) v = Math.max(v, k.fx * (0.5 + 0.5 * Math.cos(Math.PI * d)));
  });
  return v;
}

/* 黑色滤镜（--shade）跟虚化分开算：它是「一段连续的开关」（第 2、3、4 幕开着，
   首尾两幕关掉），不是一个点，所以直接在关键帧之间线性插值，滚到哪就是哪。 */
function shadeAt(a, b, t) {
  return (a.shade || 0) + ((b.shade || 0) - (a.shade || 0)) * t;
}

const deg = THREE.MathUtils.degToRad;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* 只有一套模型：常服站姿，从头到尾都是它。 */
const MODEL_DEFS = [{ id: 'stand', url: '/assets/model.glb' }];
const ACTORS = {};

let renderer, scene, camera, shadowPlane, skyMat;
let box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3();
let bgColor = new THREE.Color(KEYS[0].bg), targetBg = new THREE.Color(KEYS[0].bg);
let bgTop = new THREE.Color(KEYS[0].bg), bgBot = new THREE.Color(KEYS[0].bg2);
let targetBgTop = new THREE.Color(KEYS[0].bg), targetBgBot = new THREE.Color(KEYS[0].bg2);
let progress = 0, target = 0, ready = false, frozen = null;
let mouse = { x: 0, y: 0 }, mouseSmooth = { x: 0, y: 0 };
/* eyeSmooth 是「眼球追踪用的指针位置」，比镜头视差的平滑跟得更紧一点：
   视差要慢（镜头晃快了会晕），眼珠要快（慢了就觉得没跟着指针）。 */
let eyeSmooth = { x: 0, y: 0 };
/* 镜头特效已经写出去的强度（--fx 虚化 / --shade 黑色滤镜）、滑动速度 /
   当前动态模糊半径，还有「不含鼠标视差」的机位。 */
let lastFx = -1, lastShade = -1, scrollVel = 0, blurNow = 0, lastTarget = 0;
const camBase = new THREE.Vector3();

/* ---------------------------------------------------------------
   惯性滚动（Lenis）：greymac 用的就是它，转场「顺滑」的那一半全靠这个。
   原生滚轮是一格一跳（一跳上百像素），相机在后面追，观感就是「涩」。
   Lenis 拦下滚轮，把 scrollY 本身抹成一条连续的曲线再交给浏览器，
   于是页面位移、相机、白卡三者是同一条曲线上的东西，不会互相打架。
   它自带的 rAF 关掉（autoRaf:false），改由下面这条已有的渲染循环推 ——
   一页只跑一个循环，不用两条抢帧。
   系统设置里勾了「减弱动态效果」就不装，老老实实用原生滚动。
   --------------------------------------------------------------- */
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let lenis = null;
if (!reduced && typeof window.Lenis === 'function') {
  lenis = new window.Lenis({
    /* 0.1 就是 Lenis 的默认阻尼，也是 greymac 那档手感：
       一帧追 10% 的差值，滚轮松手后还会滑一小段再停。 */
    lerp: 0.1,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    smoothWheel: true,
    autoRaf: false,
  });
}

/* 退场淡出：分镜走完（progress 到 1）之后，这屏像 greymac 一样「原地淡掉」——
   位置焊死不动，只把整层 opacity 收掉。长度见下面的 FADE_SPAN。
   Lenis 开着的时候 scrollY 已经被抹顺了，这里就不必再叠阻尼，
   把追加速度提上去，等于只留 Lenis 那一层平滑（双阻尼会跟手差半拍）。 */
const PROG_LERP = lenis ? 22 : 7;
/* 退场淡出占几屏。0.5 = 分镜一走完就开始淡，滚过半屏正好淡干净。
   这个数只有两个地方用：下面 frame() 里算淡出进度，以及「整屏淡完之后
   把 3D 渲染停掉」的判定 —— 两处必须是同一个数，所以提到这儿来。 */
const FADE_SPAN = 0.50;
let lastStageOpacity = -1;
/* 上一帧是不是黑夜模式。用来判断「这一帧刚切了主题」，见下面 frame() 里那段。 */
let lastDarkState = document.documentElement.classList.contains('hb-dark');
/* 眨眼状态：blinkT 是这次眨眼已经过去的时间（-1 = 没在眨），
   blinkNext 是距离下一次眨眼的秒数，blinkQueue 是还要再连眨几下。 */
const BLINK_DEPTH = 0.98;
let blinkValue = 0, blinkNext = 1.6 + Math.random() * 2.4;
let blinkT = -1, blinkLen = 0.2, blinkQueue = 0, blinkOverride = null;

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  scene = new THREE.Scene();
  scene.background = bgColor;
  camera = new THREE.PerspectiveCamera(KEYS[0].cam.fov, 16 / 9, 0.05, 200);

  /* 深海背景。所有东西都按「投影后的屏幕坐标」算（vX/vY，各自 -1..1），
     所以永远是贴着屏幕的一大片水，镜头怎么绕、模型怎么转，水都不会跑位。
     三层叠在一起：
       1) 基础水色：上端 uTop、下端 uBot，每幕一套，幕间插值（这就是呼吸感）
       2) 暗涌：四道不同方向/速度的正弦叠出来的 caustic，周期长到看不出重复
       3) 流光：两条上下漂移的亮带 + 三道斜着扫过去的细光柱
     2 和 3 的强度统一乘在 uFlow 上，uFlow = 0 时就只剩 1 的干净渐变。
     uAspect 参与坐标计算，是为了让纹路在宽屏上不会被拉扁。 */
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: {
      uTop: { value: new THREE.Color(KEYS[0].bg) },
      uBot: { value: new THREE.Color(KEYS[0].bg2) },
      uGlow: { value: new THREE.Color(FLOW_GLOW) },
      uTime: { value: 0 },
      uFlow: { value: FLOW_AMOUNT },
      uAspect: { value: 16 / 9 },
    },
    vertexShader: [
      'varying float vX; varying float vY;',
      'void main() {',
      '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  float w = max(1e-4, p.w);',
      '  vX = p.x / w; vY = p.y / w;',
      '  gl_Position = p;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uGlow;',
      'uniform float uTime; uniform float uFlow; uniform float uAspect;',
      'varying float vX; varying float vY;',
      '',
      '/* 线性 -> sRGB 的输出转换。',
      '   色号是按 sRGB 写的（new THREE.Color(0x...) 会把它转成线性工作空间），',
      '   而自定义 ShaderMaterial 不会像内置材质那样自动带上 colorspace 转换，',
      '   所以这里必须自己补一道。少这一道，整片水就被当成线性值直接写进帧缓冲，',
      '   亮度大约只剩一半 —— 这就是之前「色号怎么调都发黑」的真正原因。',
      '   下面这条式子和 three 内置的 sRGBTransferOETF 完全一致。 */',
      'vec3 lin2srgb(vec3 c) {',
      '  vec3 lo = c * 12.92;',
      '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055;',
      '  return mix(hi, lo, step(c, vec3(0.0031308)));',
      '}',
      '',
      '/* 四道正弦叠出来的水面暗涌：不是循环动画，看不出接缝 */',
      'float caustic(vec2 p, float t) {',
      '  float v = sin(p.x * 1.70 + t * 0.62);',
      '  v += sin(p.y * 2.35 - t * 0.47);',
      '  v += sin((p.x + p.y) * 1.30 + t * 0.34);',
      '  v += sin((p.x - p.y * 1.40) * 2.05 - t * 0.26);',
      '  return v * 0.25;',
      '}',
      '',
      'void main() {',
      '  float h = clamp(vY * 0.5 + 0.5, 0.0, 1.0);',
      '  vec3 col = mix(uBot, uTop, pow(h, 0.85));',
      '  float t = uTime;',
      '  vec2 sp = vec2((vX * 0.5 + 0.5) * uAspect, h);',
      '',
      '  /* 暗涌 */',
      '  float ca = caustic(sp * vec2(2.6, 2.2), t * 0.85);',
      '  float glow = smoothstep(0.10, 0.95, ca);',
      '',
      '  /* 两条亮带：各自缓慢上下漂，像水面的反光落到某个高度上 */',
      '  float y1 = 0.58 + 0.30 * sin(t * 0.050);',
      '  float y2 = 0.26 + 0.26 * sin(t * 0.037 + 2.1);',
      '  float d1 = (h - y1) * 7.0;',
      '  float d2 = (h - y2) * 9.5;',
      '  float b1 = exp(-d1 * d1);',
      '  float b2 = exp(-d2 * d2);',
      '',
      '  /* 三道斜向光柱，水下那种 */',
      '  float rays = 0.0;',
      '  for (int i = 0; i < 3; i++) {',
      '    float fi = float(i);',
      '    float x = fract(sp.x * 0.55 + h * 0.30 + fi * 0.37 + t * 0.012);',
      '    float c = 0.18 + fi * 0.30 + 0.05 * sin(t * 0.11 + fi * 2.3);',
      '    float dr = (x - c) * 12.0;',
      '    rays += exp(-dr * dr);',
      '  }',
      '',
      '  col += uGlow * ((glow * 0.16) + (b1 + b2) * 0.20 + rays * 0.075) * uFlow;',
      '  gl_FragColor = vec4(lin2srgb(col), 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyMat);
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  const key = new THREE.DirectionalLight(0xfff4e2, 1.75); key.position.set(0.7, 1.2, 1.7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdce8ff, 0.42); fill.position.set(-1.5, 0.7, 0.9); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbfe6ff, 0.8); rim.position.set(-0.9, 1.4, -1.7); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaebfd0, 0.75));
}

function makeShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 126);
  /* 白棚地面上的接触阴影：中性冷灰，不用带绿的旧色 */
  rg.addColorStop(0, 'rgba(56,60,68,0.28)');
  rg.addColorStop(0.55, 'rgba(56,60,68,0.10)');
  rg.addColorStop(1, 'rgba(56,60,68,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -----------------------------------------------------------------
   模型自带的三张明暗色阶（skin.bmp / hair.bmp / toon_defo.bmp 实测值）。
   MMD 的色阶几乎不压暗，只在背光那一侧染一点点颜色 —— 皮肤看着干净透亮
   就是靠这个。之前用同一条灰色阶套所有材质，皮肤才会发灰发脏。
   s = 0 完全背光，s = 1 正对光源。
   ----------------------------------------------------------------- */
const RAMP_DEF = {
  skin: { shadow: [253, 226, 220], edge: 0.24 },  // skin.bmp    暖粉，几乎不暗
  hair: { shadow: [180, 195, 205], edge: 0.23 },  // hair.bmp    冷灰蓝
  toon: { shadow: [202, 201, 211], edge: 0.45 },  // toon_defo   淡紫灰
  flat: { shadow: [255, 255, 255], edge: 1.00 },  // 眼睛：不吃光
};
/* 每个图元用哪条色阶。key = 三角面数，取自原始 PMX 的材质表，
   和模型里的 36 个图元一一对应。 */
const RAMP_BY_TRIS = {
  1964: 'skin', 1214: 'skin', 456: 'skin', 4918: 'skin', 4216: 'skin',
  698: 'hair', 3845: 'hair', 8334: 'hair', 12179: 'hair',
  192: 'flat', 200: 'flat', 156: 'flat', 64: 'flat',
};
const ramps = {};

function makeRamp(spec) {
  const N = 64, [r, g, b] = spec.shadow;
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = Math.min(1, (i / (N - 1)) / spec.edge);
    data[i * 4] = r + (255 - r) * t;
    data[i * 4 + 1] = g + (255 - g) * t;
    data[i * 4 + 2] = b + (255 - b) * t;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/* -----------------------------------------------------------------
   微笑。

   这个模型没有「口型」骨骼，嘴也不是几何体 —— 它是画在脸贴图上的一条
   细线：材质「颜 / 颜2」共用的那张 2048×2048 贴图，正中央偏上，
   x 954–1093 / y 1341–1347，一条笔直的横线，也就是一张没有表情的嘴。

   所以想让她笑，只有一条路：改这几个像素。先把原来那条直线抹掉 ——
   不涂色，而是拿它上下两行干净的皮肤竖向插值补平，这样脸颊上那层暖
   色渐变能原样留住；再照着原图取的颜色，重画一条「两头翘、中间略低」
   的弧线。眼睛那一片一个像素都不碰。

   （模型自带的表情里只有一个「笑い」，实测那是动眼睛的 —— 眼睛会弯成
   月牙。要的是嘴笑眼不笑，所以那个 morph 一个都不用。）

   amount 就是微笑强度：1 = 正常微笑，0 = 恢复成原来的直线。
   ----------------------------------------------------------------- */
const SMILE = {
  cx: 1024, half: 74,          // 嘴的中线 / 半宽（贴图像素）
  baseY: 1347, rise: 30,       // 弧线最低点 / 嘴角相对中间抬高的量
  thMid: 2.6, thEnd: 3.4,      // 中间 / 两端 的线粗
  cMid: [188, 132, 132],       // 中间的颜色（从原嘴线取的色）
  cEnd: [118, 76, 76],         // 两端的颜色（原嘴线两端更深一点）
  x0: 946, x1: 1102,           // 原嘴线要抹掉的范围
  y0: 1326, y1: 1364,
  amount: 1,
};
const smileCache = new Map();  // 原贴图 → 改好的贴图（同一张只做一次）
const smileItems = [];         // 用来事后改强度：{ img, cv, tex }

const sstep = (e0, e1, v) => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function paintSmile(cv, img) {
  const W = cv.width, H = cv.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const at = (x, y) => (y * W + x) * 4;

  // 1) 抹掉原来的嘴线：用上下两行干净皮肤竖向插值，把这块补成皮肤
  for (let x = SMILE.x0; x <= SMILE.x1; x++) {
    const it = at(x, SMILE.y0 - 1), ib = at(x, SMILE.y1 + 1);
    const span = SMILE.y1 - SMILE.y0 + 2;
    for (let y = SMILE.y0; y <= SMILE.y1; y++) {
      const t = (y - SMILE.y0 + 1) / span, i = at(x, y);
      for (let c = 0; c < 3; c++) d[i + c] = d[it + c] + (d[ib + c] - d[it + c]) * t;
    }
  }

  // 2) 重画一条上扬的弧：两头翘起来，中间略微下沉
  for (let x = SMILE.cx - SMILE.half - 4; x <= SMILE.cx + SMILE.half + 4; x++) {
    if (x < 0 || x >= W) continue;
    const u = clamp((x - SMILE.cx) / SMILE.half, -1, 1), w = u * u;
    const yc = SMILE.baseY - SMILE.rise * SMILE.amount * w;
    const th = SMILE.thMid + (SMILE.thEnd - SMILE.thMid) * w;
    const fade = 1 - sstep(0.93, 1, Math.abs(u));
    for (let y = Math.floor(yc - th - 3); y <= Math.ceil(yc + th + 3); y++) {
      if (y < 0 || y >= H) continue;
      const a = (1 - sstep(0.45, 1, Math.abs(y - yc) / th)) * fade;
      if (a < 0.004) continue;
      const i = at(x, y);
      for (let c = 0; c < 3; c++) {
        d[i + c] += (SMILE.cEnd[c] + (SMILE.cMid[c] - SMILE.cEnd[c]) * (1 - w) - d[i + c]) * a;
      }
    }
  }
  ctx.putImageData(id, 0, 0);
}

function smileTexture(src) {
  const img = src && src.image;
  if (!img || !img.width) return src;
  if (smileCache.has(img)) return smileCache.get(img);
  let tex = src;
  try {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    paintSmile(cv, img);
    tex = new THREE.CanvasTexture(cv);
    // 贴图的所有取样参数照抄原图 —— 尤其 flipY，glTF 的贴图是 false，
    // 抄错的话整张脸会上下翻过来。
    tex.colorSpace = src.colorSpace;
    tex.flipY = src.flipY;
    tex.wrapS = src.wrapS; tex.wrapT = src.wrapT;
    tex.offset.copy(src.offset); tex.repeat.copy(src.repeat);
    tex.minFilter = src.minFilter; tex.magFilter = src.magFilter;
    tex.anisotropy = src.anisotropy;
    tex.needsUpdate = true;
    smileItems.push({ img, cv, tex });
  } catch (e) { tex = src; }
  smileCache.set(img, tex);
  return tex;
}

function setSmile(amount, rise) {
  if (rise != null) SMILE.rise = rise;
  SMILE.amount = clamp(amount, 0, 1);
  smileItems.forEach((it) => { paintSmile(it.cv, it.img); it.tex.needsUpdate = true; });
  return SMILE.amount;
}

function toonify(root, actor) {
  root.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    o.frustumCulled = false;
    const tris = o.geometry.index ? o.geometry.index.count / 3 : 0;
    const key = RAMP_BY_TRIS[tris] || 'toon';
    if (!ramps[key]) ramps[key] = makeRamp(RAMP_DEF[key]);

    const src = Array.isArray(o.material) ? o.material : [o.material];
    const made = src.map((m) => {
      // 脸贴图（颜 / 颜2 共用同一张 2048²）换成「微笑版」：只动嘴上那几个像素
      const faceMap = (m.map && /^颜/.test(m.name || '')) ? smileTexture(m.map) : m.map;
      const mat = new THREE.MeshToonMaterial({
        name: m.name, map: faceMap, color: m.color.clone(), gradientMap: ramps[key],
        alphaTest: m.alphaTest || 0, transparent: m.transparent, opacity: m.opacity, side: m.side,
      });
      // 色阶默认只取红通道，会把暖色阴影压成灰的，这里改成整条 RGB
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          'return vec3( texture2D( gradientMap, coord ).r );',
          'return texture2D( gradientMap, coord ).rgb;'
        );
      };
      mat.customProgramCacheKey = () => 'mmd-ramp-rgb';
      return mat;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
    if (o.morphTargetDictionary) actor.morphMeshes.push(o);
  });
}

const MODEL_SCALE = 0.115;

/* -----------------------------------------------------------------
   颈饰防穿模。脖子周围那几块装饰（灰色颈带、棕色皮颈带、白花瓣领片、
   领口小宝石）在脖子最细的那一段半径和皮肤几乎重合，正面看会有一小截
   切进脖子。这里在「颈部高度带」里把这几块网格的顶点沿水平方向整体
   往外推一点，越靠近高度带的上下边界推力越小 —— 渐隐过渡，颈带边缘
   不会起折角。只动水平方向、高度不变，骨骼/姿势/镜头/材质全都不碰。
   坐标是模型自身的几何坐标；网格名来自 model.glb 的导出命名。
   ----------------------------------------------------------------- */
const NECK_FIX = {
  meshes: ['mesh_0_32', 'mesh_0_33', 'mesh_0_34'],
  y0: 0.605, y1: 0.715,   // 颈部高度带
  ramp: 0.020,            // 上下各留 0.02 渐隐
  amp: 0.014,             // 最大外推量
  axisZ: 0.216,           // 脖子在水平面上的轴心
  minR: 0.005,            // 太靠近轴心的顶点不动，防止中心点乱飞
};

function relieveNeckCollars(root, opt) {
  const f = Object.assign({}, NECK_FIX, opt || {});
  root.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    if (f.meshes.indexOf(o.name) < 0) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y <= f.y0 - f.ramp || y >= f.y1 + f.ramp) continue;
      const w = y < f.y0 ? (y - (f.y0 - f.ramp)) / f.ramp
        : (y > f.y1 ? ((f.y1 + f.ramp) - y) / f.ramp : 1);
      const dx = pos.getX(i), dz = pos.getZ(i) - f.axisZ;
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r < f.minR) continue;
      const k = 1 + (f.amp * w) / r;
      pos.setX(i, dx * k);
      pos.setZ(i, f.axisZ + dz * k);
    }
    pos.needsUpdate = true;
    o.geometry.computeBoundingSphere();
  });
}

/* -----------------------------------------------------------------
   颈饰「隐形件」清理。脖子这一圈其实是两层叠着的：灰色颈带/胸饰
   （mesh_0_32）和一层白花瓣领片（mesh_0_34）。领片在素材里就是全透明的
   （不透明度 0），但它照样参与渲染、照样往深度里写值 —— 于是它自己看不见，
   却把之后画的颈带和皮肤沿自己的轮廓「咬」出一圈锯齿缺口，某些角度看就
   像颈饰切进了脖子/锁骨。
   这里做两件事：把那个全透明的件彻底关掉（它本来就画不出来，画面上零变化）；
   再让颈带按不透明绘制，排进不透明批次先画，就不会再被透明件的深度碰到。
   颈带贴图里没有任何半透明像素，所以这一步只是换了绘制顺序，颜色不变。
   想还原：把 NECK_HIDE 清空、NECK_OPAQUE 清空即可。
   ----------------------------------------------------------------- */
const NECK_HIDE = ['mesh_0_34'];
const NECK_OPAQUE = ['mesh_0_32'];

function settleNeckLayers(root) {
  root.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    if (NECK_HIDE.indexOf(o.name) >= 0) { o.visible = false; return; }
    if (NECK_OPAQUE.indexOf(o.name) < 0) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      m.transparent = false;
      m.alphaTest = 0.5;
      m.depthWrite = true;
      m.needsUpdate = true;
    });
  });
}

/* 蒙皮模型的 Box3.setFromObject 走的是骨骼世界矩阵，量出来的是「模型自身坐标系」里的
   范围，跟模型缩放无关。所以先量、再乘缩放，得到的才是场景里的真实尺寸。 */
function measureActor(a) {
  a.model.scale.setScalar(1);
  a.model.updateMatrixWorld(true);
  a.box.setFromObject(a.model);
  a.box.min.multiplyScalar(MODEL_SCALE);
  a.box.max.multiplyScalar(MODEL_SCALE);
  a.model.scale.setScalar(MODEL_SCALE);
  a.size.copy(a.box.getSize(new THREE.Vector3()));
  a.center.copy(a.box.getCenter(new THREE.Vector3()));
}

function measure() {
  Object.values(ACTORS).forEach(measureActor);

  const s = ACTORS.stand;
  shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(s.size.x * 1.5, s.size.z * 3.2),
    new THREE.MeshBasicMaterial({ map: makeShadow(), transparent: true, depthWrite: false })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(s.center.x, s.box.min.y + 0.001, s.center.z);
  scene.add(shadowPlane);

  /* 只有一套模型，镜头计算用的包围盒直接取它 */
  box.copy(s.box);
  size.copy(s.size);
  center.copy(s.center);
}

function camFor(cam, turn) {
  const dist = (cam.fit * size.y * 0.5) / Math.tan(deg(cam.fov) * 0.5) * 1.12;
  const focusY = box.min.y + size.y * cam.focus;
  /* 鼠标视差跟着当前景别走：不管推得多近，位移都只占画面的 5%（横）/ 2.5%（纵），
     所以特写的时候也不会“一晃就飞出去”。 */
  const visH = cam.fit * size.y * 1.12;
  const visW = visH * camera.aspect;
  const lat = size.y * cam.side * 0.5 + mouseSmooth.x * visW * 0.05;
  const up = mouseSmooth.y * visH * 0.025;
  /* 机位可以额外绕 Y 轴转一个方位角 yaw（0 = 正对模型正面），并抬到注视点上方
     elev × 模型高度（抬起来之后 lookAt 还是盯着注视点，所以视角自然就往下压）。
     base 是「不含鼠标视差」的那个机位——眼球跟随要用它当原点，见 updateEyeLook。 */
  const yaw = cam.yaw || 0;
  const elev = (cam.elev || 0) * size.y;
  /* lookX / lookZ 把「注视点」从包围盒中心挪开（模型高度的倍数）。
     头并不在包围盒中心的正上方——它在 z 上往前偏 0.11 个身高，
     所以绕到侧上方俯拍时要把注视点挪到头上去，不然脸会被推到画面角上。 */
  const look = new THREE.Vector3(center.x + (cam.lookX || 0) * size.y, focusY, center.z + (cam.lookZ || 0) * size.y);
  const sa = Math.sin(yaw), ca = Math.cos(yaw);
  const bx = look.x + sa * dist + lat * ca;
  const bz = look.z + ca * dist - lat * sa;
  const by = look.y + elev;
  return {
    pos: new THREE.Vector3(bx, by + up, bz),
    base: new THREE.Vector3(bx, by, bz),
    look,
    fov: cam.fov,
  };
}

/* 把一组骨骼角度写到某个模型上；两套模型骨骼名不同，各自缺的会自动跳过 */
function poseTrack(actor, pa, pb, t) {
  if (!actor) return;
  pa = pa || {}; pb = pb || {};
  const bones = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  bones.forEach((n) => {
    const bone = actor.boneMap.get(n); if (!bone) return;
    const rest = actor.restRot.get(n) || { x: 0, y: 0, z: 0 };
    const p = pa[n] || [0, 0, 0], q = pb[n] || [0, 0, 0];
    bone.rotation.set(
      rest.x + deg(p[0] + (q[0] - p[0]) * t),
      rest.y + deg(p[1] + (q[1] - p[1]) * t),
      rest.z + deg(p[2] + (q[2] - p[2]) * t)
    );
  });
}

function applyKey(px) {
  let i = 0;
  while (i < KEYS.length - 2 && px > KEYS[i + 1].at) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const span = Math.max(1e-6, b.at - a.at);
  const t = easeInOut(clamp((px - a.at) / span, 0, 1));

  const cam = {
    fit: a.cam.fit + (b.cam.fit - a.cam.fit) * t,
    focus: a.cam.focus + (b.cam.focus - a.cam.focus) * t,
    side: a.cam.side + (b.cam.side - a.cam.side) * t,
    fov: a.cam.fov + (b.cam.fov - a.cam.fov) * t,
    yaw: (a.cam.yaw || 0) + ((b.cam.yaw || 0) - (a.cam.yaw || 0)) * t,
    elev: (a.cam.elev || 0) + ((b.cam.elev || 0) - (a.cam.elev || 0)) * t,
    /* 注视点偏移也必须一起插值 —— 漏了这两行的话 camFor 里读到的永远是
       undefined（= 0），第 4 幕「把注视点挪到头上去」等于没写。 */
    lookX: (a.cam.lookX || 0) + ((b.cam.lookX || 0) - (a.cam.lookX || 0)) * t,
    lookZ: (a.cam.lookZ || 0) + ((b.cam.lookZ || 0) - (a.cam.lookZ || 0)) * t,
  };
  const turn = a.turn + (b.turn - a.turn) * t;
  targetBg.setHex(a.bg).lerp(new THREE.Color(b.bg), t);
  targetBgTop.setHex(a.bg).lerp(new THREE.Color(b.bg), t);
  targetBgBot.setHex(a.bg2).lerp(new THREE.Color(b.bg2), t);
  /* 黑天：三个色号一起压深。乘完再往下走，所以插值、淡出这些都不受影响 —— 
     只有「这一帧的目标颜色」被换掉了，其余逻辑一行没动。 */
  if (document.documentElement.classList.contains('hb-dark')) {
    targetBg.multiplyScalar(DARK_BG);
    targetBgTop.multiplyScalar(DARK_BG);
    targetBgBot.multiplyScalar(DARK_BG);
  }

  poseTrack(ACTORS.stand, a.pose || IDLE, b.pose || IDLE, t);

  const morphNames = new Set([...Object.keys(a.morph || {}), ...Object.keys(b.morph || {})]);
  Object.values(ACTORS).forEach((actor) => {
    actor.morphMeshes.forEach((mesh) => {
      Object.keys(mesh.morphTargetDictionary).forEach((name) => {
        const idx = mesh.morphTargetDictionary[name];
        let v = 0;
        if (morphNames.has(name)) {
          const p = (a.morph && a.morph[name]) || 0, q = (b.morph && b.morph[name]) || 0;
          v = p + (q - p) * t;
        }
        if (name === 'まばたき') v = Math.max(v, blinkValue);
        mesh.morphTargetInfluences[idx] = v;
      });
    });
  });

  Object.values(ACTORS).forEach((actor) => { actor.model.rotation.y = turn; });
  const c = camFor(cam, turn);
  camera.position.copy(c.pos);
  camBase.copy(c.base);
  camera.lookAt(c.look);
  if (Math.abs(camera.fov - cam.fov) > 1e-4) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

  /* 镜头特效的强度：写在 .hero-sticky 的 --fx（虚化）和 --shade（黑色滤镜）上，
     CSS 那边拿它们算两层各自的不透明度。
     值没怎么变就不写，免得每帧都触发一次样式重算。 */
  const fx = fxAt(px);
  if (Math.abs(fx - lastFx) > 0.002) {
    lastFx = fx;
    if (stage) stage.style.setProperty('--fx', fx.toFixed(3));
    /* 虚化那层是全屏 backdrop-filter，属于最贵的合成之一。
       六幕里只有两幕用到它，强度归零的时候直接把它从渲染树里摘掉，
       不然滚动全程都在白糊一整屏 —— 这是「滑动发涩」的一大来源。 */
    if (fxBlur) fxBlur.style.display = fx < 0.01 ? 'none' : '';
  }
  const shade = shadeAt(a, b, t);
  if (stage && Math.abs(shade - lastShade) > 0.002) { lastShade = shade; stage.style.setProperty('--shade', shade.toFixed(3)); }

  panels.forEach((el, k) => {
    const d = Math.abs(px - PANEL_CENTERS[k]);
    const o = d <= PANEL_SOLID ? 1
      : clamp(1 - (d - PANEL_SOLID) / (PANEL_SPAN - PANEL_SOLID), 0, 1);
    el.style.opacity = o.toFixed(3);
    el.style.transform = 'translateY(' + ((1 - o) * 18).toFixed(1) + 'px)';
    /* 资料卡也是磨砂（backdrop-filter），看不见的那几张留着照样要算。
       彻底收掉之后把整棵子树藏起来。 */
    el.style.visibility = o < 0.005 ? 'hidden' : '';
  });
  if (hint) hint.style.opacity = String(clamp(1 - px * 8, 0, 0.85));
}

/* -----------------------------------------------------------------
   眨眼：用一条连续曲线代替以前的「睁 → 闭 → 睁」两帧硬切。
   闭合快、中间微停、睁开稍慢，偶尔还会连眨两下。
   ----------------------------------------------------------------- */
const BLINK_CLOSE = 0.40;
const BLINK_HOLD = 0.14;

function blinkCurve(t) {
  if (t < BLINK_CLOSE) {
    const u = t / BLINK_CLOSE;
    return u * u * (3 - 2 * u);
  }
  if (t < BLINK_CLOSE + BLINK_HOLD) return 1;
  const u = (t - BLINK_CLOSE - BLINK_HOLD) / (1 - BLINK_CLOSE - BLINK_HOLD);
  return 1 - u * u * (3 - 2 * u);
}

function updateBlink(dt) {
  if (blinkOverride !== null) { blinkValue = blinkOverride; return; }
  if (blinkT >= 0) {
    blinkT += dt;
    if (blinkT >= blinkLen) {
      blinkT = -1;
      blinkValue = 0;
      if (blinkQueue > 0) {
        blinkQueue--;
        blinkNext = 0.11 + Math.random() * 0.07;
      } else {
        blinkNext = 2.4 + Math.random() * 3.6;
      }
    } else {
      blinkValue = blinkCurve(blinkT / blinkLen) * BLINK_DEPTH;
    }
    return;
  }
  blinkNext -= dt;
  if (blinkNext <= 0) {
    blinkT = 0;
    blinkLen = 0.18 + Math.random() * 0.07;
    if (Math.random() < 0.25) blinkQueue = 1;
  }
}

/* -----------------------------------------------------------------
   眼球跟随：眼珠盯着「鼠标指针在屏幕上的那个点」；头、脖子一动不动。
   把鼠标想象成悬在她面前的一块屏幕：从镜头出发、穿过鼠标像素射出去一条线，
   线上离镜头 EYE_PLANE × (镜头到眼睛的距离) 的那一点，就是眼睛要盯的点。
   然后让眼珠从「静止时看的方向」转到「指向那个点的方向」。
   三个必须注意的地方：
   1) 静止时看的方向 = 「眼睛指向镜头」的方向。模型待机姿势本来就是看着
      镜头/观众的，拿它当基准，指针回到正中时眼珠才会正好归位、一动不动。
      （早先那版拿「屏幕正中沿镜头往前 0.92 的那个远点」当基准，那个点在
      脑袋后面，方向正好反了 180°，所以眼珠跟着鼠标往反方向转。)
   2) 每帧先把眼珠还原成静止角度再读世界矩阵。否则读到的是上一帧转过的结果，
      等于自己套自己，几帧之后眼珠就飞出去了。
   3) 指针在画面四角时夹角会很大，靠下面那三个限位角夹住，免得眼珠翻过去。
   ----------------------------------------------------------------- */
const EYE_BONES = ['左目', '右目'];
/* 眼珠限位：不是圆，是一只「横窄、上更窄、下松」的椭圆。
   这三个角是把眼珠硬转到各个角度截图量出来的（工具 work/model-tools/eyelimit.js）：
   左右各 13°、往上看 8°、往下看 15° 的时候，瞳孔正好贴到眼眶内缘。
   往上的余量最小 —— 上眼睑压得低，再往上瞳孔就钻到眼皮底下了，
   那才是真正「诡异」的来源：以前用的是一个 20° 的圆，横竖一样大，
   横向一甩瞳孔整颗跑出眼眶。三个数换模型/换表情都得重量。 */
const EYE_YAW_MAX = 13 * Math.PI / 180;
const EYE_UP_MAX = 8 * Math.PI / 180;
const EYE_DOWN_MAX = 15 * Math.PI / 180;
const EYE_PLANE = 0.45;
let eyeRig = null;
/* 调试用：把眼珠硬转到指定角度（度）绕过指针跟随 —— pitchUp 正 = 往上看，
   yawLeft 正 = 往她的左手侧看。截图脚本靠它单张试「眼珠转到多少度会顶到眼眶」，
   顺便量眼眶上下沿的位置。正式运行时它一直是 null，走的还是下面的指针跟随。 */
let eyeOverride = null;
const _qW = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qA = new THREE.Quaternion();
const _qT = new THREE.Quaternion(), _qID = new THREE.Quaternion();
const _qE = new THREE.Quaternion(), _eul = new THREE.Euler();
const _ey = new THREE.Vector3(), _dA = new THREE.Vector3(), _dB = new THREE.Vector3();
const _pin = new THREE.Vector3();
const _rx = new THREE.Vector3(), _ry = new THREE.Vector3();

function buildEyeRig() {
  const actor = ACTORS.stand;
  if (!actor) return;
  const eyes = [];
  EYE_BONES.forEach((name) => {
    const bone = actor.boneMap.get(name);
    if (!bone) return;
    eyes.push({ bone, rest: bone.quaternion.clone() });
  });
  eyeRig = eyes.length ? { root: actor.model, eyes } : null;
}

function updateEyeLook() {
  if (!eyeRig) return;
  const root = eyeRig.root;
  eyeRig.eyes.forEach((e) => { e.bone.quaternion.copy(e.rest); });
  if (eyeOverride) {
    /* 在「头的坐标系」里叠一个旋转：目骨静止时朝 +z 看、局部 y 轴朝上，
       所以绕局部 x 转 = 上下看、绕局部 y 转 = 左右看。 */
    _eul.set(-eyeOverride.pitch * Math.PI / 180, eyeOverride.yaw * Math.PI / 180, 0, 'XYZ');
    _qE.setFromEuler(_eul);
    eyeRig.eyes.forEach((e) => { e.bone.quaternion.premultiply(_qE); });
    root.updateMatrixWorld(true);
    return;
  }
  root.updateMatrixWorld(true);

  /* 镜头矩阵要现算：updateEyeLook 在 render 之前跑，不更新的话
     unproject 用的还是上一帧的镜头（差一帧，几乎看不出来，但没必要省）。 */
  camera.updateMatrixWorld();
  eyeRig.eyes.forEach((e) => {
    e.bone.getWorldQuaternion(_qW);
    e.bone.getWorldPosition(_ey);
    /* 指针盯点：镜头坐标系里 (x, y, -S)，再变换回世界。S 跟着「镜头到这只眼睛
       的距离」缩放，所以不管镜头推多近、拉多远，转动的量级都差不多。 */
    const dist = camera.position.distanceTo(_ey);
    const halfV = Math.tan(deg(camera.fov) * 0.5) * dist * EYE_PLANE;
    _pin.set(eyeSmooth.x * halfV * camera.aspect, eyeSmooth.y * halfV, -dist * EYE_PLANE)
      .applyMatrix4(camera.matrixWorld);
    _dA.copy(camera.position).sub(_ey).normalize();
    _dB.copy(_pin).sub(_ey).normalize();
    _qA.setFromUnitVectors(_dA, _dB);
    /* 把这一转拆成「绕她自己的右轴（上下）」和「绕她自己的上轴（左右）」两个分量，
       再用上面那只椭圆夹一下。_qW 是眼珠静止时的世界旋转，它的 x/y 轴就是
       眼珠自己的右轴/上轴（拿世界坐标表示），把世界旋转向量往这两根轴上投影，
       就得到两个分量的大小。按分量算出来的比例整体缩一下 _qA，
       横向和纵向就各自被夹在 13° / 8°(上)·15°(下) 里了。 */
    _rx.set(1, 0, 0).applyQuaternion(_qW);
    _ry.set(0, 1, 0).applyQuaternion(_qW);
    const pitchUp = -2 * (_qA.x * _rx.x + _qA.y * _rx.y + _qA.z * _rx.z);
    const yawLeft = 2 * (_qA.x * _ry.x + _qA.y * _ry.y + _qA.z * _ry.z);
    const lim = Math.hypot(yawLeft / EYE_YAW_MAX, pitchUp / (pitchUp > 0 ? EYE_UP_MAX : EYE_DOWN_MAX));
    _qT.copy(_qA);
    if (lim > 1) _qT.copy(_qID).slerp(_qA, 1 / lim);
    e.bone.parent.getWorldQuaternion(_qP);
    _qP.invert().multiply(_qT.multiply(_qW));
    e.bone.quaternion.copy(_qP);
  });
  root.updateMatrixWorld(true);
}

/* 滑动时的轻微动态模糊：强度跟着「滚动速度」走，停下就归零（滑得越快越明显）。
   只作用在 canvas 这一层，不动任何几何和取景，所以它纯粹是观感上的东西。 */
const MB_KNEE = 0.04, MB_K = 4.5, MB_MAX = 3.2;
function updateMotionBlur(dt) {
  const vel = Math.abs(target - lastTarget) / Math.max(dt, 1e-3);
  lastTarget = target;
  scrollVel += (vel - scrollVel) * Math.min(1, dt * 9);
  const want = clamp((scrollVel - MB_KNEE) * MB_K, 0, MB_MAX);
  blurNow += (want - blurNow) * Math.min(1, dt * 14);
  if (blurNow > 0.08) {
    const f = 'blur(' + blurNow.toFixed(2) + 'px)';
    if (canvas.style.filter !== f) canvas.style.filter = f;
  } else if (canvas.style.filter) canvas.style.filter = '';
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  /* 水面纹路按真实宽高比算，宽屏上才不会被拉扁 */
  if (skyMat) skyMat.uniforms.uAspect.value = Math.max(0.6, w / Math.max(1, h));
}

/* 一帧只量一次 hero-scroll 的位置，分镜进度和退场淡出都用它 ——
   同一帧里量两遍只会多一次强制重排。 */
function heroMetrics() {
  const r = scroller.getBoundingClientRect();
  const scrolled = -r.top;                       // 已滚过多少（hero-scroll 从文档顶部开始）
  const span = Math.max(1, r.height - window.innerHeight);  // 分镜占用的滚动距离
  return { scrolled, span };
}
function scrollProgress(m) {
  if (frozen !== null) return frozen;
  return clamp(m.scrolled / m.span, 0, 1);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (lenis) lenis.raf(now);
  if (ready) {
    const m = heroMetrics();
    /* 这一屏已经整层淡完了（白卡把它从头到脚盖住，用户在看博客）。
       淡出之后露出来的是 .hero-flow 那层 CSS 底色，canvas 本来就一点都看不见了，
       可渲染循环还在每帧跑 WebGL + 多重采样 + 后处理 —— 等于一直空转。
       判定通过就整段跳过：位置、相机、眨眼全都不用算，一帧只剩 Lenis 那一行。
       往下读文章时滑动跟不跟手，差的就是这一块。往回滚一进来立刻恢复。 */
    if (frozen === null && m.scrolled >= m.span + FADE_SPAN * window.innerHeight) {
      if (lastStageOpacity !== 0) { lastStageOpacity = 0; stage.style.opacity = '0'; }
      requestAnimationFrame(frame);
      return;
    }
    target = scrollProgress(m);
    progress += (target - progress) * Math.min(1, dt * PROG_LERP);
    mouseSmooth.x += (mouse.x - mouseSmooth.x) * Math.min(1, dt * 4);
    mouseSmooth.y += (mouse.y - mouseSmooth.y) * Math.min(1, dt * 4);
    eyeSmooth.x += (mouse.x - eyeSmooth.x) * Math.min(1, dt * 12);
    eyeSmooth.y += (mouse.y - eyeSmooth.y) * Math.min(1, dt * 12);

    /* 退场：分镜跑完之后，这一屏原地淡掉，白卡同时从下面升上来。
       淡出窗口故意比 greymac 靠前半个屏：它那一屏上只有几行小字，白卡的
       硬边横着切过去看不出来；我们这屏是画面正中的脸部大特写，白卡顶边升到
       画面七成高的地方就切到下巴了 —— 等那会儿才淡完，观感就是「人被一刀
       切成两半，上一半还浮在水里」。所以淡出从分镜一结束（白卡整块还在屏幕
       外面）就开始，走到白卡顶边刚过画面中线时正好归零，剩下半程白卡是压着
       一片空海面上来的，接缝处干干净净。
       frozen 是截图/调试用的冻结态，冻结时强制按「还在场」显示，
       不然一冻结就整屏透明、什么都看不到。 */
    const fade = frozen !== null ? 1
      : 1 - sstep(m.span, m.span + FADE_SPAN * window.innerHeight, m.scrolled);
    if (Math.abs(fade - lastStageOpacity) > 0.001) {
      lastStageOpacity = fade;
      stage.style.opacity = String(fade);
    }

    updateBlink(dt);

    applyKey(progress);
    updateEyeLook();
    updateMotionBlur(dt);
    /* 换白天/黑夜的那一帧直接跳到位：不然底色要淡过去，中间那零点几秒
       会看见一条跟周围不同深浅的横带（拖尾画布的边界底色）。 */
    const darkNow = document.documentElement.classList.contains('hb-dark');
    const themeSwitched = darkNow !== lastDarkState;
    lastDarkState = darkNow;
    const k = themeSwitched ? 1 : Math.min(1, dt * 4);
    bgColor.lerp(targetBg, k);
    bgTop.lerp(targetBgTop, k);
    bgBot.lerp(targetBgBot, k);
    scene.background = bgColor;
    if (skyMat) {
      skyMat.uniforms.uTop.value.copy(bgTop);
      skyMat.uniforms.uBot.value.copy(bgBot);
      /* 黑天把水面那道流光收到七成 —— 海底的光压着角色就没意思了 */
      const wantFlow = FLOW_AMOUNT * (darkNow ? DARK_FLOW : 1);
      if (skyMat.uniforms.uFlow.value !== wantFlow) skyMat.uniforms.uFlow.value = wantFlow;
      /* 流光的相位。用 now（页面打开到现在）而不是累加 dt，
         窗口切走再回来时不会跳一下。 */
      skyMat.uniforms.uTime.value = now * 0.001;
    }
    /* canvas 开动态模糊时四边会被糊出去一圈（blur 会把边界外的透明像素带进来），
       把 sticky 的底色刷成跟背景同一个色，那一圈就看不见了。 */
    if (stage && stage.style.backgroundColor !== '#' + bgBot.getHexString()) {
      stage.style.backgroundColor = '#' + bgBot.getHexString();
    }

    const breathe = Math.sin(now * 0.0011) * 0.004 + Math.sin(now * 0.0007 + 1.7) * 0.0025;
    Object.values(ACTORS).forEach((a) => { a.model.position.y = breathe; });

    renderer.render(scene, camera);
  } else if (renderer && skyMat) {
    /* 模型还在路上：先把海画出来顶着（见下面 renderSkyOnly 的说明）。
       这一支跑的时候 ready 还是 false，所以相机、眨眼、分镜全都不用算。 */
    renderSkyOnly(now);
    markSkyLive();
  }
  requestAnimationFrame(frame);
}

/* 模型还没解析完的时候，先把「海」画出来。
   这片海跟角色完全无关（纯屏幕坐标的渐变 + 缓慢漂移的流光），所以完全可以
   先画：进来第一帧就有在流动的水，而不是一块死蓝；更要紧的是 ——
   等角色真的浮出来那一瞬，背景一点没变，遮罩淡出时不会出现
   「两片蓝对不上」的接缝（以前那版就是拿静态渐变去凑，海里那条亮带一直在漂，
   怎么调都对不准）。
   相机用默认位置：海是球心在原点的一个大球，相机偏几个单位看不出来。
   顺手把「平滑态」那三个色号也设成第一幕的目标值 —— 这样等 ready
   接管渲染时，底色不会突然从白天版淡到黑夜版（黑天进来会闪一下白）。 */
function renderSkyOnly(now) {
  const darkNow = document.documentElement.classList.contains('hb-dark');
  const mul = darkNow ? DARK_BG : 1;
  bgTop.setHex(KEYS[0].bg).multiplyScalar(mul);
  bgBot.setHex(KEYS[0].bg2).multiplyScalar(mul);
  bgColor.copy(bgBot);
  skyMat.uniforms.uTop.value.copy(bgTop);
  skyMat.uniforms.uBot.value.copy(bgBot);
  skyMat.uniforms.uFlow.value = FLOW_AMOUNT * (darkNow ? DARK_FLOW : 1);
  skyMat.uniforms.uTime.value = now * 0.001;
  scene.background = bgColor;
  renderer.render(scene, camera);
  if (stage && stage.style.backgroundColor !== '#' + bgBot.getHexString()) {
    stage.style.backgroundColor = '#' + bgBot.getHexString();
  }
}

/* 海画出来了 —— 把遮罩里那层「挡空画布」的底色撤掉（见 hero.css）。
   从这一刻起遮罩只剩水环素材和文字，浮在真正在动的海面上。 */
let skyLive = false;
function markSkyLive() {
  if (skyLive) return;
  skyLive = true;
  const el = document.getElementById('hero-loader');
  if (el) el.classList.add('is-sky');
}

/* 加载遮罩收场：加一个类让它整层淡出去（动画写在 hero.css），
   淡完再把节点摘掉 —— 留着它虽然看不见，但会一直挡着点击。
   重复调用安全：已经淡出去过就直接返回。 */
function hideLoader() {
  const el = document.getElementById('hero-loader');
  if (!el || el.classList.contains('is-done')) return;
  el.classList.add('is-done');
  /* 加载页那条水环素材（.hero-loader-video，见 hero.pug）跟着遮罩一起淡出；
     淡完顺手把它暂停 —— 留着它继续解码只是白白烧电。 */
  const loaderVideo = el.querySelector('.hero-loader-video');
  if (loaderVideo) {
    setTimeout(() => { try { loaderVideo.pause(); } catch (e) {} }, 900);
  }
  setTimeout(() => el.remove(), 900);
}

function fallbackPoster() {
  hideLoader();
  const poster = document.createElement('div');
  poster.className = 'hero-poster';
  poster.style.backgroundImage = 'url(/img/top.png)';
  poster.style.display = 'block';
  if (canvas) canvas.style.display = 'none';
  stage.insertBefore(poster, canvas.nextSibling);
  panels.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
  document.documentElement.classList.add('hero-fallback');
}

/* 站点名一往下滑就淡出（滚过 60px 就算），右上角的菜单不动。
   另外：滑过 3D 那屏之后白卡会从下面升上来盖住导航，那时候浅色字就看不见了，
   所以卡片顶边进到导航这一带时给 <html> 挂个 hero-on-card，把字翻回深色。
   这个状态能加也能删（用户会来回滑），阈值中间留一段不回弹的空档。 */
function initNavSkin() {
  const root = document.documentElement;
  const card = document.querySelector('.hero-tab-card');
  let queued = false;
  const apply = () => {
    queued = false;
    root.classList.toggle('hero-scrolled', window.scrollY > 60);
    if (!card) return;
    // 34 是导航那行字的下边缘：卡片顶边越过它，字才算真的压在米白上。
    const top = card.getBoundingClientRect().top;
    if (top <= 34) root.classList.add('hero-on-card');
    else if (top >= 96) root.classList.remove('hero-on-card');
  };
  const request = () => { if (queued) return; queued = true; requestAnimationFrame(apply); };
  apply();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
}

/* 白卡里的文字由浅入深：元素顶边越过视口 72% 处就把颜色转深（转不回来，
   免得来回滑的时候一闪一闪）。 */
function initCardReveal() {
  const items = Array.from(document.querySelectorAll('.hero-tab-card .reveal'));
  if (!items.length) return;
  const apply = () => {
    const line = window.innerHeight * 0.72;
    items.forEach((el) => {
      if (el.classList.contains('is-in')) return;
      if (el.getBoundingClientRect().top < line) el.classList.add('is-in');
    });
  };
  apply();
  window.addEventListener('scroll', apply, { passive: true });
  window.addEventListener('resize', apply);
}

function boot() {
  initNavSkin();
  initCardReveal();
  /* 兜底：不管下面是正常出模型、还是画不出来退成静态海报，
     都不能让加载遮罩永远挂着。真卡住了（网络断在半路、一直不报错），
     12 秒把副标题换成提示，18 秒直接放行 —— 宁可让用户看见空海，
     也好过永远转圈。正常情况这两个定时器都轮不到。 */
  setTimeout(() => {
    const sub = document.getElementById('hero-loader-sub');
    if (sub) sub.textContent = '这片海有点大，再等一下下…';
  }, 12000);
  setTimeout(hideLoader, 18000);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = window.innerWidth < 760 && (navigator.hardwareConcurrency || 4) <= 4;
  if (reduced || smallScreen) { fallbackPoster(); ready = false; return; }

  try { initRenderer(); } catch (e) { fallbackPoster(); return; }
  /* 画布尺寸要在这一帧就定下来，不能等 ready 那一步：
     模型加载期间画的是同一片海，尺寸晚定就白画一段低分辨率的。 */
  resize();

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  /* 首屏加载耗时探针：每段结束记一个时间戳，量「进页面 → 角色能画」到底花在哪。
     不参与任何逻辑，只是把阶段耗时挂在 window.__heroPerf 上方便排查。 */
  const perf = window.__heroPerf = { t0: Math.round(performance.now()), phases: [] };
  const mark = (label) => perf.phases.push([label, Math.round(performance.now())]);
  const jobs = MODEL_DEFS.map((def) => new Promise((resolve, reject) => {
    loader.load(def.url, (gltf) => {
      mark('glb-parsed');
      const actor = {
        model: gltf.scene, boneMap: new Map(), restRot: new Map(), morphMeshes: [],
        box: new THREE.Box3(), size: new THREE.Vector3(), center: new THREE.Vector3(),
      };
      toonify(actor.model, actor);
      mark('toonify');
      relieveNeckCollars(actor.model);
      settleNeckLayers(actor.model);
      mark('neck-fix');
      actor.model.traverse((o) => {
        if (o.isBone) {
          actor.boneMap.set(o.name, o);
          if (!actor.restRot.has(o.name)) actor.restRot.set(o.name, { x: o.rotation.x, y: o.rotation.y, z: o.rotation.z });
        }
      });
      mark('bone-map');
      actor.model.visible = true;
      ACTORS[def.id] = actor;
      scene.add(actor.model);
      resolve();
    }, undefined, reject);
  }));

  Promise.all(jobs).then(() => {
    measure();
    mark('measure');
    buildEyeRig();
    mark('eye-rig');
    resize();
    ready = true;
    mark('ready');
    /* 等真正画出一帧带角色的画面再撤遮罩：ready 只是「数据齐了」，
       紧接着的那一帧里还有着色器首次编译，撤早了会闪一下空海。
       两层 rAF 就是「等下一帧画完」的意思。 */
    requestAnimationFrame(() => requestAnimationFrame(hideLoader));
    window.__hero = {
      set(p) { frozen = p; progress = p; target = p; applyKey(p); renderer.render(scene, camera); },
      unfreeze() { frozen = null; },
      /* 截图脚本用：Lenis 开着的时候 window.scrollTo 会被它拽回去，
         所以跳位置一律走它自己的瞬移接口。 */
      jump(y) { if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y); },
      scrollTo(y, o) { if (lenis) lenis.scrollTo(y, o || {}); else window.scrollTo(0, y); },
      lenis,
      setBlink(v) { blinkOverride = v; applyKey(frozen === null ? progress : frozen); renderer.render(scene, camera); },
      unblink() { blinkOverride = null; },
      blink() { blinkT = 0; blinkLen = 0.2; blinkNext = 99; },
      /* 调试用：硬转眼珠（度）。eye(null) 交回指针跟随。 */
      eye(pitchUp, yawLeft) {
        eyeOverride = (pitchUp === null || pitchUp === undefined) ? null : { pitch: pitchUp, yaw: yawLeft || 0 };
        applyKey(frozen === null ? progress : frozen);
        renderer.render(scene, camera);
      },
      state() {
        return {
          progress, ready, size: size.toArray(),
          bones: Object.values(ACTORS).reduce((n, a) => n + a.boneMap.size, 0),
          parts: Object.keys(ACTORS),
        };
      },
      debug() {
        const out = { modelScale: MODEL_SCALE };
        Object.keys(ACTORS).forEach((k) => {
          const a = ACTORS[k];
          out[k] = {
            scale: a.model.scale.x, visible: a.model.visible,
            box: [a.box.min.toArray().map((v) => +v.toFixed(4)), a.box.max.toArray().map((v) => +v.toFixed(4))],
            size: a.size.toArray().map((v) => +v.toFixed(4)),
          };
        });
        return out;
      },
      /* 调试用（不影响正式流程）：临时把整套关键帧的姿势/表情替换成给定的，
         用来单张试「骨头要转多少度」。姿势表格式：{ 骨骼名: [x度, y度, z度] } */
      pose(spec, morphSpec) {
        KEYS.forEach((k) => { k.pose = spec || {}; if (morphSpec) k.morph = morphSpec; });
        applyKey(frozen === null ? progress : frozen);
        renderer.render(scene, camera);
      },
      /* 调试用：当场改「微笑强度」。0 = 原来那条直线，1 = 正常微笑，
         想看她笑到什么程度合适就用这个来回试。 */
      smile(amount, rise) {
        const v = setSmile(amount, rise);
        renderer.render(scene, camera);
        return v;
      },
      dbg: { THREE, KEYS, ACTORS, actor: ACTORS.stand, camera, renderer, scene },
    };
  }).catch(() => fallbackPoster());

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
requestAnimationFrame(frame);
}

boot();

/* -----------------------------------------------------------------
   「About Me」那一屏的打字机。
   一个字一个字打出来 → 停一下 → 再一个字一个字删掉 → 接着打清单里的
   下一个词（按顺序来，最后一个打完之后回到第一个）。
   想换词只改下面这份 ABOUT_WORDS 清单，格式是「一个词一行」。
   ----------------------------------------------------------------- */
const ABOUT_WORDS = [
  '排球', '跳绳', '摄影', '二次元', '游戏',
  '螺蛳粉', 'AIGC', '待开发',
];

(function aboutTyper() {
  const el = document.getElementById('hero-about-word');
  if (!el) return;

  /* 系统里开了「减少动态效果」的话，一直闪的字会让人难受，直接给一个静态词。 */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = ABOUT_WORDS[0];
    return;
  }

  const HOLD = 1250;  /* 整个词打完之后停多久 */
  const GAP = 420;    /* 删干净之后空多久再打下一个 */
  let word = '', pos = 0, idx = -1, phase = 'gap';

  /* 按清单顺序一个一个来：打完一个就轮下一个，最后一个后面绕回第一个。 */
  function nextWord() {
    idx = (idx + 1) % ABOUT_WORDS.length;
    return ABOUT_WORDS[idx];
  }

  function tick() {
    if (phase === 'type') {
      pos += 1;
      el.textContent = word.slice(0, pos);
      if (pos >= word.length) {
        phase = 'hold';
        setTimeout(tick, HOLD);
      } else {
        /* 每个字的间隔都掺一点随机，看起来才像人在敲、不像机器在印 */
        setTimeout(tick, 85 + Math.random() * 115);
      }
      return;
    }
    if (phase === 'hold') {
      phase = 'del';
      setTimeout(tick, 70 + Math.random() * 40);
      return;
    }
    if (phase === 'del') {
      pos -= 1;
      el.textContent = word.slice(0, pos);
      if (pos <= 0) {
        phase = 'gap';
        setTimeout(tick, GAP);
      } else {
        setTimeout(tick, 65 + Math.random() * 45);
      }
      return;
    }
    word = nextWord();
    pos = 0;
    phase = 'type';
    setTimeout(tick, 140);
  }

  tick();
})();
