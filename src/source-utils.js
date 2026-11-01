export function safeSourceUrl(value, hosts, path = /^\//) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      hosts.includes(u.hostname) && path.test(u.pathname);
  } catch { return false; }
}

export function requireApiKey(value, name) {
  if (!value?.trim() || /^(?:YOUR_|PUT_|PASTE_)/i.test(value.trim())) {
    throw Error(`أضف ${name} في ملف .env لتفعيل هذا المصدر`);
  }
  return value.trim();
}

export async function sourceJson(url, {apiFetch = fetch, headers = {}, source} = {}) {
  const response = await apiFetch(url.toString(), {
    headers: {Accept: 'application/json', ...headers},
    signal: AbortSignal.timeout(18000), redirect: 'error'
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw Error(`${source}: تحقق من صلاحية مفتاح API (${response.status})`);
    if (response.status === 429) throw Error(`${source}: وصلت إلى حد الطلبات (429)، حاول لاحقًا`);
    const error = Error(`${source} HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
