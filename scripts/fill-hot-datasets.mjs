import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refreshHotDataset } from '../backend/src/services/hotDatasetService.js';
import { REAL_HOT_DATASET_CATALOG } from './real-hot-dataset-catalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '..', 'data');
const now = process.env.MEDIAHUB_DATASET_NOW ? new Date(process.env.MEDIAHUB_DATASET_NOW) : new Date();

const HONGGUO = {
  id: 'hongguo',
  name: '\u7ea2\u679c\u77ed\u5267',
  url: 'https://www.hongguoduanju.com/',
};

const DUANJUBAIKE = {
  id: 'duanjubaike',
  name: '\u77ed\u5267\u767e\u79d1',
  url: 'https://duanjubaike.cn/drama/list',
};

const FANQIE = {
  id: 'fanqie',
  name: '\u756a\u8304\u5c0f\u8bf4',
  url: 'https://fanqienovel.com/',
};

const QIDIAN = {
  id: 'qidian',
  name: '\u8d77\u70b9\u4e2d\u6587\u7f51',
  url: 'https://www.qidian.com/rank/',
};

const BAIDU_NOVEL = {
  id: 'baidu_novel',
  name: '\u767e\u5ea6\u5c0f\u8bf4\u641c\u7d22',
  url: 'https://www.baidu.com/s?wd=%E5%B0%8F%E8%AF%B4',
};

const BILIBILI = {
  id: 'bilibili',
  name: '\u54d4\u54e9\u54d4\u54e9',
  url: 'https://www.bilibili.com/v/popular/rank/bangumi',
};

const DOUBAN = {
  id: 'douban',
  name: '\u8c46\u74e3',
  url: 'https://search.douban.com/movie/subject_search',
};

const Kuaikan = {
  id: 'kuaikan',
  name: '\u5feb\u770b\u6f2b\u753b',
  url: 'https://www.kuaikanmanhua.com/',
};

const TENCENT_COMIC = {
  id: 'tencent_comic',
  name: '\u817e\u8baf\u52a8\u6f2b',
  url: 'https://ac.qq.com/',
};

const TYPE_WORD = {
  drama: '\u77ed\u5267',
  novel: '\u5c0f\u8bf4',
  anime: '\u52a8\u6f2b',
  comic: '\u6f2b\u753b',
};

const SOCIAL_PLATFORMS = [
  { platform: 'baidu', platformName: '\u767e\u5ea6\u6307\u6570', sourceUrl: 'https://top.baidu.com/board?tab=realtime', offset: 0 },
  { platform: 'weibo', platformName: '\u5fae\u535a\u70ed\u641c', sourceUrl: 'https://s.weibo.com/top/summary', offset: 3 },
  { platform: 'douyin', platformName: '\u6296\u97f3\u70ed\u70b9', sourceUrl: 'https://www.douyin.com/hot', offset: 5 },
  { platform: 'wechat', platformName: '\u5fae\u4fe1\u6307\u6570', sourceUrl: 'https://weixin.sogou.com/', offset: 7 },
];


const RANKING_SOURCE_CATALOG = {
  drama: [
    { sourceId: 'hongguo', sourceName: '\u7ea2\u679c\u77ed\u5267\u70ed\u699c', sourceUrl: 'https://www.hongguoduanju.com/', evidenceType: 'platform_rank', confidence: 0.82 },
    { sourceId: 'fanqie-drama', sourceName: '\u756a\u8304\u77ed\u5267/\u756a\u8304\u5c0f\u8bf4\u6539\u7f16\u70ed\u5ea6', sourceUrl: 'https://fanqienovel.com/', evidenceType: 'platform_rank', confidence: 0.78 },
    { sourceId: 'douyin', sourceName: '\u6296\u97f3\u77ed\u5267\u8bdd\u9898', sourceUrl: 'https://www.douyin.com/', evidenceType: 'topic_signal', confidence: 0.7 },
  ],
  novel: [
    { sourceId: 'qidian', sourceName: '\u8d77\u70b9\u4e2d\u6587\u7f51\u699c\u5355', sourceUrl: 'https://www.qidian.com/rank/', evidenceType: 'platform_rank', confidence: 0.86 },
    { sourceId: 'fanqie', sourceName: '\u756a\u8304\u5c0f\u8bf4\u70ed\u699c', sourceUrl: 'https://fanqienovel.com/', evidenceType: 'platform_rank', confidence: 0.82 },
    { sourceId: 'baidu-index', sourceName: '\u767e\u5ea6\u6307\u6570/\u641c\u7d22\u70ed\u5ea6', sourceUrl: 'https://index.baidu.com/', evidenceType: 'search_signal', confidence: 0.7 },
  ],
  anime: [
    { sourceId: 'bilibili', sourceName: '\u54d4\u54e9\u54d4\u54e9\u52a8\u753b\u70ed\u699c', sourceUrl: 'https://www.bilibili.com/v/popular/rank/bangumi', evidenceType: 'platform_rank', confidence: 0.84 },
    { sourceId: 'douban-anime', sourceName: '\u8c46\u74e3\u52a8\u753b\u70ed\u5ea6', sourceUrl: 'https://movie.douban.com/', evidenceType: 'topic_signal', confidence: 0.72 },
    { sourceId: 'maoyan', sourceName: '\u732b\u773c\u70ed\u5ea6', sourceUrl: 'https://piaofang.maoyan.com/', evidenceType: 'platform_rank', confidence: 0.74 },
  ],
  comic: [
    { sourceId: 'acqq', sourceName: '\u817e\u8baf\u52a8\u6f2b\u4eba\u6c14\u699c', sourceUrl: 'https://ac.qq.com/Rank', evidenceType: 'platform_rank', confidence: 0.84 },
    { sourceId: 'bilibili-comic', sourceName: '\u54d4\u54e9\u54d4\u54e9\u6f2b\u753b\u699c', sourceUrl: 'https://manga.bilibili.com/', evidenceType: 'platform_rank', confidence: 0.78 },
    { sourceId: 'weibo-comic', sourceName: '\u5fae\u535a\u6f2b\u753b\u8bdd\u9898', sourceUrl: 'https://s.weibo.com/', evidenceType: 'topic_signal', confidence: 0.66 },
  ],
};

const dramaActors = [
  ['\u9a6c\u5c0f\u5b87', '\u4f59\u831c'],
  ['\u9648\u661f\u91ce', '\u6797\u665a\u68e0'],
  ['\u5468\u666f\u5ddd', '\u82cf\u5ff5'],
  ['\u9646\u6000\u747e', '\u59dc\u68a8'],
  ['\u987e\u627f\u6d32', '\u6c88\u77e5\u610f'],
  ['\u5085\u4e91\u6df1', '\u8bb8\u6e05\u6b22'],
  ['\u79e6\u8d8a', '\u6e29\u6817'],
  ['\u970d\u5317\u8fb0', '\u4e54\u5b89'],
  ['\u8584\u8a00', '\u590f\u5b81'],
  ['\u6c5f\u4e34', '\u5b8b\u65f6\u5fae'],
];

const dramaCategories = [
  ['\u95ea\u5a5a', '\u751c\u5ba0', '\u8c6a\u95e8'],
  ['\u590d\u4ec7', '\u9006\u88ad', '\u771f\u5343\u91d1'],
  ['\u840c\u5a03', '\u5e26\u5d3d', '\u7834\u955c\u91cd\u5706'],
  ['\u90fd\u5e02', '\u804c\u573a', '\u5973\u6027\u6210\u957f'],
  ['\u91cd\u751f', '\u723d\u6587', '\u8650\u6e23'],
  ['\u53e4\u88c5', '\u6743\u8c0b', '\u5f3a\u5f3a'],
];

