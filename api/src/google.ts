import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Config } from './config'
import type { Ctx } from './types'

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

/** Checks a Google ID token (signature, issuer, audience, expiry, verified email). Outside production with no client ID set, `dev:email:name` is accepted so you can sign in locally. */
export function googleVerifier(config: Config): Ctx['verifyGoogle'] {
  return async credential => {
    if (config.NODE_ENV !== 'production' && !config.GOOGLE_CLIENT_ID && credential.startsWith('dev:')) {
      const [, email = '', name = ''] = credential.split(':')
      return { sub: 'dev-' + email.toLowerCase(), email: email.toLowerCase(), name: name || email.split('@')[0] }
    }
    if (!config.GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not set up on this server')
    const { payload } = await jwtVerify(credential, keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.GOOGLE_CLIENT_ID })
    if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub) throw new Error('Google did not confirm that email address')
    const email = payload.email.toLowerCase()
    return { sub: payload.sub, email, name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0] }
  }
}