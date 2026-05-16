function isCoverHidden() {
  const raw = String(process.env.MEDIAHUB_HIDE_COVER || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function stripCoverFromContent(content) {
  if (!content || typeof content !== 'object') return content;
  const { cover, ...rest } = content;

  if (Array.isArray(rest.relatedContents)) {
    rest.relatedContents = rest.relatedContents.map(item => stripCoverFromContent(item));
  }
  if (Array.isArray(rest.similarContents)) {
    rest.similarContents = rest.similarContents.map(item => stripCoverFromContent(item));
  }
  return rest;
}

function mapWatchHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    content: stripCoverFromContent(entry.content),
  };
}

function mapPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map(item => {
      if (item && typeof item === 'object' && 'watchedAt' in item && 'content' in item) {
        return mapWatchHistoryEntry(item);
      }
      return stripCoverFromContent(item);
    });
  }

  if (!payload || typeof payload !== 'object') return payload;

  if (Array.isArray(payload.list)) {
    return {
      ...payload,
      list: payload.list.map(item => stripCoverFromContent(item)),
    };
  }

  if ('watchedAt' in payload && 'content' in payload) {
    return mapWatchHistoryEntry(payload);
  }

  return stripCoverFromContent(payload);
}

function shapeContentResponse(payload) {
  if (!isCoverHidden()) return payload;
  return mapPayload(payload);
}

export { shapeContentResponse };