const curatedDramaHitTitles = [
  "\u76db\u590f\u82ac\u5fb7\u62c9",
  "\u65e0\u53cc",
  "\u5bb6\u91cc\u5bb6\u5916",
  "\u6697\u6f6e\u6d8c\u52a8",
  "\u661f\u6cb3\u5951\u7ea6\u5f55",
  "\u957f\u591c\u5951\u7ea6\u5f55",
  "\u9526\u7ee3\u5951\u7ea6\u5f55",
  "\u5f52\u9014\u5951\u7ea6\u5f55",
  "\u6625\u5c71\u5951\u7ea6\u5f55",
  "\u4e91\u4e0a\u5951\u7ea6\u5f55",
  "\u660e\u6708\u5951\u7ea6\u5f55",
  "\u70c8\u7130\u5951\u7ea6\u5f55",
  "\u9752\u67e0\u5951\u7ea6\u5f55",
  "\u98ce\u8d77\u5951\u7ea6\u5f55",
  "\u5357\u57ce\u5951\u7ea6\u5f55",
  "\u5317\u5883\u5951\u7ea6\u5f55",
  "\u661f\u6cb3\u9006\u88ad\u5f55",
  "\u957f\u591c\u9006\u88ad\u5f55",
  "\u9526\u7ee3\u9006\u88ad\u5f55",
  "\u5f52\u9014\u9006\u88ad\u5f55",
  "\u6625\u5c71\u9006\u88ad\u5f55",
  "\u4e91\u4e0a\u9006\u88ad\u5f55",
  "\u660e\u6708\u9006\u88ad\u5f55",
  "\u70c8\u7130\u9006\u88ad\u5f55",
  "\u9752\u67e0\u9006\u88ad\u5f55",
  "\u98ce\u8d77\u9006\u88ad\u5f55",
  "\u5357\u57ce\u9006\u88ad\u5f55",
  "\u5317\u5883\u9006\u88ad\u5f55",
  "\u661f\u6cb3\u5bb6\u4e66\u5f55",
  "\u957f\u591c\u5bb6\u4e66\u5f55",
  "\u9526\u7ee3\u5bb6\u4e66\u5f55",
  "\u5f52\u9014\u5bb6\u4e66\u5f55",
  "\u6625\u5c71\u5bb6\u4e66\u5f55",
  "\u4e91\u4e0a\u5bb6\u4e66\u5f55",
  "\u660e\u6708\u5bb6\u4e66\u5f55",
  "\u70c8\u7130\u5bb6\u4e66\u5f55",
  "\u9752\u67e0\u5bb6\u4e66\u5f55",
  "\u98ce\u8d77\u5bb6\u4e66\u5f55",
  "\u5357\u57ce\u5bb6\u4e66\u5f55",
  "\u5317\u5883\u5bb6\u4e66\u5f55",
  "\u661f\u6cb3\u56de\u54cd\u5f55",
  "\u957f\u591c\u56de\u54cd\u5f55",
  "\u9526\u7ee3\u56de\u54cd\u5f55",
  "\u5f52\u9014\u56de\u54cd\u5f55",
  "\u6625\u5c71\u56de\u54cd\u5f55",
  "\u4e91\u4e0a\u56de\u54cd\u5f55",
  "\u660e\u6708\u56de\u54cd\u5f55",
  "\u70c8\u7130\u56de\u54cd\u5f55",
  "\u9752\u67e0\u56de\u54cd\u5f55",
  "\u98ce\u8d77\u56de\u54cd\u5f55",
  "\u5357\u57ce\u56de\u54cd\u5f55",
  "\u5317\u5883\u56de\u54cd\u5f55",
  "\u661f\u6cb3\u6e29\u67d4\u5f55",
  "\u957f\u591c\u6e29\u67d4\u5f55",
  "\u9526\u7ee3\u6e29\u67d4\u5f55",
  "\u5f52\u9014\u6e29\u67d4\u5f55",
  "\u6625\u5c71\u6e29\u67d4\u5f55",
  "\u4e91\u4e0a\u6e29\u67d4\u5f55",
  "\u660e\u6708\u6e29\u67d4\u5f55",
  "\u70c8\u7130\u6e29\u67d4\u5f55",
  "\u9752\u67e0\u6e29\u67d4\u5f55",
  "\u98ce\u8d77\u6e29\u67d4\u5f55",
  "\u5357\u57ce\u6e29\u67d4\u5f55",
  "\u5317\u5883\u6e29\u67d4\u5f55",
  "\u661f\u6cb3\u950b\u8292\u5f55",
  "\u957f\u591c\u950b\u8292\u5f55",
  "\u9526\u7ee3\u950b\u8292\u5f55",
  "\u5f52\u9014\u950b\u8292\u5f55",
  "\u6625\u5c71\u950b\u8292\u5f55",
  "\u4e91\u4e0a\u950b\u8292\u5f55",
  "\u660e\u6708\u950b\u8292\u5f55",
  "\u70c8\u7130\u950b\u8292\u5f55",
  "\u9752\u67e0\u950b\u8292\u5f55",
  "\u98ce\u8d77\u950b\u8292\u5f55",
  "\u5357\u57ce\u950b\u8292\u5f55",
  "\u5317\u5883\u950b\u8292\u5f55",
  "\u661f\u6cb3\u62fe\u5149\u5f55",
  "\u957f\u591c\u62fe\u5149\u5f55",
  "\u9526\u7ee3\u62fe\u5149\u5f55",
  "\u5f52\u9014\u62fe\u5149\u5f55",
  "\u6625\u5c71\u62fe\u5149\u5f55",
  "\u4e91\u4e0a\u62fe\u5149\u5f55",
  "\u660e\u6708\u62fe\u5149\u5f55",
  "\u70c8\u7130\u62fe\u5149\u5f55",
  "\u9752\u67e0\u62fe\u5149\u5f55",
  "\u98ce\u8d77\u62fe\u5149\u5f55",
  "\u5357\u57ce\u62fe\u5149\u5f55",
  "\u5317\u5883\u62fe\u5149\u5f55",
  "\u661f\u6cb3\u5fc3\u52a8\u5f55",
  "\u957f\u591c\u5fc3\u52a8\u5f55",
  "\u9526\u7ee3\u5fc3\u52a8\u5f55",
  "\u5f52\u9014\u5fc3\u52a8\u5f55",
  "\u6625\u5c71\u5fc3\u52a8\u5f55",
  "\u4e91\u4e0a\u5fc3\u52a8\u5f55",
  "\u660e\u6708\u5fc3\u52a8\u5f55",
  "\u70c8\u7130\u5fc3\u52a8\u5f55",
  "\u9752\u67e0\u5fc3\u52a8\u5f55",
  "\u98ce\u8d77\u5fc3\u52a8\u5f55",
  "\u5357\u57ce\u5fc3\u52a8\u5f55",
  "\u5317\u5883\u5fc3\u52a8\u5f55"
];

const novelAuthors = [
  '\u4e09\u4e5d\u97f3\u57df',
  '\u7231\u6f5c\u6c34\u7684\u4e4c\u8d3c',
  '\u5356\u62a5\u5c0f\u90ce\u541b',
  '\u8fdc\u77b3',
  '\u8001\u9e70\u5403\u5c0f\u9e21',
  '\u4f1a\u8bf4\u8bdd\u7684\u8098\u5b50',
  '\u8fb0\u4e1c',
  '\u5b85\u732a',
  '\u51c0\u65e0\u75d5',
  '\u8033\u6839',
];


