/**
 * Tests for Deployment Configuration Generator
 */

import { getDeploymentTargets } from '../../src/utils/deploy-generator';

describe('Deploy Generator', () => {
  describe('getDeploymentTargets', () => {
    it('should return all supported deployment targets', () => {
      const targets = getDeploymentTargets();

      expect(targets).toHaveLength(4);
      expect(targets.map(t => t.target)).toEqual([
        'docker',
        'lambda',
        'vercel',
        'kubernetes'
      ]);
    });

    it('should include descriptions for each target', () => {
      const targets = getDeploymentTargets();

      targets.forEach(target => {
        expect(target.description).toBeDefined();
        expect(target.description.length).toBeGreaterThan(10);
      });
    });

    it('should have docker as a target', () => {
      const targets = getDeploymentTargets();
      const docker = targets.find(t => t.target === 'docker');

      expect(docker).toBeDefined();
      expect(docker?.description).toContain('Docker');
    });

    it('should have lambda as a target', () => {
      const targets = getDeploymentTargets();
      const lambda = targets.find(t => t.target === 'lambda');

      expect(lambda).toBeDefined();
      expect(lambda?.description).toContain('Lambda');
    });

    it('should have vercel as a target', () => {
      const targets = getDeploymentTargets();
      const vercel = targets.find(t => t.target === 'vercel');

      expect(vercel).toBeDefined();
      expect(vercel?.description).toContain('Vercel');
    });

    it('should have kubernetes as a target', () => {
      const targets = getDeploymentTargets();
      const k8s = targets.find(t => t.target === 'kubernetes');

      expect(k8s).toBeDefined();
      expect(k8s?.description).toContain('Kubernetes');
    });
  });
});
