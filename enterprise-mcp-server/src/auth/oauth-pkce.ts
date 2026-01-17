import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// JWT secret - in production, load from environment variable
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Token payload interface
export interface TokenPayload {
  sub: string;
  exp: number;
  scope: string[];
  iat?: number;
}

/**
 * Generate PKCE challenge pair for OAuth 2.0 authorization
 */
export function generatePKCEChallenge(): { codeVerifier: string; codeChallenge: string; method: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge, method: 'S256' };
}

/**
 * Verify PKCE challenge using constant-time comparison to prevent timing attacks
 */
export function verifyPKCEChallenge(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');

  // Use constant-time comparison to prevent timing attacks
  const computedBuffer = Buffer.from(computed);
  const challengeBuffer = Buffer.from(challenge);

  if (computedBuffer.length !== challengeBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, challengeBuffer);
}

/**
 * Validate JWT token with proper signature verification
 * @param token - The JWT token to validate
 * @returns Decoded token payload or null if invalid
 */
export function validateToken(token: string): TokenPayload | null {
  try {
    // Verify signature and decode token
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      complete: false
    }) as TokenPayload;

    // Ensure required fields exist
    if (!decoded.sub || !decoded.scope || !Array.isArray(decoded.scope)) {
      return null;
    }

    return decoded;
  } catch (error) {
    // Token verification failed (invalid signature, expired, malformed, etc.)
    return null;
  }
}

/**
 * Generate a signed JWT token
 * @param payload - Token payload with sub, scope, and optional additional claims
 * @param expiresInSeconds - Token expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed JWT token string
 */
export function generateToken(
  payload: { sub: string; scope: string[] },
  expiresInSeconds: number = 3600
): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: expiresInSeconds
  });
}

/**
 * Get the current JWT secret (for testing purposes only)
 */
export function getJWTSecret(): string {
  return JWT_SECRET;
}