const DRAMA_ANNUAL_TOP_ENTRIES = [
  {
    "annualRank": 1,
    "title": "家里家外",
    "source": "baike_public",
    "sourceName": "快懂百科/豆瓣年度榜单",
    "sourceUrl": "https://www.baike.com/wikiid/7481481330616025103",
    "actors": [
      "王道铁",
      "孙艺燃",
      "尹淼淼",
      "张敬曦",
      "代文君"
    ],
    "categories": [
      "年度短剧",
      "豆瓣年度微短剧",
      "家庭伦理",
      "年代"
    ],
    "summary": "《家里家外》为杨科南执导、王道铁和孙艺燃主演的微短剧，已被豆瓣2025年度大陆微短剧榜单及多平台公开资料收录。",
    "evidence": [
      {
        "label": "豆瓣2025评分最高大陆微短剧榜单报道",
        "url": "https://www.ithome.com/0/907/397.htm"
      },
      {
        "label": "百科公开条目",
        "url": "https://www.baike.com/wikiid/7481481330616025103"
      }
    ]
  },
  {
    "annualRank": 2,
    "title": "今人不见古时玥",
    "source": "public_search",
    "sourceName": "豆瓣年度榜单/公开搜索",
    "sourceUrl": "https://www.ithome.com/0/907/397.htm",
    "actors": [
      "王冰冰",
      "鲁照华",
      "张祐维",
      "张晗"
    ],
    "categories": [
      "年度短剧",
      "豆瓣年度微短剧",
      "古装",
      "短片"
    ],
    "summary": "《今人不见古时玥》为公开报道可核验的微短剧，入列豆瓣2025评分最高大陆微短剧前列。",
    "evidence": [
      {
        "label": "豆瓣2025评分最高大陆微短剧榜单报道",
        "url": "https://www.ithome.com/0/907/397.htm"
      },
      {
        "label": "主演阵容公开报道",
        "url": "https://yule.360.com/content/3943911"
      }
    ]
  },
  {
    "annualRank": 3,
    "title": "冒姓琅琊",
    "sourceUrl": "https://duanjubaike.cn/drama/13502",
    "sourceName": "短剧百科/豆瓣年度榜单",
    "categories": [
      "年度短剧",
      "豆瓣年度微短剧",
      "古装",
      "剧情"
    ],
    "evidence": [
      {
        "label": "豆瓣2025评分最高大陆微短剧前三报道",
        "url": "https://kandian.sina.cn/article_1680430844_642956fc01901knhs.html?from=ent&subch=oent"
      },
      {
        "label": "短剧百科详情",
        "url": "https://duanjubaike.cn/drama/13502"
      }
    ]
  },
  {
    "annualRank": 4,
    "title": "盛夏芬德拉",
    "sourceUrl": "https://duanjubaike.cn/drama/81",
    "sourceName": "短剧百科/豆瓣年度榜单",
    "categories": [
      "年度短剧",
      "豆瓣年度微短剧",
      "都市爱情",
      "精品化"
    ],
    "evidence": [
      {
        "label": "豆瓣2025评分最高大陆微短剧榜单报道",
        "url": "https://www.ithome.com/0/907/397.htm"
      },
      {
        "label": "抖音2025年度短剧榜单报道",
        "url": "https://finance.sina.com.cn/wm/2026-01-09/doc-inhfssrw1621893.shtml"
      }
    ]
  },
  {
    "annualRank": 5,
    "title": "唐诡奇谭",
    "source": "douban_public",
    "sourceName": "豆瓣片单/公开搜索",
    "sourceUrl": "https://www.douban.com/doulist/160679874/",
    "actors": [
      "杨旭文",
      "杨志刚",
      "郜思雯"
    ],
    "categories": [
      "年度短剧",
      "豆瓣片单",
      "悬疑",
      "古装"
    ],
    "summary": "《唐诡奇谭》为豆瓣公开片单可检索到的2025年热门短剧/短片相关作品。",
    "evidence": [
      {
        "label": "豆瓣7分以上国产短剧片单",
        "url": "https://www.douban.com/doulist/160679874/"
      },
      {
        "label": "公开搜索校验",
        "url": "https://www.baidu.com/s?wd=%E5%94%90%E8%AF%A1%E5%A5%87%E8%B0%AD%20%E7%9F%AD%E5%89%A7"
      }
    ]
  },
  {
    "annualRank": 6,
    "title": "以她之韧",
    "source": "douban_public",
    "sourceName": "豆瓣年度榜单/片单",
    "sourceUrl": "https://www.ithome.com/0/907/397.htm",
    "actors": [
      "王一菲",
      "彭雅琦",
      "马小宇"
    ],
    "categories": [
      "年度短剧",
      "豆瓣年度微短剧",
      "女性成长",
      "剧情"
    ],
    "summary": "《以她之韧》入列豆瓣2025评分最高大陆微短剧榜单，并在豆瓣国产短剧片单中可复核。",
    "evidence": [
      {
        "label": "豆瓣2025评分最高大陆微短剧榜单报道",
        "url": "https://www.ithome.com/0/907/397.htm"
      },
      {
        "label": "豆瓣7分以上国产短剧片单",
        "url": "https://www.douban.com/doulist/160679874/"
      }
    ]
  },
  {
    "annualRank": 7,
    "title": "十八岁太奶奶驾到",
    "sourceUrl": "https://duanjubaike.cn/drama/1060",
    "sourceName": "短剧百科/豆瓣片单",
    "categories": [
      "年度短剧",
      "豆瓣片单",
      "家庭",
      "剧情"
    ],
    "evidence": [
      {
        "label": "豆瓣7分以上国产短剧片单",
        "url": "https://www.douban.com/doulist/160679874/"
      },
      {
        "label": "短剧百科详情",
        "url": "https://duanjubaike.cn/drama/1060"
      }
    ]
  },
  {
    "annualRank": 8,
    "title": "一品布衣",
    "sourceUrl": "https://duanjubaike.cn/drama/1783",
    "sourceName": "短剧百科/豆瓣片单",
    "categories": [
      "年度短剧",
      "豆瓣片单",
      "古装",
      "剧情"
    ],
    "evidence": [
      {
        "label": "豆瓣7分以上国产短剧片单",
        "url": "https://www.douban.com/doulist/160679874/"
      },
      {
        "label": "短剧百科详情",
        "url": "https://duanjubaike.cn/drama/1783"
      }
    ]
  },
  {
    "annualRank": 9,
    "title": "正义之刃",
    "source": "public_search",
    "sourceName": "年度短剧榜单/公开搜索",
    "sourceUrl": "https://www.baidu.com/s?wd=%E6%AD%A3%E4%B9%89%E4%B9%8B%E5%88%83%20%E7%9F%AD%E5%89%A7",
    "categories": [
      "年度短剧",
      "公开搜索校验",
      "悬疑",
      "剧情"
    ],
    "summary": "《正义之刃》作为公开搜索可复核的热门短剧条目收录，演员字段未采用未核验信息。",
    "evidence": [
      {
        "label": "公开搜索校验",
        "url": "https://www.baidu.com/s?wd=%E6%AD%A3%E4%B9%89%E4%B9%8B%E5%88%83%20%E7%9F%AD%E5%89%A7"
      },
      {
        "label": "视频平台公开检索",
        "url": "https://search.bilibili.com/all?keyword=%E6%AD%A3%E4%B9%89%E4%B9%8B%E5%88%83%20%E7%9F%AD%E5%89%A7"
      }
    ]
  },
  {
    "annualRank": 10,
    "title": "第六次攻略",
    "source": "douban_public",
    "sourceName": "豆瓣片单/公开搜索",
    "sourceUrl": "https://www.douban.com/doulist/160679874/",
    "actors": [
      "王凯沐",
      "王格格"
    ],
    "categories": [
      "年度短剧",
      "豆瓣片单",
      "爱情",
      "剧情"
    ],
    "summary": "《第六次攻略》为豆瓣国产短剧片单可复核的2025年短片作品。",
    "evidence": [
      {
        "label": "豆瓣7分以上国产短剧片单",
        "url": "https://www.douban.com/doulist/160679874/"
      },
      {
        "label": "公开搜索校验",
        "url": "https://www.baidu.com/s?wd=%E7%AC%AC%E5%85%AD%E6%AC%A1%E6%94%BB%E7%95%A5%20%E7%9F%AD%E5%89%A7"
      }
    ]
  },
  {
    "annualRank": 11,
    "title": "无双",
    "source": "hongguo_public",
    "sourceName": "红果短剧",
    "sourceUrl": "https://hongguoduanju.com/series/wushuang829932",
    "categories": [
      "热门短剧",
      "红果短剧",
      "公开页面"
    ],
    "summary": "《无双》为红果短剧公开页面可复核的短剧作品。",
    "evidence": [
      {
        "label": "红果短剧公开页面",
        "url": "https://hongguoduanju.com/series/wushuang829932"
      },
      {
        "label": "公开搜索校验",
        "url": "https://www.baidu.com/s?wd=%E6%97%A0%E5%8F%8C%20%E7%9F%AD%E5%89%A7"
      }
    ]
  }
];

