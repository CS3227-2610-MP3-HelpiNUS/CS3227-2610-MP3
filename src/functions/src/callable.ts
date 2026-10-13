import { HttpsError, onCall, type CallableRequest, type HttpsOptions } from 'firebase-functions/v2/https'
import { ZodError, type ZodType } from 'zod'

export const singaporeRegion = 'asia-southeast1'

export function parseRequest<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string[]> = {}
      for (const issue of error.issues) {
        const key = issue.path.join('.') || '_root'
        fields[key] = [...(fields[key] ?? []), issue.message]
      }
      throw new HttpsError('invalid-argument', 'The request is invalid.', { fieldErrors: fields })
    }
    throw error
  }
}

export function mapError(error: unknown): never {
  if (error instanceof HttpsError) throw error
  console.error('Callable failed', error)
  throw new HttpsError('internal', 'The request could not be completed.')
}

export function callable<T, R>(
  schema: ZodType<T>,
  handler: (input: T, request: CallableRequest<unknown>) => Promise<R>,
  options: HttpsOptions = {},
) {
  return onCall({ region: singaporeRegion, ...options }, async (request) => {
    try {
      const input = parseRequest(schema, request.data)
      return await handler(input, request)
    } catch (error) {
      return mapError(error)
    }
  })
}
