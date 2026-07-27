// 白噪音采集：塔内各处的声源（与拾一的「白噪音图书馆」人设联动）
export const SOUNDS = [
  { id: 'rain_wind', name: '天台的风雨', emoji: '🌬', floorKey: 'rooftop', x: 700, freq: 220, desc: '风穿过栏杆的缝，把雨声梳成了流苏。' },
  { id: 'soup_boil', name: '汤锅沸腾', emoji: '🍲', floorKey: 'market', x: 300, freq: 140, desc: '咕嘟咕嘟——老汤说这是海的心跳的陆地版。' },
  { id: 'arcade_hum', name: '街机电流', emoji: '⚡', floorKey: 'arcade', x: 520, freq: 90, desc: '一整排老机器的低鸣，像电子生物在打呼。' },
  { id: 'bubble_deep', name: '深海气泡', emoji: '🫧', floorKey: 'aquarium', x: 720, freq: 320, desc: '从玻璃那头浮上来的，一整串小小的"没关系"。' },
  { id: 'cat_purr', name: '猫的呼噜', emoji: '🐈', floorKey: 'lobby', x: 1000, freq: 55, desc: '功率稳定的小型治愈引擎，塔内限量两台。' },
  { id: 'radio_2am', name: '两点档漏音', emoji: '📻', floorKey: 'f3', x: 520, freq: 440, desc: '晚仔的电台从门缝里漏出来的那一点点温柔。' },
  { id: 'umbrella_drip', name: '伞骨滴水', emoji: '☂️', floorKey: 'f2', x: 520, freq: 660, desc: '修好的伞在晾干，滴答，滴答，数着自己的心事。' },
  { id: 'lantern_sway', name: '灯笼摇晃', emoji: '🏮', floorKey: 'lobby', x: 480, freq: 180, desc: '木轴轻轻吱呀，是塔在换一个舒服的姿势。' },
];
export const MIX_NEED = 5; // 集齐5种可调制「白噪音合辑」送人
