/**
 * Authenticate an internal Edge Function call using the server-held service
 * role credential. Hashing both values keeps comparison work independent of
 * the caller-controlled token length and avoids trusting decoded JWT claims.
 */
export async function hasServiceRoleBearer(
  request: Request,
  expectedServiceRoleKey: string,
): Promise<boolean> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return false

  const supplied = authorization.slice('Bearer '.length).trim()
  if (!supplied || !expectedServiceRoleKey) return false

  const encoder = new TextEncoder()
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expectedServiceRoleKey)),
  ])
  const left = new Uint8Array(suppliedHash)
  const right = new Uint8Array(expectedHash)
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}