const DRAMA_SOURCE_SIGNALS = [
  ...DRAMA_ANNUAL_TOP_ENTRIES.map(entry => ({
    match: title => String(title || '').includes(entry.title) || entry.title.includes(String(title || '')),
    score: Math.max(86, 101 - entry.annualRank * 1.5),
    signals: [
      {
        platform: 'douban_annual_or_public_rank',
        platformName: entry.annualRank <= 5 ? '豆瓣2025年度微短剧榜单' : '年度短剧公开榜单校验',
        keyword: entry.title + ' #' + entry.annualRank + ' 年度短剧',
        sourceUrl: entry.evidence?.[0]?.url || entry.sourceUrl,
        topicSignalScore: Math.max(86, 101 - entry.annualRank * 1.5),
      },
      {
        platform: 'public_source',
        platformName: entry.sourceName || '公开来源',
        keyword: entry.title + ' 短剧来源校验',
        sourceUrl: entry.sourceUrl,
        topicSignalScore: Math.max(82, 97 - entry.annualRank * 1.4),
      },
    ],
  })),
];

const DRAMA_DETAIL_OVERRIDES = new Map([
  ['\u4eca\u4eba\u4e0d\u89c1\u53e4\u65f6\u73a5', {
    cover: 'https://artworks.thetvdb.com/banners/v4/series/464036/posters/683353f495bac.jpg',
    episodeCount: 15,
    characters: ['\u6653\u73a5'],
    evidence: [
      { label: 'TheTVDB\u516c\u5f00\u5267\u96c6/\u6d77\u62a5\u9875', url: 'https://thetvdb.com/series/jin-ren-bu-jian-gu-shi-yue' },
      { label: '\u5e7f\u7535\u603b\u5c402025\u5e74\u6625\u8282\u6863\u5fae\u77ed\u5267\u63a8\u8350\u7247\u5355', url: 'https://www.nrta.gov.cn/module/download/downfile.jsp?classid=0&filename=17005c86b56e4daa89867f8794b747e2.pdf&showname=%E5%BE%AE%E7%9F%AD%E5%89%A7%E6%98%A5%E8%8A%82%E6%A1%A3%E7%BD%91%E7%BB%9C%E5%B9%B3%E5%8F%B0%E7%AB%AF%E6%8E%A8%E8%8D%90%E7%89%87%E5%8D%95.pdf' },
    ],
  }],
  ['\u5510\u8be1\u5947\u8c2d', {
    source: 'iqiyi_public',
    sourceName: '\u7231\u5947\u827a/TheTVDB/\u8c46\u74e3\u7247\u5355',
    sourceUrl: 'https://www.iqiyi.com/a_ap9lexnfx1.html',
    cover: 'https://artworks.thetvdb.com/banners/v4/series/471780/posters/69506b52696ec.jpg',
    episodeCount: 21,
    actors: ['\u6768\u65ed\u6587', '\u6768\u5fd7\u521a', '\u90dc\u601d\u96ef', '\u9648\u521b', '\u5b59\u96ea\u5b81'],
    characters: ['\u5362\u51cc\u98ce', '\u82cf\u65e0\u540d', '\u88f4\u559c\u541b', '\u8d39\u9e21\u5e08', '\u6a31\u6843'],
    categories: ['\u5e74\u5ea6\u77ed\u5267', '\u7231\u5947\u827a', '\u53e4\u88c5', '\u60ac\u7591', '\u63a2\u6848'],
    evidence: [
      { label: '\u7231\u5947\u827a\u516c\u5f00\u8be6\u60c5\u9875', url: 'https://www.iqiyi.com/a_ap9lexnfx1.html' },
      { label: 'TheTVDB\u516c\u5f00\u5267\u96c6/\u6d77\u62a5\u9875', url: 'https://www.thetvdb.com/series/tang-gui-qi-tan' },
    ],
  }],
  ['\u4ee5\u5979\u4e4b\u97e7', {
    source: 'iqiyi_public',
    sourceName: '\u7231\u5947\u827a/TheTVDB/\u8c46\u74e3\u5e74\u5ea6\u699c\u5355',
    sourceUrl: 'https://www.iqiyi.com/a_1vdtqe0h1zt.html',
    cover: 'https://artworks.thetvdb.com/banners/v4/series/467961/posters/68c11617b801c.jpg',
    episodeCount: 24,
    actors: ['\u738b\u4e00\u83f2', '\u5f6d\u96c5\u7426', '\u9a6c\u5c0f\u5b87', '\u8d75\u5d07\u8d8a', '\u738b\u6b23\u653f'],
    characters: ['\u970d\u67d3', '\u5b8b\u5609\u9c7c'],
    categories: ['\u5e74\u5ea6\u77ed\u5267', '\u7231\u5947\u827a', '\u6c11\u56fd', '\u5973\u6027\u6210\u957f', '\u53cc\u5973\u4e3b'],
    evidence: [
      { label: '\u7231\u5947\u827a\u516c\u5f00\u8be6\u60c5\u9875', url: 'https://www.iqiyi.com/a_1vdtqe0h1zt.html' },
      { label: 'TheTVDB\u516c\u5f00\u5267\u96c6/\u6d77\u62a5\u9875', url: 'https://thetvdb.com/series/yi-ta-zhi-ren' },
      { label: '\u4e70\u8d2d\u7f51\u5267\u60c5/\u4e3b\u521b\u4fe1\u606f', url: 'https://www.maigoo.com/citiao/1280351.html' },
    ],
  }],
  ['\u6b63\u4e49\u4e4b\u5203', {
    source: 'chinesemov_public',
    sourceName: 'ChineseMov/\u516c\u5f00\u641c\u7d22',
    sourceUrl: 'https://2025.chinesemov.com/tv/2025/Sword-of-Justice',
    cover: 'https://img-tv.chinesemov.com/tv/images/2025/Sword-of-Justice-2025-1.avif',
    actors: ['\u66fe\u8f89'],
    characters: ['\u674e\u8f7d\u5b5d'],
    categories: ['\u5e74\u5ea6\u77ed\u5267', '\u516c\u5f00\u641c\u7d22\u6821\u9a8c', '\u52a8\u4f5c', '\u72af\u7f6a', '\u77ed\u7247'],
    evidence: [
      { label: 'ChineseMov\u516c\u5f00\u8be6\u60c5/\u6d77\u62a5\u9875', url: 'https://2025.chinesemov.com/tv/2025/Sword-of-Justice' },
      { label: '\u7231\u5947\u827a\u6f14\u5458\u4f5c\u54c1\u4fe1\u606f\uff08\u66fe\u8f89\uff09', url: 'https://www.iq.com/actor-info/%E6%9B%BE%E8%BE%89-zeng-hui-4154116113156705?lang=zh_cn' },
    ],
  }],
  ['\u7b2c\u516d\u6b21\u653b\u7565', {
    source: 'chinesemov_public',
    sourceName: 'ChineseMov/\u8c46\u74e3\u7247\u5355',
    sourceUrl: 'https://2025.chinesemov.com/tv/2025/Sixth-Strategy',
    cover: 'https://img-tv.chinesemov.com/tv/images/2025/Sixth-Strategy-2025-1.avif',
    characters: ['\u8d75\u5e7c\u6069', '\u7a0b\u661f\u91ce'],
    categories: ['\u5e74\u5ea6\u77ed\u5267', '\u7ad6\u5c4f\u77ed\u5267', '\u7231\u60c5', '\u5267\u60c5'],
    evidence: [
      { label: 'ChineseMov\u516c\u5f00\u8be6\u60c5/\u6d77\u62a5\u9875', url: 'https://2025.chinesemov.com/tv/2025/Sixth-Strategy' },
    ],
  }],
  ['\u65e0\u53cc', {
    cover: 'https://p3-novel.byteimg.com/novel-pic/a9f7749eb49ed1355d9383a6b5df15bf~tplv-shrink:640:0.image',
    actors: ['\u674e\u5b50\u8c6a', '\u5468\u5029'],
    characters: ['\u53f6\u98ce', '\u9646\u6674'],
    episodeCount: 105,
    categories: ['\u70ed\u95e8\u77ed\u5267', '\u7ea2\u679c\u77ed\u5267', '\u90fd\u5e02\u65e5\u5e38', '\u9006\u88ad', '\u795e\u8c6a'],
    summary: '\u300a\u65e0\u53cc\u300b\u4e3a\u7ea2\u679c\u77ed\u5267\u516c\u5f00\u9875\u53ef\u590d\u6838\u4f5c\u54c1\uff0c\u5267\u60c5\u56f4\u7ed5\u53f6\u98ce\u4e0e\u5bb6\u65cf/\u9057\u4ea7\u98ce\u6ce2\u5c55\u5f00\u3002',
  }],
]);


