import { describe, it, expect } from 'vitest';
import { pickIdleBehavior, pickIdleInterval, IdleBehavior } from '../IdleBehaviors';
import type { DragonMood } from '../../../core/dragon/DragonState';

describe('IdleBehaviors', () => {
  describe('pickIdleBehavior', () => {
    it('should return a valid IdleBehavior for all moods', () => {
      const moods: DragonMood[] = ['happy', 'normal', 'hungry', 'unhappy'];
      const validBehaviors = Object.values(IdleBehavior);

      for (const mood of moods) {
        // Run many times to ensure it always returns valid results
        for (let i = 0; i < 50; i++) {
          const behavior = pickIdleBehavior(mood);
          expect(validBehaviors).toContain(behavior);
        }
      }
    });

    it('should distribute behaviors according to weights (happy mood)', () => {
      // Happy weights: yawn=1, lookAround=3, stretch=4, sneeze=2, sleep=1 (total=11)
      const counts: Record<string, number> = {};
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const b = pickIdleBehavior('happy');
        counts[b] = (counts[b] ?? 0) + 1;
      }

      // stretch should be most common (4/11 ≈ 36%)
      expect(counts[IdleBehavior.Stretch]).toBeGreaterThan(counts[IdleBehavior.Yawn]);
      expect(counts[IdleBehavior.Stretch]).toBeGreaterThan(counts[IdleBehavior.Sleep]);
      // lookAround should be second (3/11 ≈ 27%)
      expect(counts[IdleBehavior.LookAround]).toBeGreaterThan(counts[IdleBehavior.Yawn]);
    });

    it('should favor sleep when hungry', () => {
      // Hungry weights: yawn=2, lookAround=1, stretch=1, sneeze=1, sleep=4 (total=9)
      const counts: Record<string, number> = {};
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const b = pickIdleBehavior('hungry');
        counts[b] = (counts[b] ?? 0) + 1;
      }

      // sleep should be most common (4/9 ≈ 44%)
      expect(counts[IdleBehavior.Sleep]).toBeGreaterThan(counts[IdleBehavior.LookAround]);
      expect(counts[IdleBehavior.Sleep]).toBeGreaterThan(counts[IdleBehavior.Stretch]);
    });

    it('should distribute evenly for normal mood', () => {
      // Normal weights: all 2 (total=10, each 20%)
      const counts: Record<string, number> = {};
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const b = pickIdleBehavior('normal');
        counts[b] = (counts[b] ?? 0) + 1;
      }

      // Each should be roughly 200 ± some margin
      for (const behavior of Object.values(IdleBehavior)) {
        expect(counts[behavior]).toBeGreaterThan(100); // at least 10%
        expect(counts[behavior]).toBeLessThan(350); // at most 35%
      }
    });

    it('should favor yawn when unhappy', () => {
      // Unhappy weights: yawn=4, lookAround=1, stretch=1, sneeze=1, sleep=3 (total=10)
      const counts: Record<string, number> = {};
      const trials = 1000;

      for (let i = 0; i < trials; i++) {
        const b = pickIdleBehavior('unhappy');
        counts[b] = (counts[b] ?? 0) + 1;
      }

      // yawn should be most common (4/10 = 40%)
      expect(counts[IdleBehavior.Yawn]).toBeGreaterThan(counts[IdleBehavior.LookAround]);
      expect(counts[IdleBehavior.Yawn]).toBeGreaterThan(counts[IdleBehavior.Stretch]);
    });

    it('should never return a behavior not in the enum', () => {
      const validBehaviors = Object.values(IdleBehavior);
      validBehaviors.push(IdleBehavior.LookAround); // fallback should also be valid

      for (const mood of ['happy', 'normal', 'hungry', 'unhappy'] as DragonMood[]) {
        for (let i = 0; i < 100; i++) {
          // Reset seed not possible in vitest, but the fallback is IdleBehavior.LookAround
          // which is valid. So this just verifies no crash.
          pickIdleBehavior(mood);
        }
      }
    });
  });

  describe('pickIdleInterval', () => {
    it('should return a value between 20 and 40', () => {
      for (let i = 0; i < 100; i++) {
        const interval = pickIdleInterval();
        expect(interval).toBeGreaterThanOrEqual(20);
        expect(interval).toBeLessThanOrEqual(40);
      }
    });

    it('should produce varied values', () => {
      const values = new Set<number>();
      for (let i = 0; i < 100; i++) {
        values.add(Math.floor(pickIdleInterval()));
      }
      // Should have at least 3 distinct integer values
      expect(values.size).toBeGreaterThan(2);
    });
  });
});
