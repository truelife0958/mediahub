function toRelationRef(item, extra = {}) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    rank: item.rank || 0,
    source: item.source,
    sourceName: item.sourceName,
    hotScore: Math.round((Number(item.metrics?.totalScore) || 0) * 10000),
    ...extra,
  };
}

function intersect(left = [], right = []) {
  const rightSet = new Set((right || []).map(value => String(value || '').trim()).filter(Boolean));
  return (left || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => rightSet.has(value));
}

function buildRelationsForItems(items = []) {
  return items.map((item) => {
    const sameIp = items
      .filter(candidate => candidate.id !== item.id && item.ipName && candidate.ipName === item.ipName)
      .slice(0, 8)
      .map(candidate => toRelationRef(candidate, { matchedBy: 'ip', matchedValues: [item.ipName] }));

    const sameActors = items
      .map(candidate => ({ candidate, matchedValues: intersect(item.actors, candidate.actors) }))
      .filter(({ candidate, matchedValues }) => candidate.id !== item.id && matchedValues.length > 0)
      .slice(0, 8)
      .map(({ candidate, matchedValues }) => toRelationRef(candidate, { matchedBy: 'actor', matchedValues }));

    const sameCategories = items
      .map(candidate => ({ candidate, matchedValues: intersect(item.categories, candidate.categories) }))
      .filter(({ candidate, matchedValues }) => candidate.id !== item.id && matchedValues.length > 0)
      .slice(0, 8)
      .map(({ candidate, matchedValues }) => toRelationRef(candidate, { matchedBy: 'category', matchedValues }));

    return {
      ...item,
      relations: {
        sameIp,
        sameActors,
        sameCategories,
        sameCategory: sameCategories,
      },
    };
  });
}

export { buildRelationsForItems };
