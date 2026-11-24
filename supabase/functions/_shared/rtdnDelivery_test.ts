import { assertEquals } from 'jsr:@std/assert@1'
import { dispositionForPlayLookup, rtdnStatusFor } from './rtdnDelivery.ts'

Deno.test('permanent Play lookup failures are acknowledged so Pub/Sub stops redelivering', () => {
  for (const status of [400, 404, 410, 422]) {
    assertEquals(dispositionForPlayLookup(status), 'drop', `status ${status}`)
    assertEquals(rtdnStatusFor(dispositionForPlayLookup(status)), 200)
  }
})

Deno.test('credential and temporary Google failures are retried with backoff', () => {
  for (const status of [0, 401, 403, 408, 429, 500, 502, 503, 504]) {
    assertEquals(dispositionForPlayLookup(status), 'retry', `status ${status}`)
    assertEquals(rtdnStatusFor(dispositionForPlayLookup(status)), 503)
  }
})
