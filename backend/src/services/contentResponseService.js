function isCoverHidden() {
  const raw = String(process.env.MEDIAHUB_HIDE_COVER || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

const HEAT_METRIC_BY_TYPE = {
  drama: 'playback',
  novel: 'reading',
  anime: 'playback',
  comic: 'reading',
};

function normalizeHeatMetric(metric, type) {
  const value = String(metric || '').trim().toLowerCase();
  if (value === 'playback' || value === 'reading') return value;
  return HEAT_METRIC_BY_TYPE[type] || 'playback';
}

function shapeContentNode(content, hideCover) {
  if (!content || typeof content !== 'object') return content;
  const { cover, ...rest } = content;
  const base = hideCover ? rest : content;
  const next = { ...base, heatMetric: normalizeHeatMetric(content.heatMetric, content.type) };

  if (Array.isArray(next.relatedContents)) {
    next.relatedContents = next.relatedContents.map(item => shapeContentNode(item, hideCover));
  }
  if (Array.isArray(next.similarContents)) {
    next.similarContents = next.similarContents.map(item => shapeContentNode(item, hideCover));
  }

  return next;
}

function mapPayload(payload, hideCover) {
  if (Array.isArray(payload)) {
    return payload.map(item => shapeContentNode(item, hideCover));
  }

  if (!payload || typeof payload !== 'object') return payload;

  if (Array.isArray(payload.list)) {
    return {
      ...payload,
      list: payload.list.map(item => shapeContentNode(item, hideCover)),
    };
  }

  if (payload.groups && typeof payload.groups === 'object') {
    const groups = Object.fromEntries(
      Object.entries(payload.groups).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(item => shapeContentNode(item, hideCover)) : value,
      ]),
    );
    return {
      ...payload,
      groups,
    };
  }

  return shapeContentNode(payload, hideCover);
}

function shapeContentResponse(payload) {
  return mapPayload(payload, isCoverHidden());
}

export { shapeContentResponse };
