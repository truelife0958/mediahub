import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRelationSections } from '../src/utils/contentRelations.ts';
import type { Content } from '../src/types/index.ts';

function createContent(overrides: Partial<Content> = {}): Content {
  return {
    id: 'drama:hongguo:source',
    title: '复仇千金一号',
    summary: '',
    type: 'drama',
    tags: ['复仇'],
    actors: ['演员甲'],
    author: '',
    ipName: '复仇千金',
    status: 'ongoing',
    hotScore: 900000,
    heatMetric: 'playback',
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('content relation helpers', () => {
  it('builds ordered relation sections and filters broken titles', () => {
    const sections = buildRelationSections(createContent({
      relations: {
        sameIp: [
          { id: 'drama:hongguo:ip', type: 'drama', title: '复仇千金二号', rank: 2, source: 'hongguo', sourceName: '红果短剧', hotScore: 820000 },
        ],
        sameActors: [
          { id: 'drama:hongguo:actor', type: 'drama', title: '演员同款短剧', rank: 3, source: 'hongguo', sourceName: '红果短剧', hotScore: 760000, matchedValues: ['演员甲'] },
          { id: 'drama:hongguo:broken', type: 'drama', title: '锟斤拷短剧', rank: 4, source: 'hongguo', sourceName: '红果短剧', hotScore: 100 },
        ],
        sameCategories: [
          { id: 'drama:hongguo:category', type: 'drama', title: '复仇题材新剧', rank: 5, source: 'hongguo', sourceName: '红果短剧', hotScore: 710000, matchedValues: ['复仇'] },
        ],
      },
    }));

    assert.deepEqual(sections.map(section => [section.id, section.title, section.items.length]), [
      ['sameIp', '同 IP', 1],
      ['sameActors', '同演员', 1],
      ['sameCategories', '同分类', 1],
    ]);
    assert.equal(sections[1].items[0].matchedText, '演员甲');
    assert.equal(sections[2].items[0].matchedText, '复仇');
  });

  it('returns no sections when relation data is empty', () => {
    assert.deepEqual(buildRelationSections(createContent()), []);
  });
});
