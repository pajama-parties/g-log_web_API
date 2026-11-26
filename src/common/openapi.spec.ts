import { z } from 'zod';
import { openApiArray, openApiSchema } from './openapi.js';

const named = z.object({ lower: z.number().int(), upper: z.number().int() }).meta({ id: 'SpecRange' });

describe('openApiSchema', () => {
  it('이름 붙은 스키마도 $ref·definitions 없이 펼쳐서 내보냄 (스웨거 UI Resolver error 방지)', () => {
    const json = JSON.stringify(openApiArray(named));
    expect(json).not.toContain('$ref');
    expect(json).not.toContain('definitions');
    expect(openApiArray(named)).toMatchObject({ type: 'array', items: { type: 'object', properties: { lower: { type: 'integer' } } } });
  });

  it('다른 스키마 안에 들어간 이름 붙은 스키마도 펼침', () => {
    const wrapper = z.object({ pot: named, code: z.string() });
    const json = openApiSchema(wrapper) as { properties: { pot: { properties: object } } };
    expect(JSON.stringify(json)).not.toContain('$ref');
    expect(json.properties.pot.properties).toHaveProperty('upper');
  });
});
