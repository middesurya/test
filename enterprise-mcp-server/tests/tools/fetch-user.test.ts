import { fetchUserTool } from '../../src/tools/fetch-user';

describe('fetch-user tool', () => {
  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(fetchUserTool.name).toBe('fetch-user');
      expect(fetchUserTool.description).toContain('Fetch user profile');
    });

    it('should require users:read scope', () => {
      expect(fetchUserTool.requiredScopes).toContain('users:read');
    });

    it('should have valid input schema', () => {
      const schema = fetchUserTool.inputSchema as {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
      };
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('userId');
      expect(schema.required).toContain('userId');
      expect(schema.additionalProperties).toBe(false);
    });
  });

  describe('execute', () => {
    it('should fetch user with basic info', async () => {
      const result = await fetchUserTool.execute({
        userId: 'user-123'
      });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe('user-123');
      expect(result.user.username).toBeDefined();
      expect(result.user.displayName).toBeDefined();
      expect(result.fetchedAt).toBeDefined();
    });

    it('should include profile when requested', async () => {
      const result = await fetchUserTool.execute({
        userId: 'user-456',
        includeProfile: true
      });

      expect(result.user.profile).toBeDefined();
      expect(result.user.profile?.bio).toBeDefined();
      expect(result.user.profile?.avatar).toBeDefined();
      expect(result.user.profile?.createdAt).toBeDefined();
    });

    it('should include email when requested', async () => {
      const result = await fetchUserTool.execute({
        userId: 'user-789',
        includeEmail: true
      });

      expect(result.user.email).toBeDefined();
      expect(result.user.email).toContain('@');
    });

    it('should exclude email by default', async () => {
      const result = await fetchUserTool.execute({
        userId: 'user-abc'
      });

      expect(result.user.email).toBeUndefined();
    });

    it('should exclude profile when not requested', async () => {
      const result = await fetchUserTool.execute({
        userId: 'user-def',
        includeProfile: false
      });

      expect(result.user.profile).toBeUndefined();
    });

    it('should throw error for invalid user', async () => {
      await expect(
        fetchUserTool.execute({ userId: 'invalid-user-123' })
      ).rejects.toThrow('User not found');
    });

    it('should include all data when both flags are true', async () => {
      const result = await fetchUserTool.execute({
        userId: 'user-full',
        includeEmail: true,
        includeProfile: true
      });

      expect(result.user.email).toBeDefined();
      expect(result.user.profile).toBeDefined();
      expect(result.user.username).toBeDefined();
      expect(result.user.displayName).toBeDefined();
    });
  });
});
