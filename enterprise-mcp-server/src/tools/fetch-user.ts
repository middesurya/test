import type { JSONSchema7 } from 'json-schema';
import { Tool, ToolInput, ToolOutput } from '../types';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';

interface FetchUserInput extends ToolInput {
  userId: string;
  includeEmail?: boolean;
  includeProfile?: boolean;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  profile?: {
    bio: string;
    avatar: string;
    createdAt: string;
    lastLoginAt: string;
  };
}

interface FetchUserOutput extends ToolOutput {
  user: UserProfile;
  fetchedAt: string;
}

/**
 * Fetch user profile by ID
 * Requires 'users:read' scope for basic info
 * Requires 'users:read:email' scope for email access
 */
const inputSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    userId: {
      type: 'string',
      description: 'The unique identifier of the user to fetch',
      minLength: 1,
      maxLength: 128
    },
    includeEmail: {
      type: 'boolean',
      description: 'Include user email (requires users:read:email scope)',
      default: false
    },
    includeProfile: {
      type: 'boolean',
      description: 'Include extended profile information',
      default: true
    }
  },
  required: ['userId'],
  additionalProperties: false
};

export const fetchUserTool: Tool<FetchUserInput, FetchUserOutput> = {
  name: 'fetch-user',
  description: 'Fetch user profile by ID with optional email and profile data',
  requiredScopes: ['users:read'],
  inputSchema,

  async execute(input: FetchUserInput): Promise<FetchUserOutput> {
    const startTime = Date.now();

    logger.info({
      tool: 'fetch-user',
      userId: input.userId,
      message: 'Fetching user profile'
    });

    // Audit log for compliance
    auditLog('user.fetch', {
      targetUserId: input.userId,
      includeEmail: input.includeEmail,
      includeProfile: input.includeProfile
    });

    try {
      // Simulate user lookup (replace with actual database/API call)
      const user = await mockFetchUser(input.userId, {
        includeEmail: input.includeEmail,
        includeProfile: input.includeProfile
      });

      logger.info({
        tool: 'fetch-user',
        userId: input.userId,
        duration: Date.now() - startTime,
        message: 'User fetched successfully'
      });

      return {
        user,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error({
        tool: 'fetch-user',
        userId: input.userId,
        error,
        message: 'Failed to fetch user'
      });
      throw error;
    }
  }
};

/**
 * Mock user fetch - replace with actual implementation
 */
async function mockFetchUser(
  userId: string,
  options: { includeEmail?: boolean; includeProfile?: boolean }
): Promise<UserProfile> {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 50));

  // Simulate user not found
  if (userId.startsWith('invalid-')) {
    throw new Error(`User not found: ${userId}`);
  }

  const user: UserProfile = {
    id: userId,
    username: `user_${userId.slice(0, 8)}`,
    displayName: `User ${userId.slice(0, 8).toUpperCase()}`
  };

  if (options.includeEmail) {
    user.email = `${user.username}@example.com`;
  }

  if (options.includeProfile) {
    user.profile = {
      bio: 'A sample user profile',
      avatar: `https://avatars.example.com/${userId}.png`,
      createdAt: '2024-01-15T10:30:00Z',
      lastLoginAt: new Date().toISOString()
    };
  }

  return user;
}
