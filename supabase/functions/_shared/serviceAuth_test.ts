import { assertEquals } from 'jsr:@std/assert@1'
import { hasServiceRoleBearer } from './serviceAuth.ts'

Deno.test('service bearer accepts only the exact server-held credential', async () => {
  const key = 'service-role-secret'

  assertEquals(
    await hasServiceRoleBearer(
      new Request('https://example.test', {
        headers: { Authorization: `Bearer ${key}` },
      }),
      key,
    ),
    true,
  )

  assertEquals(
    await hasServiceRoleBearer(
      new Request('https://example.test', {
        headers: { Authorization: 'Bearer forged.jwt.with-service-role-claim' },
      }),
      key,
    ),
    false,
  )
})

Deno.test('service bearer rejects missing and malformed authorization', async () => {
  const key = 'service-role-secret'
  assertEquals(await hasServiceRoleBearer(new Request('https://example.test'), key), false)
  assertEquals(
    await hasServiceRoleBearer(
      new Request('https://example.test', {
        headers: { Authorization: `Basic ${key}` },
      }),
      key,
    ),
    false,
  )
})
