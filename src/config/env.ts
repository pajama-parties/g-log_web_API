/** Nest(ConfigService)와 테스트 양쪽에서 같은 설정을 쓰기 위한 읽기 함수 */
export type EnvGetter = (key: string) => string | undefined;

export function required(get: EnvGetter, key: string): string {
  const value = get(key);
  if (value === undefined || value === '') {
    throw new Error(`환경 변수 ${key} 가 비어 있습니다. API/.env 를 확인하세요 (.env.example 참고).`);
  }
  return value;
}