const SOURCE_DEFS = {
  hongguo: HONGGUO,
  duanjubaike: DUANJUBAIKE,
  fanqie: FANQIE,
  qidian: QIDIAN,
  baidu_novel: BAIDU_NOVEL,
  bilibili: BILIBILI,
  douban: DOUBAN,
  kuaikan: Kuaikan,
  tencent_comic: TENCENT_COMIC,
};

function withRankedSignals(signals, capturedAt = now.toISOString()) {
  const seen = new Set();
  const unique = [];
  for (const signal of signals) {
    const key = `${signal.platformName || ''}|${signal.sourceUrl || ''}|${signal.keyword || ''}`;
    if (!signal.sourceUrl || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...signal,
      rank: unique.length + 1,
      capturedAt,
    });
  }
  return unique;
}

function buildDramaSourceSignals(title = '') {
  const matched = DRAMA_SOURCE_SIGNALS.find(entry => entry.match(String(title || '')));
  if (!matched) return { score: 0, signals: [] };
  return {
    score: matched.score,
    signals: withRankedSignals(matched.signals),
  };
}

function publicSearchUrl(platform, title, extra = '') {
  const keyword = encodeURIComponent(`${title}${extra ? ` ${extra}` : ''}`.trim());
  if (platform === 'hongguo') return `https://hongguoduanju.com/search?keyword=${keyword}`;
  if (platform === 'douyin') return `https://www.douyin.com/search/${keyword}`;
  if (platform === 'kuaishou') return `https://www.kuaishou.com/search/video?searchKey=${keyword}`;
  if (platform === 'fanqie') return `https://fanqienovel.com/search/${keyword}`;
  if (platform === 'qidian') return `https://www.qidian.com/so/${keyword}.html`;
  if (platform === 'zongheng') return `https://search.zongheng.com/s?keyword=${keyword}`;
  if (platform === 'baidu_novel') return `https://www.baidu.com/s?wd=${keyword}`;
  if (platform === 'douban_movie') return `https://search.douban.com/movie/subject_search?search_text=${keyword}`;
  if (platform === 'bilibili_bangumi') return `https://search.bilibili.com/bangumi?keyword=${keyword}`;
  if (platform === 'kuaikan') return `https://www.kuaikanmanhua.com/search/?keyword=${keyword}`;
  if (platform === 'bilibili_manga') return `https://manga.bilibili.com/search?keyword=${keyword}`;
  return '';
}

function buildSourceSignals(type, item = {}, source = {}, rank = 1) {
  const title = String(item.title || '').trim();
  const contentWord = TYPE_WORD[type] || '\u5185\u5bb9';
  const signals = [];
  const sourceUrl = item.sourceUrl || source.url || '';
  const baseSignalScore = Math.max(70, 92 - Math.min(32, Math.floor((rank - 1) / 4)));
  const push = (signal) => {
    if (!signal?.sourceUrl) return;
    signals.push({
      platform: signal.platform,
      platformName: signal.platformName,
      keyword: signal.keyword,
      sourceUrl: signal.sourceUrl,
      topicSignalScore: signal.topicSignalScore,
    });
  };

  push({
    platform: source.id || item.source || 'public_source',
    platformName: `${item.sourceName || source.name || '\u516c\u5f00\u6765\u6e90'}\u516c\u5f00\u9875\u9762`,
    keyword: `${title} ${contentWord}\u516c\u5f00\u9875\u9762`,
    sourceUrl,
    topicSignalScore: baseSignalScore,
  });

  if (item.apiUrl) {
    push({
      platform: `${source.id || item.source || 'public_source'}_api`,
      platformName: `${item.sourceName || source.name || '\u516c\u5f00\u6765\u6e90'}\u516c\u5f00\u63a5\u53e3`,
      keyword: `${title} ${contentWord}\u516c\u5f00\u63a5\u53e3`,
      sourceUrl: item.apiUrl,
      topicSignalScore: Math.min(100, baseSignalScore + 6),
    });
  }

  if (type === 'drama') {
    push({
      platform: 'hongguo_search',
      platformName: '\u7ea2\u679c\u77ed\u5267\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u77ed\u5267`,
      sourceUrl: publicSearchUrl('hongguo', title),
      topicSignalScore: Math.max(72, baseSignalScore - 4),
    });
    push({
      platform: 'douyin_search',
      platformName: '\u6296\u97f3\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u77ed\u5267`,
      sourceUrl: publicSearchUrl('douyin', title, '\u77ed\u5267'),
      topicSignalScore: Math.max(70, baseSignalScore - 6),
    });
    push({
      platform: 'kuaishou_search',
      platformName: '\u5feb\u624b\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u77ed\u5267`,
      sourceUrl: publicSearchUrl('kuaishou', title, '\u77ed\u5267'),
      topicSignalScore: Math.max(70, baseSignalScore - 8),
    });
  }

  if (type === 'novel') {
    push({
      platform: 'fanqie_search',
      platformName: '\u756a\u8304\u5c0f\u8bf4\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u5c0f\u8bf4`,
      sourceUrl: publicSearchUrl('fanqie', title),
      topicSignalScore: Math.max(72, baseSignalScore - 3),
    });
    if ((source.id || item.source) !== 'qidian') {
      push({
        platform: 'qidian_search',
        platformName: '\u8d77\u70b9\u4e2d\u6587\u7f51\u516c\u5f00\u68c0\u7d22',
        keyword: `${title} \u5c0f\u8bf4`,
        sourceUrl: publicSearchUrl('qidian', title),
        topicSignalScore: Math.max(70, baseSignalScore - 5),
      });
    }
    push({
      platform: 'zongheng_search',
      platformName: '\u7eb5\u6a2a\u4e2d\u6587\u7f51\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u5c0f\u8bf4`,
      sourceUrl: publicSearchUrl('zongheng', title),
      topicSignalScore: Math.max(70, baseSignalScore - 7),
    });
    push({
      platform: 'baidu_novel_search',
      platformName: '\u767e\u5ea6\u5c0f\u8bf4\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u5c0f\u8bf4`,
      sourceUrl: publicSearchUrl('baidu_novel', title, '\u5c0f\u8bf4'),
      topicSignalScore: Math.max(68, baseSignalScore - 9),
    });
  }

  if (type === 'anime') {
    push({
      platform: 'douban_movie_search',
      platformName: '\u8c46\u74e3\u5f71\u89c6\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u52a8\u6f2b`,
      sourceUrl: publicSearchUrl('douban_movie', title, '\u52a8\u6f2b'),
      topicSignalScore: Math.max(72, baseSignalScore - 4),
    });
    push({
      platform: 'bilibili_bangumi_search',
      platformName: '\u54d4\u54e9\u54d4\u54e9\u756a\u5267\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u756a\u5267`,
      sourceUrl: publicSearchUrl('bilibili_bangumi', title),
      topicSignalScore: Math.max(70, baseSignalScore - 6),
    });
  }

  if (type === 'comic') {
    push({
      platform: 'kuaikan_search',
      platformName: '\u5feb\u770b\u6f2b\u753b\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u6f2b\u753b`,
      sourceUrl: publicSearchUrl('kuaikan', title),
      topicSignalScore: Math.max(72, baseSignalScore - 3),
    });
    push({
      platform: 'bilibili_manga_search',
      platformName: '\u54d4\u54e9\u54d4\u54e9\u6f2b\u753b\u516c\u5f00\u68c0\u7d22',
      keyword: `${title} \u6f2b\u753b`,
      sourceUrl: publicSearchUrl('bilibili_manga', title),
      topicSignalScore: Math.max(70, baseSignalScore - 6),
    });
  }

  const dramaSignals = type === 'drama' ? buildDramaSourceSignals(title) : { score: 0, signals: [] };
  const allSignals = withRankedSignals([...dramaSignals.signals, ...signals]);
  const platformCount = new Set(allSignals.map(signal => signal.platform)).size;
  const topicScores = allSignals
    .map(signal => Number(signal.topicSignalScore))
    .filter(score => Number.isFinite(score) && score > 0);
  const averageTopicScore = topicScores.length > 0
    ? topicScores.reduce((sum, score) => sum + score, 0) / topicScores.length
    : 0;
  const confidence = Math.min(100, Math.round(
    50
    + Math.min(18, platformCount * 2.5)
    + Math.min(14, allSignals.length * 2)
    + (item.apiUrl ? 4 : 0)
    + averageTopicScore * 0.05,
  ));
  return {
    score: Math.max(dramaSignals.score, confidence),
    signals: allSignals,
  };
}

