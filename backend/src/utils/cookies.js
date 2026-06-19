export function parseCookies(cookieHeader = '') {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const [name, ...rest] = item.split('=');
      if (!name) return acc;
      try {
        acc[name] = decodeURIComponent(rest.join('='));
      } catch {
        acc[name] = rest.join('=');
      }
      return acc;
    }, {});
}

export function getCookie(req, name) {
  return parseCookies(req.headers.cookie || '')[name];
}
