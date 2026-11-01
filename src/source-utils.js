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

class SourceError extends Error{}
export async function sourceJson(url, {apiFetch = fetch, headers = {}, source='المصدر'} = {}) {
  try{
    const response = await apiFetch(url.toString(), {
      headers: {Accept: 'application/json', ...headers},
      signal: AbortSignal.timeout(18000), redirect: 'error'
    });
    if (!response.ok) {
      const message=[401,403].includes(response.status)?`${source}: تحقق من صلاحية مفتاح API (${response.status})`:
        response.status===429?`${source}: وصلت إلى حد الطلبات (429)، حاول لاحقًا`:`${source} HTTP ${response.status}`;
      const error=new SourceError(message);error.status=response.status;throw error;
    }
    return await response.json();
  }catch(error){
    if(error instanceof SourceError)throw error;
    // Response bodies and transport errors may echo request headers or URLs.
    throw new SourceError(`${source}: تعذر الاتصال بالمصدر أو قراءة رده؛ تحقق من الشبكة وحاول لاحقًا`);
  }
}