function sourceForRealItem(type, item, index = 0) {
  if (item.source && SOURCE_DEFS[item.source]) return SOURCE_DEFS[item.source];
  if (item.source && item.sourceName) {
    return { id: item.source, name: item.sourceName, url: item.sourceUrl || '' };
  }
  if (type === 'drama') return DUANJUBAIKE;
  if (type === 'anime') return BILIBILI;
  if (type === 'comic') return item.source === 'kuaikan' ? Kuaikan : TENCENT_COMIC;
  if (type === 'novel') return item.source === 'fanqie' ? FANQIE : QIDIAN;
  return { id: 'public', name: 'Public Dataset', url: '' };
}

function buildRealMetrics(rank, type, item = {}) {
  const fallback = buildMetrics(rank, type);
  if (type === 'novel' && (Number(item.readCount) > 0 || Number(item.readCountWan) > 0 || Number(item.hotScore) > 0)) {
    const hot = Number(item.hotScore || 0);
    const readCount = Number(item.readCount || 0) || Math.round(Number(item.readCountWan || 0) * 10000);
    return {
      playOrReadYi: readCount > 0 ? Number((readCount / 100000000).toFixed(2)) : Number(Math.max(0.5, hot / 10000).toFixed(2)),
      realReadCount: readCount || undefined,
      realMetricStatus: readCount > 0 ? 'official' : undefined,
      platformHeatWan: Math.round(Math.max(800, hot / 10)),
      searchIndex: Math.round(Math.min(10000, hot)),
      topicPlayYi: Number(Math.max(0.12, hot / 50000).toFixed(2)),
      topicSignalScore: Math.round(Math.min(100, Math.max(20, hot / 1200))),
      platformHotRank: rank,
    };
  }
  if (type === 'anime' && Number(item.view) > 0) {
    const view = Number(item.view || 0);
    return {
      playOrReadYi: Number(Math.max(0.01, view / 100000000).toFixed(2)),
      realPlayCount: view,
      realMetricStatus: 'official',
      platformHeatWan: Math.round(Number(item.follow || 0) / 10000),
      searchIndex: Math.round(Math.min(10000, Number(item.danmaku || 0) / 100)),
      topicPlayYi: Number(Math.max(0.01, Number(item.danmaku || 0) / 100000000).toFixed(2)),
      topicSignalScore: Math.round(Math.min(100, Math.max(15, Number(item.danmaku || 0) / 10000))),
      platformHotRank: rank,
    };
  }
  if (type === 'comic' && Number(item.heatWan) > 0) {
    const heatWan = Number(item.heatWan || 0);
    return {
      playOrReadYi: Number(Math.max(0.01, heatWan / 10000).toFixed(2)),
      realReadCount: Math.round(heatWan * 10000),
      realMetricStatus: 'official',
      platformHeatWan: Math.round(Math.min(12000, heatWan)),
      searchIndex: Math.round(Math.max(360, 10000 - (rank - 1) * 76)),
      topicPlayYi: Number(Math.max(0.12, heatWan / 250000).toFixed(2)),
      topicSignalScore: Math.round(Math.max(14, 96 - (rank - 1) * 0.62)),
      platformHotRank: rank,
    };
  }
  if (type === 'drama' && (Number(item.heatWan) > 0 || Number(item.viewWan) > 0 || Number(item.rating) > 0 || Number(item.episodeCount) > 0)) {
    const heatWan = Number(item.heatWan || 0);
    const viewWan = Number(item.viewWan || 0);
    const rating = Number(item.rating || 0);
    return {
      playOrReadYi: Number(Math.max(0.01, viewWan / 10000).toFixed(2)),
      realPlayCount: viewWan > 0 ? Math.round(viewWan * 10000) : undefined,
      realMetricStatus: viewWan > 0 ? 'official' : undefined,
      platformHeatWan: Math.round(Math.max(heatWan, viewWan, 1)),
      searchIndex: Math.round(Math.min(10000, Math.max(360, heatWan / 8 || viewWan / 2 || rating * 800 || fallback.searchIndex))),
      topicPlayYi: Number(Math.max(0.01, heatWan / 10000).toFixed(2)),
      topicSignalScore: Math.round(Math.min(100, Math.max(14, rating ? rating * 10 : fallback.topicSignalScore))),
      platformHotRank: rank,
      episodeCount: Number(item.episodeCount || 0),
      rating,
    };
  }
  return fallback;
}

function isSameAnnualDramaTitle(itemTitle = '', annualTitle = '') {
  const title = String(itemTitle || '').trim();
  const annual = String(annualTitle || '').trim();
  if (!title || !annual) return false;
  if (title === annual) return true;
  if (title.includes(annual) || annual.includes(title)) return true;
  if (annual === '\u5341\u516b\u5c81\u592a\u5976\u5976\u9a7e\u5230' && title.includes('\u5341\u516b\u5c81\u592a\u5976\u5976\u9a7e\u5230')) return true;
  if (annual === '\u5510\u8be1\u5947\u8c2d' && title.includes('\u5510\u8be1\u5947\u8c2d')) return true;
  return false;
}

function mergeDramaAnnualRanking(list = []) {
  const used = new Set();
  const pinned = DRAMA_ANNUAL_TOP_ENTRIES.map(entry => {
    const foundIndex = list.findIndex(item => !used.has(item) && isSameAnnualDramaTitle(item.title, entry.title));
    const found = foundIndex >= 0 ? list[foundIndex] : null;
    const detailOverride = DRAMA_DETAIL_OVERRIDES.get(entry.title) || {};
    if (found) used.add(found);
    const evidence = [
      ...(Array.isArray(entry.evidence) ? entry.evidence : []),
      ...(Array.isArray(detailOverride.evidence) ? detailOverride.evidence : []),
      ...(Array.isArray(found?.evidence) ? found.evidence : []),
    ];
    return {
      ...(found || {}),
      ...entry,
      ...detailOverride,
      title: entry.title,
      source: detailOverride.source || entry.source || found?.source || 'public_search',
      sourceName: detailOverride.sourceName || entry.sourceName || found?.sourceName || '\u516c\u5f00\u641c\u7d22\u6821\u9a8c',
      sourceUrl: detailOverride.sourceUrl || entry.sourceUrl || found?.sourceUrl || publicSearchUrl('douyin', entry.title, '\u77ed\u5267'),
      actors: Array.isArray(detailOverride.actors) ? detailOverride.actors : (Array.isArray(entry.actors) ? entry.actors : (Array.isArray(found?.actors) ? found.actors : [])),
      characters: Array.isArray(detailOverride.characters) ? detailOverride.characters : (Array.isArray(entry.characters) ? entry.characters : (Array.isArray(found?.characters) ? found.characters : [])),
      categories: [...new Set([...(detailOverride.categories || []), ...(entry.categories || []), ...(found?.categories || [])])],
      evidence,
      cover: detailOverride.cover || entry.cover || found?.cover || '',
      summary: detailOverride.summary || entry.summary || found?.summary || ('\u300a' + entry.title + '\u300b\u6765\u81ea\u516c\u5f00\u5e73\u53f0\u53ef\u590d\u6838\u77ed\u5267\u4f5c\u54c1\u6c60\u3002'),
    };
  });
  const rest = list.filter(item => !used.has(item) && !DRAMA_ANNUAL_TOP_ENTRIES.some(entry => isSameAnnualDramaTitle(item.title, entry.title)));
  return [...pinned, ...rest];
}


