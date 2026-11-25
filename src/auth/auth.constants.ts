/** auth 서버(backend)가 로그인할 때 설정하는 access 토큰 쿠키 (path=/ 라서 같은 호스트의 이 서버에도 실려 옴) */
export const ACCESS_COOKIE = 'access_token';

/** 요청의 Cookie 헤더에서 값 하나 읽기 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