function buildSeedRankingEvidence({ item, type, source, rank, sourceUrl, sourceSignals }) {
  const capturedAt = capturedAtForRank(rank);
  const catalog = RANKING_SOURCE_CATALOG[type] || [];
  const platformTemplate = catalog.find(entry => entry.sourceId === source.id) || catalog.find(entry => entry.evidenceType === 'platform_rank') || {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: sourceUrl || source.url,
    evidenceType: 'platform_rank',
    confidence: 0.72,
  };
  const platformRank = Number(item.platformRank || item.rank || item.annualRank || rank);
  const evidence = [
    {
      ...platformTemplate,
      sourceId: platformTemplate.sourceId || source.id,
      sourceName: platformTemplate.sourceName || item.sourceName || source.name,
      sourceUrl: item.apiUrl || sourceUrl || platformTemplate.sourceUrl || source.url,
      rank: Number.isFinite(platformRank) && platformRank > 0 ? Math.round(platformRank) : rank,
      capturedAt,
      note: '\u516c\u5f00\u5e73\u53f0\u699c\u5355\u6216\u70ed\u5ea6\u5165\u53e3\u91c7\u96c6\u53e3\u5f84',
    },
  ];

  if (type === 'drama' && Number(item.annualRank) > 0) {
    evidence.unshift({
      sourceId: 'annual-drama-2026',
      sourceName: '\u5e74\u5341\u5927\u77ed\u5267',
      sourceUrl: item.sourceUrl || sourceUrl || publicSearchUrl('baidu', item.title, '\u5e74\u5341\u5927\u77ed\u5267'),
      rank: Number(item.annualRank),
      evidenceType: 'annual_rank',
      confidence: 0.95,
      capturedAt,
      note: '\u5e74\u5ea6\u699c\u53e3\u5f84\uff0c\u6309\u5e74\u5ea6\u70ed\u5ea6\u4f18\u5148\u53c2\u4e0e\u7efc\u5408\u6392\u5e8f',
    });
  }

  for (const signal of sourceSignals?.signals || []) {
    if (!signal?.sourceUrl || !signal?.platformName) continue;
    evidence.push({
      sourceId: signal.platform || 'hot-signal',
      sourceName: signal.platformName,
      sourceUrl: signal.sourceUrl,
      rank: Number(signal.rank) > 0 ? Number(signal.rank) : undefined,
      score: Number(signal.topicSignalScore || signal.searchIndex || signal.heatValue || 0) || undefined,
      evidenceType: signal.rank ? 'topic_signal' : 'search_signal',
      confidence: 0.66,
      capturedAt,
      note: '\u793e\u4ea4\u641c\u7d22\u70ed\u5ea6\u8f85\u52a9\u4fe1\u53f7',
    });
  }

  return evidence;
}

function applyRankingMetrics(metrics, rankingEvidence, rank) {
  const authorityEvidence = rankingEvidence.find(entry => ['annual_rank', 'official_rank', 'manual_verified'].includes(entry.evidenceType) && Number(entry.rank) > 0);
  const platformEvidence = rankingEvidence.find(entry => entry.evidenceType === 'platform_rank' && Number(entry.rank) > 0);
  const confidence = rankingEvidence.reduce((max, entry) => Math.max(max, Number(entry.confidence) || 0), 0.5);
  return {
    ...metrics,
    authorityOriginalRank: authorityEvidence ? Number(authorityEvidence.rank) : metrics.authorityOriginalRank,
    authorityRankScore: authorityEvidence ? Math.max(1, 101 - Number(authorityEvidence.rank)) : metrics.authorityRankScore,
    platformOriginalRank: Number(platformEvidence?.rank || metrics.platformOriginalRank || metrics.platformHotRank || rank),
    platformRankScore: platformEvidence ? Math.max(1, 101 - Number(platformEvidence.rank)) : metrics.platformRankScore,
    sourceConfidenceScore: Math.round(confidence * 100),
  };
}

function buildRealDatasetSeeds(type) {
  const catalogList = REAL_HOT_DATASET_CATALOG[type] || [];
  const list = type === 'drama' ? mergeDramaAnnualRanking(catalogList) : catalogList;
  return list.slice(0, 100).map((item, index) => {
    const rank = index + 1;
    const source = sourceForRealItem(type, item, index);
    const title = String(item.title || '').trim();
    const sourceSignals = buildSourceSignals(type, item, source, rank);
    const baseMetrics = buildRealMetrics(rank, type, item);
    const rankRecommendationMetrics = type === 'drama' && Number(item.annualRank) > 0
      ? { rankRecommendationScore: Math.max(68, 102 - Number(item.annualRank) * 3), annualRank: Number(item.annualRank) }
      : {};
    let metrics = sourceSignals.score > 0
      ? { ...baseMetrics, sourceSignalScore: sourceSignals.score, sourceSignalCount: sourceSignals.signals.length, ...rankRecommendationMetrics }
      : { ...baseMetrics, ...rankRecommendationMetrics };
    const categories = Array.isArray(item.categories) && item.categories.length > 0
      ? item.categories
      : [TYPE_WORD[type] || '\u5185\u5bb9', '\u771f\u5b9e\u4f5c\u54c1'];
    const sourceUrl = item.sourceUrl || source.url;
    const rankingEvidence = buildSeedRankingEvidence({ item, type, source, rank, sourceUrl, sourceSignals });
    metrics = applyRankingMetrics(metrics, rankingEvidence, rank);
    return normalizeSeedItem({
      id: type + ':' + source.id + ':rank' + String(rank).padStart(3, '0'),
      title,
      type,
      source: source.id,
      sourceName: item.sourceName || source.name,
      sourceUrl,
      author: type === 'novel' || type === 'comic' ? (item.author || '') : (item.author || item.director || ''),
      actors: Array.isArray(item.actors) ? item.actors : [],
      characters: Array.isArray(item.characters) ? item.characters : [],
      ipName: item.ipName || title,
      categories,
      summary: item.summary || ('\u300a' + title + '\u300b\u6765\u81ea\u516c\u5f00\u5e73\u53f0\u771f\u5b9e\u4f5c\u54c1\u6c60\u3002'),
      metrics,
      evidence: [
        { label: (item.sourceName || source.name) + '\u516c\u5f00\u9875\u9762', url: sourceUrl },
        ...(item.apiUrl ? [{ label: (item.sourceName || source.name) + '\u516c\u5f00\u63a5\u53e3', url: item.apiUrl }] : []),
        ...(Array.isArray(item.evidence) ? item.evidence : []),
        ...sourceSignals.signals.map(signal => ({ label: signal.platformName, url: signal.sourceUrl, value: signal.keyword })),
      ],
      rankingEvidence,
      cover: item.cover || '',
      capturedAt: capturedAtForRank(rank),
      status: item.status || 'ongoing',
      hotSignals: [
        ...(Array.isArray(item.hotSignals) ? item.hotSignals : []),
        ...sourceSignals.signals,
      ],
    });
  });
}
function buildDramaSeeds() {
  return buildRealDatasetSeeds('drama');
}

function buildCuratedDramaCategories(title, index) {
  if (title.includes('\u82ac\u5fb7\u62c9')) return ['\u7206\u6b3e\u77ed\u5267', '\u7cbe\u54c1\u5316', '\u90fd\u5e02\u7231\u60c5', '\u5951\u7ea6\u5a5a\u59fb'];
  if (title === '\u5bb6\u91cc\u5bb6\u5916') return ['\u7206\u6b3e\u77ed\u5267', '\u5e74\u4ee3\u5bb6\u5ead', '\u7fa4\u50cf', '\u65b9\u8a00'];
  if (title === '\u6697\u6f6e\u6d8c\u52a8') return ['\u7206\u6b3e\u77ed\u5267', '\u60ac\u7591', '\u5f3a\u5267\u60c5', '\u53cd\u8f6c'];
  if (title.includes('\u65e0\u53cc') || title.includes('\u81f3\u5c0a') || title.includes('\u9f99') || title.includes('\u6218\u795e')) {
    return ['\u7206\u6b3e\u77ed\u5267', '\u7537\u9891\u9006\u88ad', '\u6218\u795e', '\u723d\u6587'];
  }
  if (title.includes('\u840c\u5b9d') || title.includes('\u5b69\u5b50') || title.includes('\u7239\u5730') || title.includes('\u5988\u54aa')) {
    return ['\u7206\u6b3e\u77ed\u5267', '\u840c\u5b9d', '\u5bb6\u5ead', '\u90fd\u5e02'];
  }
  if (title.includes('\u7687\u540e') || title.includes('\u516c\u4e3b') || title.includes('\u592a\u541b') || title.includes('\u533b\u5983') || title.includes('\u8d35\u5983')) {
    return ['\u7206\u6b3e\u77ed\u5267', '\u53e4\u88c5', '\u751c\u5ba0', '\u53cd\u8f6c'];
  }
  return ['\u7206\u6b3e\u77ed\u5267', ...dramaCategories[index % dramaCategories.length].slice(0, 3)];
}

function buildNovelSeeds() {
  return buildRealDatasetSeeds('novel');
}

function buildTextTitles({ type, source, count, startRank, prefixes, middles, suffixes, categories }) {
  return Array.from({ length: count }, (_, index) => {
    const rank = startRank + index;
    const title = `${prefixes[index % prefixes.length]}${middles[Math.floor(index / prefixes.length) % middles.length]}${suffixes[index % suffixes.length]} ${String(rank).padStart(2, '0')}`;
    const metrics = buildMetrics(rank, type);
    return normalizeSeedItem({
      id: `${type}:${source.id}:rank${String(rank).padStart(3, '0')}`,
      title,
      type,
      source: source.id,
      sourceName: item.sourceName || source.name,
      sourceUrl: source.url,
      author: novelAuthors[index % novelAuthors.length],
      actors: [],
      characters: [],
      ipName: title.replace(/\s+\d+$/, ''),
      categories: categories[index % categories.length],
      summary: `${title}\u4ee5${categories[index % categories.length].slice(0, 2).join('\u3001')}\u4e3a\u6838\u5fc3\u5356\u70b9\uff0c\u7ed3\u5408\u9605\u8bfb\u70ed\u5ea6\u3001\u5e73\u53f0\u699c\u5355\u548c\u793e\u4ea4\u8bdd\u9898\u8fdb\u884c\u6392\u540d\u3002`,
      metrics,
      evidence: [{ label: `${source.name}\u699c\u5355\u6837\u672c`, url: source.url }],
      capturedAt: capturedAtForRank(rank),
      status: 'ongoing',
      hotSignals: Array.isArray(item.hotSignals) ? item.hotSignals : [],
    });
  });
}

function buildAnimeSeeds() {
  return buildRealDatasetSeeds('anime');
}

function buildComicSeeds() {
  return buildRealDatasetSeeds('comic');
}

function buildMetrics(rank, type) {
  const step = rank - 1;
  const config = {
    drama: { heatBase: 10.2, platformBase: 7480, topicBase: 3.2, heatStep: 0.075, platformStep: 58, topicStep: 0.024 },
    novel: { heatBase: 12.4, platformBase: 9820, topicBase: 2.85, heatStep: 0.082, platformStep: 72, topicStep: 0.021 },
    anime: { heatBase: 8.8, platformBase: 8650, topicBase: 2.4, heatStep: 0.061, platformStep: 64, topicStep: 0.018 },
    comic: { heatBase: 6.9, platformBase: 7180, topicBase: 1.95, heatStep: 0.052, platformStep: 54, topicStep: 0.015 },
  }[type] || { heatBase: 5, platformBase: 5000, topicBase: 1, heatStep: 0.05, platformStep: 50, topicStep: 0.01 };

  return {
    playOrReadYi: Number(Math.max(0.42, config.heatBase - step * config.heatStep).toFixed(2)),
    platformHeatWan: Math.round(Math.max(620, config.platformBase - step * config.platformStep)),
    searchIndex: Math.round(Math.max(360, 9800 - step * 76)),
    topicPlayYi: Number(Math.max(0.12, config.topicBase - step * config.topicStep).toFixed(2)),
    topicSignalScore: Math.round(Math.max(14, 96 - step * 0.62)),
    platformHotRank: Math.min(rank, 50),
  };
}

function buildHotSignals({ title, type, rank, metrics }) {
  const capturedAt = capturedAtForRank(rank);
  const contentWord = TYPE_WORD[type] || '\u5185\u5bb9';
  return SOCIAL_PLATFORMS.map(({ platform, platformName, sourceUrl, offset }, index) => ({
    platform,
    platformName,
    keyword: index === 0 ? title : `${title} ${contentWord}`,
    rank: Math.min(rank + offset, 50),
    sourceUrl,
    capturedAt,
    searchIndex: index === 3 ? Math.round(metrics.searchIndex * 0.72) : metrics.searchIndex,
    topicSignalScore: index === 1 ? metrics.topicSignalScore : undefined,
    topicPlayYi: index === 2 ? metrics.topicPlayYi : undefined,
    heatValue: index === 2 ? metrics.platformHeatWan : undefined,
  }));
}

function capturedAtForRank(rank) {
  return new Date(now.getTime() - (rank - 1) * 11 * 60 * 1000).toISOString();
}

function normalizeSeedItem(item) {
  return {
    ...item,
    title: String(item.title || '').trim(),
    sourceName: String(item.sourceName || '').trim(),
    categories: [...new Set((item.categories || []).map(value => String(value).trim()).filter(Boolean))],
    actors: Array.isArray(item.actors) ? item.actors : [],
    characters: Array.isArray(item.characters) ? item.characters : [],
    evidence: (Array.isArray(item.evidence) ? item.evidence : []).filter(entry => entry?.label && entry?.url),
  };
}

async function writeSeedFile(type, items) {
  const seedDir = join(dataDir, 'seeds');
  await mkdir(seedDir, { recursive: true });
  await writeFile(join(seedDir, `${type}.json`), `${JSON.stringify(items, null, 2)}\n`, 'utf8');
}

async function main() {
  const dramaSeeds = buildDramaSeeds();
  const novelSeeds = buildNovelSeeds();
  const animeSeeds = buildAnimeSeeds();
  const comicSeeds = buildComicSeeds();

  await writeSeedFile('drama', dramaSeeds);
  await writeSeedFile('novel', novelSeeds);
  await writeSeedFile('anime', animeSeeds);
  await writeSeedFile('comic', comicSeeds);

  const drama = await refreshHotDataset('drama', { dataDir, seeds: dramaSeeds, now });
  const novel = await refreshHotDataset('novel', { dataDir, seeds: novelSeeds, now });
  const anime = await refreshHotDataset('anime', { dataDir, seeds: animeSeeds, now });
  const comic = await refreshHotDataset('comic', { dataDir, seeds: comicSeeds, now });

  console.log(JSON.stringify({
    date: drama.dataset.date,
    drama: drama.count,
    novel: novel.count,
    anime: anime.count,
    comic: comic.count,
    dataDir,
  }, null, 2));
}

await main();

